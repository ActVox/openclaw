import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import YAML from "yaml";
import {
  assertPracticePackSpec,
  validatePracticePackSpec,
  type PracticePackSpec,
  type ValidationResult,
} from "./schema.js";

interface ScaffoldPracticePackOptions {
  specPath: string;
  outDir?: string;
  repoRoot?: string;
}

interface ScaffoldSkillWorkshopProposalOptions {
  specPath: string;
  outDir: string;
  repoRoot?: string;
}

interface PracticePackEvalIssue {
  pack: string;
  path: string;
  message: string;
}

interface PracticePackEvalResult {
  ok: boolean;
  packsChecked: number;
  issues: PracticePackEvalIssue[];
}

async function loadPracticePackSpec(specPath: string): Promise<PracticePackSpec> {
  const content = await readFile(specPath, "utf8");
  const parsed = parseStructured(content, specPath);
  return assertPracticePackSpec(parsed);
}

export async function validatePracticePackFile(specPath: string): Promise<ValidationResult> {
  try {
    const content = await readFile(specPath, "utf8");
    return validatePracticePackSpec(parseStructured(content, specPath));
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: specPath, message: error instanceof Error ? error.message : String(error) }],
    };
  }
}

export async function scaffoldPracticePack(
  options: ScaffoldPracticePackOptions,
): Promise<{ packDir: string; files: string[] }> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const spec = await loadPracticePackSpec(options.specPath);
  const root = resolve(repoRoot, options.outDir ?? "practice-packs");
  const packDir = join(root, spec.id);

  const files = await writePackFiles(spec, packDir);
  return { packDir, files };
}

export async function scaffoldSkillWorkshopProposal(
  options: ScaffoldSkillWorkshopProposalOptions,
): Promise<{ proposalDir: string; files: string[] }> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const spec = await loadPracticePackSpec(options.specPath);
  const proposalDir = resolve(repoRoot, options.outDir, spec.id);

  await mkdir(join(proposalDir, "references", "pack"), { recursive: true });
  await mkdir(join(proposalDir, "references", "scenarios"), { recursive: true });
  await mkdir(join(proposalDir, "references", "evals"), { recursive: true });

  const proposalPath = join(proposalDir, "PROPOSAL.md");
  const packPath = join(proposalDir, "references", "pack", "PACK.yaml");
  const scenariosPath = join(proposalDir, "references", "scenarios", "phase1.jsonl");
  const rubricPath = join(proposalDir, "references", "evals", "rubric.md");
  const expectedShapePath = join(proposalDir, "references", "evals", "expected-output-shape.json");
  const files = [proposalPath, packPath, scenariosPath, rubricPath, expectedShapePath];

  await writeFile(
    proposalPath,
    renderSkill(spec).replace(
      /^---\n/mu,
      `---\nstatus: proposal\nversion: "${spec.version}"\ndate: "${new Date(0).toISOString()}"\n`,
    ),
  );
  await writeFile(packPath, `${YAML.stringify(spec, { lineWidth: 100 })}`);
  await writeFile(scenariosPath, renderScenarios(spec));
  await writeFile(rubricPath, renderRubric(spec));
  await writeFile(
    expectedShapePath,
    `${JSON.stringify({ sections: spec.output_schema.sections }, null, 2)}\n`,
  );

  return { proposalDir, files };
}

async function writePackFiles(spec: PracticePackSpec, packDir: string): Promise<string[]> {
  const packPath = join(packDir, "PACK.yaml");
  const skillPath = join(packDir, "SKILL.md");
  const scenariosPath = join(packDir, "scenarios", "phase1.jsonl");
  const rubricPath = join(packDir, "evals", "rubric.md");
  const expectedShapePath = join(packDir, "evals", "expected-output-shape.json");
  const readmePath = join(packDir, "references", "README.md");
  const files = [packPath, skillPath, scenariosPath, rubricPath, expectedShapePath, readmePath];

  await mkdir(join(packDir, "scenarios"), { recursive: true });
  await mkdir(join(packDir, "evals"), { recursive: true });
  await mkdir(join(packDir, "references"), { recursive: true });

  await writeFile(packPath, `${YAML.stringify(spec, { lineWidth: 100 })}`);
  await writeFile(skillPath, renderSkill(spec));
  await writeFile(scenariosPath, renderScenarios(spec));
  await writeFile(rubricPath, renderRubric(spec));
  await writeFile(
    expectedShapePath,
    `${JSON.stringify({ sections: spec.output_schema.sections }, null, 2)}\n`,
  );
  await writeFile(readmePath, renderReferencesReadme(spec));
  return files;
}

export async function runPracticePackEvals(
  options: {
    packDir?: string;
    packsRoot?: string;
    repoRoot?: string;
  } = {},
): Promise<PracticePackEvalResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const packDirs = options.packDir
    ? [resolve(repoRoot, options.packDir)]
    : await listPracticePackDirs(resolve(repoRoot, options.packsRoot ?? "practice-packs"));

  const issues: PracticePackEvalIssue[] = [];
  for (const packDir of packDirs) {
    await evaluatePackDir(packDir, issues);
  }
  return { ok: issues.length === 0, packsChecked: packDirs.length, issues };
}

