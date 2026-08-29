import { describe, expect, it } from "vitest";
import { buildCronReplyHook } from "./delivery-outbound.runtime.js";

describe("buildCronReplyHook", () => {
  it("binds the final hook to the exact cron delivery target and session", () => {
    expect(
      buildCronReplyHook({ channel: "telegram", accountId: "ops", to: "123456" }, "agent:main"),
    ).toEqual({
      kind: "final",
      channel: "telegram",
      sessionKey: "agent:main",
      context: {
        channelId: "telegram",
        accountId: "ops",
        conversationId: "123456",
        sessionKey: "agent:main",
      },
    });
  });
});
