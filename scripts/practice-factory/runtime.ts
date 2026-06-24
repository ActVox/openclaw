import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import {
  assertPracticePackSpec,
  validatePracticePackSpec,
  type PracticePackSpec,
  type ValidationResult,
} from "./schema.js";

export interface LoadPracticePackOptions {
  repoRoot?: string;
}

export interface ScaffoldPracticePackOptions {
  specPath: string;
  outDir?: string;
  repoRoot?: string;
}

export interface ScaffoldSkillWorkshopProposalOptions {
  specPath: string;
  outDir: string;
  repoRoot?: string;
}

export async function loadPracticePackSpec(specPath: string): Promise<PracticePackSpec> {
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

  const files = [
    join(proposalDir, "PROPOSAL.md"),
    join(proposalDir, "references", "pack", "PACK.yaml"),
    join(proposalDir, "references", "scenarios", "phase1.jsonl"),
    join(proposalDir, "references", "evals", "rubric.md"),
    join(proposalDir, "references", "evals", "expected-output-shape.json"),
  ];

  await writeFile(
    files[0],
    renderSkill(spec).replace(
      /^---\n/mu,
      `---\nstatus: proposal\nversion: "${spec.version}"\ndate: "${new Date(0).toISOString()}"\n`,
    ),
  );
  await writeFile(files[1], `${YAML.stringify(spec, { lineWidth: 100 })}`);
  await writeFile(files[2], renderScenarios(spec));
  await writeFile(files[3], renderRubric(spec));
  await writeFile(
    files[4],
    `${JSON.stringify({ sections: spec.output_schema.sections }, null, 2)}\n`,
  );

  return { proposalDir, files };
}

async function writePackFiles(spec: PracticePackSpec, packDir: string): Promise<string[]> {
  const files = [
    join(packDir, "PACK.yaml"),
    join(packDir, "SKILL.md"),
    join(packDir, "scenarios", "phase1.jsonl"),
    join(packDir, "evals", "rubric.md"),
    join(packDir, "evals", "expected-output-shape.json"),
    join(packDir, "references", "README.md"),
  ];

  await mkdir(join(packDir, "scenarios"), { recursive: true });
  await mkdir(join(packDir, "evals"), { recursive: true });
  await mkdir(join(packDir, "references"), { recursive: true });

  await writeFile(files[0], `${YAML.stringify(spec, { lineWidth: 100 })}`);
  await writeFile(files[1], renderSkill(spec));
  await writeFile(files[2], renderScenarios(spec));
  await writeFile(files[3], renderRubric(spec));
  await writeFile(
    files[4],
    `${JSON.stringify({ sections: spec.output_schema.sections }, null, 2)}\n`,
  );
  await writeFile(files[5], renderReferencesReadme(spec));
  return files;
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
