#!/usr/bin/env node
import process from "node:process";
import {
  runPracticePackEvals,
  scaffoldPracticePack,
  scaffoldSkillWorkshopProposal,
  validatePracticePackFile,
} from "./runtime.js";

async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const flags = parseFlags(argv.slice(1));

  if (command === "validate") {
    const spec = stringFlag(flags, "spec") ?? argv[1];
    if (!spec) throw new Error("validate requires --spec <path>");
    const result = await validatePracticePackFile(spec);
    if (result.ok) {
      console.log(`practice pack valid: ${spec}`);
      return;
    }
    console.error("practice pack invalid:");
    for (const issue of result.issues) console.error(`- ${issue.path}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  if (command === "new") {
    const spec = stringFlag(flags, "spec");
    if (!spec) throw new Error("new requires --spec <path>");
    const outDir = stringFlag(flags, "out-dir");
    const result = await scaffoldPracticePack({ specPath: spec, outDir });
    console.log(`practice pack scaffolded: ${result.packDir}`);
    for (const file of result.files) console.log(`- ${file}`);
    return;
  }

  if (command === "proposal") {
    const spec = stringFlag(flags, "spec");
    const outDir = stringFlag(flags, "out-dir");
    if (!spec) throw new Error("proposal requires --spec <path>");
    if (!outDir) throw new Error("proposal requires --out-dir <path>");
    const result = await scaffoldSkillWorkshopProposal({ specPath: spec, outDir });
    console.log(`skill workshop proposal scaffolded: ${result.proposalDir}`);
    for (const file of result.files) console.log(`- ${file}`);
    return;
  }

  if (command === "eval") {
    const packDir = stringFlag(flags, "pack");
    const packsRoot = stringFlag(flags, "packs-root");
    const result = await runPracticePackEvals({ packDir, packsRoot });
    if (result.ok) {
      console.log(`practice pack evals passed: ${result.packsChecked} pack(s)`);
      return;
    }
    console.error(`practice pack evals failed: ${result.packsChecked} pack(s)`);
    for (const issue of result.issues) {
      console.error(`- ${issue.pack} ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  printHelp();
  if (command && command !== "help") process.exitCode = 1;
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i++;
  }
  return flags;
}

function stringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function printHelp(): void {
  console.log(
    `Practice Factory\n\nUsage:\n  node --import tsx scripts/practice-factory/cli.ts validate --spec <PACK.yaml>\n  node --import tsx scripts/practice-factory/cli.ts new --spec <spec.yaml> [--out-dir practice-packs]\n  node --import tsx scripts/practice-factory/cli.ts proposal --spec <spec.yaml> --out-dir <proposal-root>\n  node --import tsx scripts/practice-factory/cli.ts eval [--pack <pack-dir> | --packs-root practice-packs]\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