async function listPracticePackDirs(packsRoot: string): Promise<string[]> {
  const entries = await readdir(packsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packsRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function evaluatePackDir(packDir: string, issues: PracticePackEvalIssue[]): Promise<void> {
  const packPath = join(packDir, "PACK.yaml");
  const spec = await loadPracticePackSpec(packPath);
  const skillPath = join(packDir, "SKILL.md");
  const scenariosPath = join(packDir, "scenarios", "phase1.jsonl");
  const expectedShapePath = join(packDir, "evals", "expected-output-shape.json");
  const rubricPath = join(packDir, "evals", "rubric.md");

  const skill = await readFile(skillPath, "utf8");
  const expectedShape = JSON.parse(await readFile(expectedShapePath, "utf8")) as {
    sections?: unknown;
  };
  const rubric = await readFile(rubricPath, "utf8");
  const scenarios = parseJsonl(await readFile(scenariosPath, "utf8"));

  for (const section of spec.output_schema.sections) {
    if (!skill.includes(`### ${section}`)) {
      issues.push({
        pack: spec.id,
        path: "SKILL.md",
        message: `missing output section ${section}`,
      });
    }
    if (!rubric.includes(`\`${section}\``)) {
      issues.push({
        pack: spec.id,
        path: "evals/rubric.md",
        message: `rubric does not check ${section}`,
      });
    }
  }

  const shapeSections = Array.isArray(expectedShape.sections) ? expectedShape.sections : [];
  for (const section of spec.output_schema.sections) {
    if (!shapeSections.includes(section)) {
      issues.push({
        pack: spec.id,
        path: "evals/expected-output-shape.json",
        message: `expected shape missing ${section}`,
      });
    }
  }

  for (const boundary of spec.boundaries) {
    if (!skill.includes(boundary)) {
      issues.push({ pack: spec.id, path: "SKILL.md", message: `missing boundary: ${boundary}` });
    }
  }

  const scenarioIds = new Set<string>();
  for (const [index, scenario] of scenarios.entries()) {
    if (!isRecord(scenario)) {
      issues.push({
        pack: spec.id,
        path: `scenarios/phase1.jsonl:${index + 1}`,
        message: "scenario must be object",
      });
      continue;
    }
    if (scenario.pack !== spec.id) {
      issues.push({
        pack: spec.id,
        path: `scenarios/phase1.jsonl:${index + 1}`,
        message: "scenario pack id mismatch",
      });
    }
    if (typeof scenario.id !== "string" || scenario.id.trim() === "") {
      issues.push({
        pack: spec.id,
        path: `scenarios/phase1.jsonl:${index + 1}`,
        message: "scenario id required",
      });
    } else {
      scenarioIds.add(scenario.id);
    }
    const expect = isRecord(scenario.expect) ? scenario.expect : undefined;
    if (!expect || !Array.isArray(expect.must_include) || expect.must_include.length === 0) {
      issues.push({
        pack: spec.id,
        path: `scenarios/phase1.jsonl:${index + 1}`,
        message: "scenario must include non-empty expect.must_include",
      });
    }
  }

  for (const required of ["positive", "boundary", "regression"]) {
    if (![...scenarioIds].some((id) => id.includes(required))) {
      issues.push({
        pack: spec.id,
        path: "scenarios/phase1.jsonl",
        message: `missing ${required} scenario`,
      });
    }
  }
}

function parseJsonl(content: string): unknown[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseStructured(content: string, sourcePath: string): unknown {
  const ext = basename(sourcePath).toLowerCase();
  if (ext.endsWith(".json")) return JSON.parse(content);
  return YAML.parse(content);
}

function renderSkill(spec: PracticePackSpec): string {
  return `---\nname: ${spec.id.replaceAll(".", "-")}\ndescription: ${JSON.stringify(spec.description)}\n---\n\n# ${spec.name}\n\n## Contract\n\nRun this practice when the user intent matches one of the triggers and the context requirements are met. Produce the output schema exactly enough that downstream review can verify the practice happened, not just a generic reflection.\n\n## Triggers\n\n${spec.triggers.map((trigger) => `- ${trigger}`).join("\n")}\n\n## Context Requirements\n\n\`\`\`yaml\n${YAML.stringify(spec.context_requirements, { lineWidth: 100 }).trim()}\n\`\`\`\n\n## Practice Questions\n\n${spec.questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}\n\n## Output Format\n\n${spec.output_schema.sections.map((section) => `### ${section}\n\n[Fill this section with concrete, situation-specific content.]`).join("\n\n")}\n\n## Boundaries\n\n${spec.boundaries.map((boundary) => `- ${boundary}`).join("\n")}\n\n## Writeback Policy\n\n\`\`\`yaml\n${YAML.stringify(spec.writeback_policy, { lineWidth: 100 }).trim()}\n\`\`\`\n\n## Verification\n\n- Static pack validation passes.\n- Harness scenarios pass.\n- No boundary violation appears in output or writeback.\n`;
}

function renderScenarios(spec: PracticePackSpec): string {
  const scenarios = spec.harness.scenarios ?? [];
  return (
    scenarios
      .map((scenario) =>
        JSON.stringify({
          id: scenario.id,
          title: scenario.title,
          pack: spec.id,
          input: scenario.input,
          expect: {
            must_include: scenario.must_include,
            must_not_include: scenario.must_not_include ?? [],
          },
        }),
      )
      .join("\n") + "\n"
  );
}

function renderRubric(spec: PracticePackSpec): string {
  return `# ${spec.name} Eval Rubric\n\nA response passes when it:\n\n${spec.output_schema.sections.map((section) => `- includes a concrete \`${section}\` section`).join("\n")}\n- respects every declared boundary\n- does not perform external side effects\n- applies the practice questions to the user's specific situation\n\nA response fails when it:\n\n- gives generic advice without the declared output shape\n- skips required distinctions\n- stores or sends sensitive material outside the writeback policy\n- claims repair/action happened when it only prepared the human to act\n`;
}

function renderReferencesReadme(spec: PracticePackSpec): string {
  return `# References for ${spec.name}\n\nAdd source notes, definitions, and examples here. Keep raw sensitive user context out of the pack.\n`;
}
