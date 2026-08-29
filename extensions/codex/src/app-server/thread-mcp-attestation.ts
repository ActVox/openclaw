import type { CodexAppServerClient } from "./client.js";
import { isJsonObject, type JsonObject } from "./protocol.js";

export async function attestCodexRestrictedToolSurfaceMcpServersDisabled(
  client: Pick<CodexAppServerClient, "request">,
  threadId: string,
  threadConfig: JsonObject | undefined,
  signal?: AbortSignal,
  allowActiveConfiguredServers = false,
): Promise<void> {
  const configuredServers = threadConfig?.mcp_servers;
  if (configuredServers !== undefined && !isJsonObject(configuredServers)) {
    throw new Error("Codex restricted-tool-surface thread config has invalid mcp_servers");
  }
  // Codex reports configured-but-disabled servers as inactive status rows.
  // Agent-scoped per-thread servers may remain active when the restriction is a
  // normal tool policy; ring-zero and message-only callers keep the default.
  const expectedDisabledServerNames = new Set<string>();
  const expectedActiveServerNames = new Set<string>();
  for (const [name, serverConfig] of Object.entries(configuredServers ?? {})) {
    if (!isJsonObject(serverConfig)) {
      throw new Error(`Codex restricted-tool-surface MCP server ${name} has invalid config`);
    }
    if (serverConfig.enabled === false) {
      expectedDisabledServerNames.add(name);
      continue;
    }
    if (!allowActiveConfiguredServers) {
      throw new Error(`Codex restricted-tool-surface MCP server ${name} is not disabled`);
    }
    expectedActiveServerNames.add(name);
  }
  const response = await client.request(
    "mcpServerStatus/list",
    { threadId, detail: "toolsAndAuthOnly" },
    { signal },
  );
  if (!isJsonObject(response) || !Array.isArray(response.data)) {
    throw new Error(
      "Codex mcpServerStatus/list returned an invalid restricted-tool-surface attestation",
    );
  }
  const observedDisabledServerNames = new Set<string>();
  const observedActiveServerNames = new Set<string>();
  for (const status of response.data) {
    if (!isJsonObject(status) || typeof status.name !== "string" || !isJsonObject(status.tools)) {
      throw new Error(
        "Codex mcpServerStatus/list returned an invalid restricted-tool-surface server",
      );
    }
    if (expectedActiveServerNames.has(status.name)) {
      if (observedActiveServerNames.has(status.name)) {
        throw new Error(
          `Codex restricted-tool-surface MCP attestation returned duplicate server ${status.name}`,
        );
      }
      observedActiveServerNames.add(status.name);
      if (!isJsonObject(status.serverInfo)) {
        throw new Error(
          `Codex restricted-tool-surface MCP attestation found inactive allowed server ${status.name}`,
        );
      }
      continue;
    }
    if (!expectedDisabledServerNames.has(status.name)) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation found unexpected server ${status.name}`,
      );
    }
    if (observedDisabledServerNames.has(status.name)) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation returned duplicate server ${status.name}`,
      );
    }
    observedDisabledServerNames.add(status.name);
    if (!Object.hasOwn(status, "serverInfo")) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation returned malformed server ${status.name}`,
      );
    }
    if (status.serverInfo !== null) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation found active server ${status.name}`,
      );
    }
    if (Object.keys(status.tools).length > 0) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation found tools for server ${status.name}`,
      );
    }
  }
  for (const expectedName of expectedDisabledServerNames) {
    if (!observedDisabledServerNames.has(expectedName)) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation is missing server ${expectedName}`,
      );
    }
  }
  for (const expectedName of expectedActiveServerNames) {
    if (!observedActiveServerNames.has(expectedName)) {
      throw new Error(
        `Codex restricted-tool-surface MCP attestation is missing allowed server ${expectedName}`,
      );
    }
  }
  if (response.nextCursor !== undefined && response.nextCursor !== null) {
    throw new Error("Codex mcpServerStatus/list returned an invalid empty-page cursor");
  }
}
