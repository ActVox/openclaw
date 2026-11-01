import type { AgentMessage } from "openclaw/plugin-sdk/agent-harness-runtime";
import { describe, expect, it } from "vitest";
import { CodexHistoryRejection } from "./history-rejection.js";
import { projectSettledCodexMessages } from "./settled-turn-projection.js";
import { attachUpstreamUserText } from "./upstream-prompt-provenance.js";

function message(value: unknown): AgentMessage {
  return value as AgentMessage;
}

function toolCall(id = "call-1"): AgentMessage {
  return message({
    role: "assistant",
    content: [
      { type: "thinking", thinking: "private reasoning" },
      { type: "toolCall", id, name: "message", arguments: { action: "send" } },
    ],
  });
}

function toolResult(
  id = "call-1",
  content: unknown = [{ type: "text", text: "Message sent." }],
): AgentMessage {
  return message({
    role: "toolResult",
    toolCallId: id,
    toolName: "message",
    content,
  });
}

describe("projectSettledCodexMessages", () => {
  it("projects a canonical completed tool exchange without exposing reasoning", () => {
    expect(
      projectSettledCodexMessages([
        message({ role: "user", content: "Send the update." }),
        message({
          role: "assistant",
          content: [{ type: "text", text: "I’ll send it now." }],
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Send the update." }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "I’ll send it now." }],
      },
      {
        type: "function_call",
        call_id: "call-1",
        name: "message",
        arguments: '{"action":"send"}',
      },
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "Message sent.",
      },
    ]);
  });

  it("accepts Codex's enriched mirrored tool-result block", () => {
    expect(
      projectSettledCodexMessages([
        toolCall(),
        toolResult("call-1", [
          {
            type: "toolResult",
            toolCallId: "call-1",
            content: "Telegram delivery complete.",
          },
        ]),
      ]),
    ).toEqual([
      expect.objectContaining({ type: "function_call", call_id: "call-1" }),
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "Telegram delivery complete.",
      },
    ]);
  });

  it("projects dotted namespaced tool names recorded from Codex MCP calls", () => {
    const name = "codex_apps.slack.slack_send";
    expect(
      projectSettledCodexMessages([
        message({
          role: "assistant",
          content: [{ type: "toolCall", id: "call-1", name, arguments: { channel: "C1" } }],
        }),
        message({
          role: "toolResult",
          toolCallId: "call-1",
          toolName: name,
          content: [{ type: "text", text: "Sent." }],
        }),
      ]),
    ).toEqual([
      { type: "function_call", call_id: "call-1", name, arguments: '{"channel":"C1"}' },
      { type: "function_call_output", call_id: "call-1", output: "Sent." },
    ]);
  });

  it("rejects invalid tool names without including transcript text", () => {
    expect(() =>
      projectSettledCodexMessages([
        message({
          role: "assistant",
          content: [{ type: "toolCall", id: "call-1", name: "bad tool", arguments: {} }],
        }),
        message({
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "bad tool",
          content: [{ type: "text", text: "failed" }],
        }),
      ]),
    ).toThrowError(new CodexHistoryRejection("invalid_content"));
  });

  it("preserves failed tool-result status in the projected output", () => {
    expect(
      projectSettledCodexMessages([
        toolCall(),
        message({
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "message",
          isError: true,
          content: [{ type: "text", text: "Delivery failed." }],
        }),
      ]).at(-1),
    ).toEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: "[Tool result status: error]\nDelivery failed.",
    });
  });

  it("preserves an empty failed tool result as failure evidence", () => {
    expect(
      projectSettledCodexMessages([
        toolCall(),
        message({
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "message",
          isError: true,
          content: [],
        }),
      ]).at(-1),
    ).toEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: "[Tool result status: error]\nTool failed without textual output.",
    });
  });

  it("does not charge the synthetic failure marker against the source text limit", () => {
    const resultText = "x".repeat(64 * 1024);
    const output = projectSettledCodexMessages([
      toolCall(),
      message({
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "message",
        isError: true,
        content: [{ type: "text", text: resultText }],
      }),
    ]).at(-1) as { output?: string };

    expect(output.output).toBe(`[Tool result status: error]\n${resultText}`);
  });

  it("preserves exact whitespace in projected transcript text", () => {
    expect(
      projectSettledCodexMessages([
        message({ role: "user", content: "  user input\n" }),
        message({ role: "assistant", content: [{ type: "text", text: "\tassistant output\n" }] }),
        toolCall(),
        toolResult("call-1", [{ type: "text", text: "  tool output\n" }]),
      ]),
    ).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "  user input\n" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "\tassistant output\n" }],
      },
      expect.objectContaining({ type: "function_call", call_id: "call-1" }),
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "  tool output\n",
      },
    ]);
  });

  it.each([
    { count: 205, text: "old", error: "item_limit" },
    { count: 9, text: "x".repeat(60 * 1024), error: "byte_limit" },
  ])("stops acquiring later payloads after $error", ({ count, text, error }) => {
    let laterReads = 0;
    const later = message({
      role: "user",
      get content() {
        laterReads += 1;
        return "must not acquire this later payload";
      },
    });
    const oldMessages = Array.from({ length: count }, () =>
      message({ role: "user", content: text }),
    );
    expect(() =>
      projectSettledCodexMessages([...oldMessages, later, toolCall(), toolResult()]),
    ).toThrow(error);
    expect(laterReads).toBe(0);
  });

  it("prefers the undecorated upstream user text", () => {
    expect(
      projectSettledCodexMessages([
        message({
          role: "user",
          content: "[Telegram metadata] decorated prompt",
          __openclaw: { upstreamUserText: "Send the Aurora notice to Erin." },
        }),
        toolCall(),
        toolResult(),
      ])[0],
    ).toEqual({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Send the Aurora notice to Erin." }],
    });
  });

  it("preserves upstream user text above the ordinary message limit", () => {
    const upstreamUserText = "x".repeat(64 * 1024 + 1);

    expect(
      projectSettledCodexMessages([
        attachUpstreamUserText(
          message({ role: "user", content: "[Telegram metadata] decorated prompt" }),
          upstreamUserText,
        ),
        toolCall(),
        toolResult(),
      ])[0],
    ).toEqual({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: upstreamUserText }],
    });
  });

  it("rejects upstream user text above the projection limit", () => {
    expect(() =>
      projectSettledCodexMessages([
        attachUpstreamUserText(
          message({ role: "user", content: "[Telegram metadata] decorated prompt" }),
          "x".repeat(512 * 1024 + 1),
        ),
        toolCall(),
        toolResult(),
      ]),
    ).toThrow("field_limit");
  });

  it("charges upstream user text against the aggregate byte limit", () => {
    expect(() =>
      projectSettledCodexMessages([
        attachUpstreamUserText(
          message({ role: "user", content: "decorated" }),
          "x".repeat(400 * 1024),
        ),
        message({ role: "user", content: "x".repeat(60 * 1024) }),
        message({ role: "user", content: "x".repeat(60 * 1024) }),
        toolCall(),
        toolResult(),
      ]),
    ).toThrow("byte_limit");
  });

  it("does not let provenance hide non-text user content", () => {
    expect(() =>
      projectSettledCodexMessages([
        message({
          role: "user",
          content: [
            { type: "text", text: "Send the notice." },
            { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
          ],
          __openclaw: { upstreamUserText: "Send the notice." },
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toThrow("unsupported_user_image");
  });

  it.each([
    { name: "orphan result", messages: [toolResult()] },
    { name: "missing result", messages: [toolCall()] },
    { name: "duplicate call id", messages: [toolCall(), toolCall(), toolResult()] },
    {
      name: "tool-name mismatch",
      messages: [
        toolCall(),
        message({
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "different",
          content: [{ type: "text", text: "done" }],
        }),
      ],
    },
  ])("fails closed for $name", ({ messages }) => {
    expect(() => projectSettledCodexMessages(messages)).toThrowError(CodexHistoryRejection);
  });

  it("skips transient runtime-context custom messages without losing settled tool evidence", () => {
    expect(
      projectSettledCodexMessages([
        message({
          role: "custom",
          customType: "openclaw.runtime-context",
          display: false,
          content: "Internal runtime context that must not become replay history.",
          timestamp: 1,
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toEqual([
      expect.objectContaining({ type: "function_call", call_id: "call-1" }),
      { type: "function_call_output", call_id: "call-1", output: "Message sent." },
    ]);
  });

  it("serializes durable custom text as replay input", () => {
    expect(
      projectSettledCodexMessages([
        message({
          role: "custom",
          customType: "plugin.note",
          display: false,
          content: "Durable note for finalization.",
          timestamp: 1,
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Durable note for finalization." }],
      },
      expect.objectContaining({ type: "function_call", call_id: "call-1" }),
      { type: "function_call_output", call_id: "call-1", output: "Message sent." },
    ]);
  });

  it.each([
    {
      name: "unknown role",
      value: { role: "future-role", content: "unknown" },
      reason: "unsupported_content",
    },
    {
      name: "custom image evidence",
      value: {
        role: "custom",
        customType: "plugin.note",
        display: false,
        content: [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }],
      },
      reason: "unsupported_user_image",
    },
    {
      name: "unknown custom block",
      value: {
        role: "custom",
        customType: "plugin.note",
        display: false,
        content: [{ type: "future-block" }],
      },
      reason: "unsupported_content",
    },
  ])(
    "rejects $name instead of silently dropping it during custom-message conversion",
    ({ value, reason }) => {
      expect(() => projectSettledCodexMessages([message(value), toolCall(), toolResult()])).toThrow(
        expect.objectContaining({ reason }),
      );
    },
  );

  it("serializes visible built-in transcript records", () => {
    expect(
      projectSettledCodexMessages([
        message({
          role: "bashExecution",
          command: "printf fixture",
          output: "fixture output",
          exitCode: 0,
          cancelled: false,
          truncated: false,
          timestamp: 1,
        }),
        message({
          role: "branchSummary",
          summary: "Returned from the fixture branch.",
          fromId: "branch-1",
          timestamp: 2,
        }),
        message({
          role: "compactionSummary",
          summary: "Earlier fixture context.",
          tokensBefore: 10,
          timestamp: 3,
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Ran `printf fixture`\n```\nfixture output\n```" }],
      },
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "The following is a summary of a branch that this conversation came back from:\n\n<summary>\nReturned from the fixture branch.</summary>",
          },
        ],
      },
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "The conversation history before this point was compacted into the following summary:\n\n<summary>\nEarlier fixture context.\n</summary>",
          },
        ],
      },
      expect.objectContaining({ type: "function_call", call_id: "call-1" }),
      { type: "function_call_output", call_id: "call-1", output: "Message sent." },
    ]);
  });

  it("skips an explicitly excluded shell transcript", () => {
    expect(
      projectSettledCodexMessages([
        message({
          role: "bashExecution",
          command: "printf hidden",
          output: "private output",
          exitCode: 0,
          cancelled: false,
          truncated: false,
          excludeFromContext: true,
          timestamp: 1,
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toEqual([
      expect.objectContaining({ type: "function_call", call_id: "call-1" }),
      { type: "function_call_output", call_id: "call-1", output: "Message sent." },
    ]);
  });

  it("keeps shell transcript text within the field budget", () => {
    expect(() =>
      projectSettledCodexMessages([
        message({
          role: "bashExecution",
          command: "printf fixture",
          output: "x".repeat(64 * 1024),
          exitCode: 0,
          cancelled: false,
          truncated: false,
          timestamp: 1,
        }),
        toolCall(),
        toolResult(),
      ]),
    ).toThrow("field_limit");
  });

  it("preserves valid image tool results as bounded non-vision evidence", () => {
    expect(
      projectSettledCodexMessages([
        toolCall(),
        toolResult("call-1", [
          { type: "text", text: "Generated the requested asset." },
          { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
        ]),
      ]).at(-1),
    ).toEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: "Generated the requested asset.\n[Image tool result: image/png]",
    });
  });

  it("rejects oversized text instead of truncating it", () => {
    expect(() =>
      projectSettledCodexMessages([
        message({ role: "user", content: "x".repeat(64 * 1024 + 1) }),
        toolCall(),
        toolResult(),
      ]),
    ).toThrow("field_limit");
  });

  it("rejects a complete transcript above the aggregate byte limit", () => {
    const messages = Array.from({ length: 9 }, () =>
      message({ role: "user", content: "x".repeat(60 * 1024) }),
    );
    expect(() => projectSettledCodexMessages([...messages, toolCall(), toolResult()])).toThrow(
      "byte_limit",
    );
  });
});
