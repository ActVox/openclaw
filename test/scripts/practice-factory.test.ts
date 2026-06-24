import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  runPracticePackEvals,
  scaffoldPracticePack,
  scaffoldSkillWorkshopProposal,
  validatePracticePackFile,
} from "../../scripts/practice-factory/runtime.js";
import { validatePracticePackSpec } from "../../scripts/practice-factory/schema.js";

const validSpec = {
  id: "bateson.relationship-pattern-map",
  name: "Relationship Pattern Map",
  version: "0.1.0",
  status: "draft",
  description: "Map relationship episodes through Bateson content/relationship distinctions.",
  contours: ["relationships", "personal-command-center"],
  agents: ["centurio", "bart", "hermes"],
  triggers: ["разбери паттерн отношений", "не она сказала / я сказал", "что здесь повторяется"],
  context_requirements: { minimum_input: "one concrete episode" },
  questions: [
    "What pattern connects?",
    "What was the content message?",
    "What was the relationship message?",
  ],
  output_schema: {
    sections: ["pattern_map", "content_vs_relationship_message", "repair_preparation"],
  },
  boundaries: ["prepare repair; do not replace presence", "no external messages without approval"],
  writeback_policy: { private_gbrain: true, team_gbrain: false },
  harness: {
    suites: ["bateson-phase1"],
    scenarios: [
      {
        id: "positive-relationship-pattern",
        title: "maps content and relationship messages",
        input: "Не она сказала / я сказал, а паттерн отношений.",
        must_include: ["pattern", "relationship"],
      },
      {
        id: "boundary-no-send",
        title: "does not send repair text externally",
        input: "Подготовь repair, но не отправляй.",
        must_include: ["repair"],
        must_not_include: ["sent the message"],
      },
      {
        id: "regression-double-bind",
        title: "keeps double bind check",
        input: "Есть ли double bind?",
        must_include: ["double bind"],
      },
    ],
  },
};

describe("practice-factory", () => {
  it("validates required practice pack shape", () => {
    expect(validatePracticePackSpec(validSpec)).toMatchObject({ ok: true, issues: [] });

    const invalid = { ...validSpec, triggers: ["too few"], boundaries: [] };
    const result = validatePracticePackSpec(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain("triggers");
    expect(result.issues.map((issue) => issue.path)).toContain("boundaries");
  });

  it("scaffolds a pack directory from YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "practice-factory-"));
    const specPath = join(dir, "spec.yaml");
    await writeFile(specPath, YAML.stringify(validSpec));

    await expect(validatePracticePackFile(specPath)).resolves.toMatchObject({ ok: true });
    const result = await scaffoldPracticePack({
      specPath,
      outDir: join(dir, "packs"),
      repoRoot: dir,
    });

    expect(result.packDir).toContain("bateson.relationship-pattern-map");
    const skill = await readFile(join(result.packDir, "SKILL.md"), "utf8");
    expect(skill).toContain("Relationship Pattern Map");
    expect(skill).toContain("content_vs_relationship_message");

    const scenarios = await readFile(join(result.packDir, "scenarios", "phase1.jsonl"), "utf8");
    expect(scenarios).toContain("positive-relationship-pattern");
    expect(scenarios).toContain("boundary-no-send");
    expect(scenarios).toContain("regression-double-bind");
  });

  it("scaffolds a Skill Workshop proposal directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "practice-proposal-"));
    const specPath = join(dir, "spec.yaml");
    await writeFile(specPath, YAML.stringify(validSpec));

    const result = await scaffoldSkillWorkshopProposal({
      specPath,
      outDir: join(dir, "proposals"),
      repoRoot: dir,
    });
    const proposal = await readFile(join(result.proposalDir, "PROPOSAL.md"), "utf8");
    expect(proposal).toContain("status: proposal");
    expect(proposal).toContain("Relationship Pattern Map");

    const embeddedPack = await readFile(
      join(result.proposalDir, "references", "pack", "PACK.yaml"),
      "utf8",
    );
    expect(embeddedPack).toContain("bateson.relationship-pattern-map");
    const embeddedScenarios = await readFile(
      join(result.proposalDir, "references", "scenarios", "phase1.jsonl"),
      "utf8",
    );
    expect(embeddedScenarios).toContain("boundary-no-send");
  });

  it("runs deterministic pack evals", async () => {
    const dir = await mkdtemp(join(tmpdir(), "practice-evals-"));
    const specPath = join(dir, "spec.yaml");
    await writeFile(specPath, YAML.stringify(validSpec));
    const result = await scaffoldPracticePack({
      specPath,
      outDir: join(dir, "practice-packs"),
      repoRoot: dir,
    });

    await expect(
      runPracticePackEvals({ packDir: result.packDir, repoRoot: dir }),
    ).resolves.toMatchObject({
      ok: true,
      packsChecked: 1,
      issues: [],
    });
    await expect(
      runPracticePackEvals({ packsRoot: join(dir, "practice-packs"), repoRoot: dir }),
    ).resolves.toMatchObject({
      ok: true,
      packsChecked: 1,
    });
  });
});
