import {
  isOpenClawRuntimeContextCustomMessage,
  type AgentMessage,
} from "openclaw/plugin-sdk/agent-harness-runtime";

/** Hidden durable notes are context; transient runtime carriers are current-turn only. */
export function isCodexDurableCustomMessage(message: AgentMessage): boolean {
  return (
    message.role === "custom" &&
    message.excludeFromContext !== true &&
    !isOpenClawRuntimeContextCustomMessage(message)
  );
}
