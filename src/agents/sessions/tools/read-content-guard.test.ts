import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { createReadToolDefinition } from "./read.js";

function encodeUtf16WithBom(text: string, endian: "le" | "be"): Buffer {
  const payload = Buffer.from(text, "utf16le");
  if (endian === "be") {
    payload.swap16();
  }
  return Buffer.concat([Buffer.from(endian === "le" ? [0xff, 0xfe] : [0xfe, 0xff]), payload]);
}

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("read content guard", () => {
  it.each(["voice.ogg", "voice.txt"])(
    "rejects OGG audio bytes before text decoding for %s",
    async (filePath) => {
      const oggOpus = Buffer.alloc(47);
      oggOpus.write("OggS", 0, "ascii");
      oggOpus[5] = 2;
      oggOpus.writeUInt32LE(1, 14);
      oggOpus[26] = 1;
      oggOpus[27] = 19;
      oggOpus.write("OpusHead", 28, "ascii");
      const decodeText = vi.fn(() => "must not decode");
      const tool = createReadToolDefinition("/workspace", {
        operations: {
          access: async () => {},
          decodeText,
          detectImageMimeType: async () => null,
          readFile: async () => oggOpus,
        },
      });

      await expect(
        tool.execute("call-audio", { path: filePath }, undefined, undefined, {} as never),
      ).rejects.toThrow(/audio\/ogg.*text and image files/i);
      expect(decodeText).not.toHaveBeenCalled();
    },
  );

  it("rejects unrecognized binary content after decoding", async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x7f]);
    const decodeText = vi.fn(({ buffer }: { buffer: Buffer }) => buffer.toString("utf8"));
    const tool = createReadToolDefinition("/workspace", {
      operations: {
        access: async () => {},
        decodeText,
        detectImageMimeType: async () => null,
        readFile: async () => binary,
      },
    });

    await expect(
      tool.execute("call-binary", { path: "payload.txt" }, undefined, undefined, {} as never),
    ).rejects.toThrow(/binary content.*text and image files/i);
    expect(decodeText).toHaveBeenCalledOnce();
  });

  it("rejects sparse NUL bytes regardless of printable-text ratio", async () => {
    const tool = createReadToolDefinition("/workspace", {
      operations: {
        access: async () => {},
        decodeText: ({ buffer }) => buffer.toString("utf8"),
        detectImageMimeType: async () => null,
        readFile: async () => Buffer.from(`${"a".repeat(200)}\0tail`),
      },
    });

    await expect(
      tool.execute("call-nul", { path: "payload.txt" }, undefined, undefined, {} as never),
    ).rejects.toThrow(/binary content.*text and image files/i);
  });

  it("uses content rather than a document extension to classify text", async () => {
    const tool = createReadToolDefinition("/workspace", {
      operations: {
        access: async () => {},
        decodeText: ({ buffer }) => buffer.toString("utf8"),
        detectImageMimeType: async () => null,
        readFile: async () => Buffer.from("plain text under a misleading extension"),
      },
    });

    const result = await tool.execute(
      "call-text-pdf",
      { path: "notes.pdf" },
      undefined,
      undefined,
      {} as never,
    );
    expect(textContent(result)).toContain("plain text under a misleading extension");
  });

  it("accepts valid text produced by a custom decoder for unknown bytes", async () => {
    const decodeText = vi.fn(() => "decoded � text");
    const tool = createReadToolDefinition("/workspace", {
      operations: {
        access: async () => {},
        decodeText,
        detectImageMimeType: async () => null,
        readFile: async () => Buffer.from([0x00, 0xff, 0x00, 0xfe]),
      },
    });

    const result = await tool.execute(
      "call-custom-decoder",
      { path: "remote.payload" },
      undefined,
      undefined,
      {} as never,
    );
    expect(textContent(result)).toContain("decoded � text");
    expect(decodeText).toHaveBeenCalledOnce();
  });

  it("lets a custom decoder handle UTF-16LE text with a BOM", async () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("custom decoder text", "utf16le"),
    ]);
    const decodeText = vi.fn(({ buffer }: { buffer: Buffer }) =>
      buffer.subarray(2).toString("utf16le"),
    );
    const tool = createReadToolDefinition("/workspace", {
      operations: {
        access: async () => {},
        decodeText,
        detectImageMimeType: async () => null,
        readFile: async () => utf16,
      },
    });

    const result = await tool.execute(
      "call-utf16",
      { path: "utf16.txt" },
      undefined,
      undefined,
      {} as never,
    );
    expect(textContent(result)).toContain("custom decoder text");
    expect(decodeText).toHaveBeenCalledOnce();
  });

  it.each(["le", "be"] as const)(
    "decodes UTF-16%s BOM text without an injected decoder",
    async (endian) => {
      const tool = createReadToolDefinition("/workspace", {
        operations: {
          access: async () => {},
          detectImageMimeType: async () => null,
          readFile: async () => encodeUtf16WithBom("default decoder text", endian),
        },
      });

      const result = await tool.execute(
        `call-utf16-${endian}`,
        { path: `utf16-${endian}.txt` },
        undefined,
        undefined,
        {} as never,
      );
      expect(textContent(result)).toContain("default decoder text");
    },
  );

  it("accepts a literal Unicode replacement character from valid UTF-8 bytes", async () => {
    const tool = createReadToolDefinition("/workspace", {
      operations: {
        access: async () => {},
        detectImageMimeType: async () => null,
        readFile: async () => Buffer.from("a�b", "utf8"),
      },
    });

    const result = await tool.execute(
      "call-literal-replacement",
      { path: "valid.txt" },
      undefined,
      undefined,
      {} as never,
    );
    expect(textContent(result)).toContain("a�b");
  });
});
