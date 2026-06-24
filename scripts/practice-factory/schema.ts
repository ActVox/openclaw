export type PracticePackStatus = "draft" | "active" | "deprecated";

export interface PracticePackSpec {
  id: string;
  name: string;
  version: string;
  status: PracticePackStatus;
  description: string;
  contours: string[];
  agents: string[];
  triggers: string[];
  context_requirements: Record<string, unknown>;
  questions: string[];
  output_schema: {
    sections: string[];
  };
  boundaries: string[];
  writeback_policy: Record<string, unknown>;
  harness: {
    suites: string[];
    scenarios?: PracticePackScenario[];
  };
}

export interface PracticePackScenario {
  id: string;
  title: string;
  input: string;
  must_include: string[];
  must_not_include?: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const ID_RE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const SEMVERISH_RE = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/u;
const VALID_STATUSES = new Set<PracticePackStatus>(["draft", "active", "deprecated"]);

const REQUIRED_SCENARIO_KINDS = ["positive", "boundary", "regression"] as const;

export function validatePracticePackSpec(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "pack must be an object" }] };
  }

  requireString(
    value,
    "id",
    issues,
    (id) => ID_RE.test(id),
    "must be slug-like, e.g. bateson.relationship-pattern-map",
  );
  requireString(value, "name", issues);
  requireString(
    value,
    "version",
    issues,
    (version) => SEMVERISH_RE.test(version),
    "must be semver-like, e.g. 0.1.0",
  );
  requireString(value, "description", issues);
  requireString(
    value,
    "status",
    issues,
    (status) => VALID_STATUSES.has(status as PracticePackStatus),
    "must be draft, active, or deprecated",
  );
  requireStringArray(value, "contours", issues, { min: 1 });
  requireStringArray(value, "agents", issues, { min: 1 });
  requireStringArray(value, "triggers", issues, { min: 3 });
  requireRecord(value, "context_requirements", issues);
  requireStringArray(value, "questions", issues, { min: 3 });
  requireStringArray(value, "boundaries", issues, { min: 2 });
  requireRecord(value, "writeback_policy", issues);
  validateOutputSchema(value.output_schema, issues);
  validateHarness(value.harness, issues);

  return { ok: issues.length === 0, issues };
}

export function assertPracticePackSpec(value: unknown): PracticePackSpec {
  const result = validatePracticePackSpec(value);
  if (!result.ok) {
    const rendered = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Invalid practice pack spec:\n${rendered}`);
  }
  return value as PracticePackSpec;
}

function validateOutputSchema(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "output_schema", message: "must be an object" });
    return;
  }
  requireStringArray(value, "sections", issues, { pathPrefix: "output_schema", min: 1 });
}

function validateHarness(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "harness", message: "must be an object" });
    return;
  }
  requireStringArray(value, "suites", issues, { pathPrefix: "harness", min: 1 });

  const scenarios = value.scenarios;
  if (scenarios === undefined) return;
  if (!Array.isArray(scenarios)) {
    issues.push({ path: "harness.scenarios", message: "must be an array when present" });
    return;
  }
  if (scenarios.length < REQUIRED_SCENARIO_KINDS.length) {
    issues.push({
      path: "harness.scenarios",
      message: "must include positive, boundary, and regression scenarios",
    });
  }

  const ids = new Set<string>();
  for (const [index, scenario] of scenarios.entries()) {
    const base = `harness.scenarios[${index}]`;
    if (!isRecord(scenario)) {
      issues.push({ path: base, message: "must be an object" });
      continue;
    }
    requireString(scenario, "id", issues, undefined, undefined, base);
    requireString(scenario, "title", issues, undefined, undefined, base);
    requireString(scenario, "input", issues, undefined, undefined, base);
    requireStringArray(scenario, "must_include", issues, { pathPrefix: base, min: 1 });
    if (scenario.must_not_include !== undefined) {
      requireStringArray(scenario, "must_not_include", issues, { pathPrefix: base, min: 1 });
    }
    if (typeof scenario.id === "string") {
      if (ids.has(scenario.id)) issues.push({ path: `${base}.id`, message: "must be unique" });
      ids.add(scenario.id);
    }
  }

  for (const kind of REQUIRED_SCENARIO_KINDS) {
    if (
      !scenarios.some(
        (scenario) =>
          isRecord(scenario) && typeof scenario.id === "string" && scenario.id.includes(kind),
      )
    ) {
      issues.push({ path: "harness.scenarios", message: `must include a ${kind} scenario id` });
    }
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  predicate?: (value: string) => boolean,
  predicateMessage?: string,
  pathPrefix?: string,
): void {
  const path = pathPrefix ? `${pathPrefix}.${key}` : key;
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ path, message: "must be a non-empty string" });
    return;
  }
  if (predicate && !predicate(value)) {
    issues.push({ path, message: predicateMessage ?? "is invalid" });
  }
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  options: { min?: number; pathPrefix?: string } = {},
): void {
  const path = options.pathPrefix ? `${options.pathPrefix}.${key}` : key;
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }
  const min = options.min ?? 0;
  if (value.length < min) {
    issues.push({ path, message: `must contain at least ${min} item(s)` });
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim() === "") {
      issues.push({ path: `${path}[${index}]`, message: "must be a non-empty string" });
    }
  }
}

function requireRecord(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(record[key])) {
    issues.push({ path: key, message: "must be an object" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
