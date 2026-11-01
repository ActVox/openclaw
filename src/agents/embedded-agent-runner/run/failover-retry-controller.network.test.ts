import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sleepWithAbort: vi.fn(async () => {}),
}));

vi.mock("../../../../packages/terminal-core/src/ansi.js", () => ({
  sanitizeForLog: (value: string) => value,
}));
vi.mock("../../../infra/backoff.js", () => ({ sleepWithAbort: mocks.sleepWithAbort }));
vi.mock("../../../infra/diagnostics-timeline.js", () => ({
  emitDiagnosticsTimelineEvent: vi.fn(),
}));
vi.mock("../../auth-profiles.js", () => ({
  markAuthProfileFailure: vi.fn(),
  markInlineProviderApiKeyFailure: vi.fn(),
}));
vi.mock("../../auth-profiles/runtime-materializations.js", () => ({
  revokeRuntimeAuthMaterializations: vi.fn(),
}));
vi.mock("../../failover-error.js", () => ({
  FailoverError: class FailoverError extends Error {},
  resolveFailoverReasonFromError: vi.fn(),
  resolveFailoverStatus: vi.fn(),
}));
vi.mock("../../failover/retry-evidence.js", () => ({
  hasLongWindowRateLimitEvidence: vi.fn(() => false),
}));
vi.mock("../../model-auth.js", () => ({
  isConfigBackedInlineProviderApiKey: vi.fn(() => false),
}));
vi.mock("../logger.js", () => ({ log: { warn: vi.fn() } }));
vi.mock("./auth-profile-failure-policy.js", () => ({
  resolveAuthProfileFailureReason: vi.fn(),
}));

import { createEmbeddedRunFailoverRetryController } from "./failover-retry-controller.js";

function createController(provider: string, networkRetryBudget: { retries: number }) {
  return createEmbeddedRunFailoverRetryController({
    runParams: { runId: "run:network-budget" } as never,
    provider,
    modelId: `${provider}-model`,
    globalLane: "test",
    agentDir: "/tmp/openclaw-network-budget",
    fallbackConfigured: true,
    networkRetryBudget,
    profileFailureStore: { version: 1, profiles: {} },
    getLastProfileId: () => undefined,
    getSessionId: () => "session:network-budget",
    harnessOwnsTransport: () => false,
    getRuntimeAuthOwnerId: () => "embedded",
    getApiKeyInfo: () => null,
    advanceAuthProfile: vi.fn(async () => false),
  });
}

describe("network retry budget", () => {
  beforeEach(() => {
    mocks.sleepWithAbort.mockClear();
  });

  it("bounds sustained DNS/connect failures across fallback candidates", async () => {
    const networkRetryBudget = { retries: 0 };
    const primary = createController("openai", networkRetryBudget);
    const fallback = createController("anthropic", networkRetryBudget);
    primary.observeAttempt({ providerRetryMaxRetries: 2 });
    fallback.observeAttempt({ providerRetryMaxRetries: 2 });

    await expect(
      primary.maybeRetryTransient({ reason: "timeout", networkError: true }),
    ).resolves.toBe(true);
    await expect(
      fallback.maybeRetryTransient({ reason: "timeout", networkError: true }),
    ).resolves.toBe(true);
    await expect(
      primary.maybeRetryTransient({ reason: "timeout", networkError: true }),
    ).resolves.toBe(false);

    expect(networkRetryBudget).toEqual({ retries: 2, maxRetries: 2 });
    expect(mocks.sleepWithAbort).toHaveBeenCalledTimes(2);
  });

  it("keeps a transient recovery retry available", async () => {
    const controller = createController("openai", { retries: 0 });
    controller.observeAttempt({ providerRetryMaxRetries: 1 });

    await expect(
      controller.maybeRetryTransient({ reason: "timeout", networkError: true }),
    ).resolves.toBe(true);
    expect(mocks.sleepWithAbort).toHaveBeenCalledTimes(1);
  });

  it("does not consume the shared endpoint budget for auth or rate limits", async () => {
    const networkRetryBudget = { retries: 0 };
    const controller = createController("openai", networkRetryBudget);
    controller.observeAttempt({ providerRetryMaxRetries: 1 });

    await expect(controller.maybeRetryTransient({ reason: "auth" })).resolves.toBe(false);
    await expect(controller.maybeRetryTransient({ reason: "rate_limit" })).resolves.toBe(true);
    expect(networkRetryBudget).toEqual({ retries: 0 });
  });
});
