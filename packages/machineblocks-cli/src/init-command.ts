import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { AggregationDefinition, BlockDefinition } from "@blockml/bom";
import { BomBuilder } from "@blockml/builder";
import { generateAgentsMd, initProject } from "@blockml/cli";
import { parse } from "@blockml/parser";
import { serialize } from "@blockml/serializer";
import type { InitArgs } from "./args.js";
import type { HostResult } from "./compile-command.js";

const CLI_PACKAGE = "@machineblocks/cli";
const MACHINEBLOCKS_LIBRARY = "com.machineblocks.bml.Library";
const MACHINEBLOCKS_NAMESPACE = "com.machineblocks.bml";
const BLOCK_LIBRARY_BASE = "org.blockml.bml.core.BlockLibrary";

export function runInit(args: InitArgs, rootDir: string): HostResult {
  const scaffold = initProject({
    packageFqn: args.packageFqn,
    rootDir,
    ...(args.srcDir === undefined ? {} : { srcDir: args.srcDir }),
    noInstall: true,
  });
  const lines = scaffold.lines.map((line) => line.text);
  if (scaffold.code !== 0) {
    return { code: scaffold.code, lines };
  }

  const srcDir = args.srcDir?.trim() || "blocks";
  const dependency = ensureCliDevDependency(rootDir);
  lines.push(...dependency.lines);
  if (dependency.code !== 0) {
    return { code: dependency.code, lines };
  }

  const library = ensureLibraryDependency(rootDir, srcDir, args.packageFqn);
  lines.push(...library.lines);
  if (library.code !== 0) {
    return { code: library.code, lines };
  }

  if (!args.packageFqn.split(".").includes("bml")) {
    lines.push("Package FQN has no bml segment. Compile maps a bml segment to scad.");
  }

  if (args.noInstall) {
    return { code: 0, lines };
  }

  // initProject skipped npm install and AGENTS.md so the profile lands first.
  // Default matches blockml init: install, then generate.
  const kept = lines.filter((line) => !line.startsWith("Next:"));
  const installed = npmInstall(rootDir);
  if (installed.code !== 0) {
    return { code: installed.code, lines: [...kept, ...installed.lines] };
  }
  return {
    code: 0,
    lines: [...kept, ...installed.lines, ...agentsMdAfterInstall(rootDir, srcDir)],
  };
}

function agentsMdAfterInstall(rootDir: string, srcDir: string): string[] {
  if (existsSync(join(rootDir, "AGENTS.md"))) {
    return [];
  }
  return generateAgentsMd({ rootDir, srcDir }).lines.map((line) => line.text);
}

function ensureCliDevDependency(rootDir: string): HostResult {
  const pkgPath = join(rootDir, "package.json");
  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
  } catch {
    return { code: 2, lines: ["Could not parse package.json."] };
  }
  if (pkg.dependencies?.[CLI_PACKAGE] !== undefined || pkg.devDependencies?.[CLI_PACKAGE] !== undefined) {
    return { code: 0, lines: [`Skipped existing ${CLI_PACKAGE}`] };
  }
  pkg.devDependencies = { ...pkg.devDependencies, [CLI_PACKAGE]: `^${ownVersion()}` };
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return { code: 0, lines: [`Recorded devDependency ${CLI_PACKAGE}`] };
}

function ensureLibraryDependency(rootDir: string, srcDir: string, packageFqn: string): HostResult {
  const libraryPath = join(rootDir, srcDir, ...packageFqn.split("."), "Library.bml");
  const display = displayPath(libraryPath, rootDir);
  if (!existsSync(libraryPath)) {
    return { code: 1, lines: [`Library not found: ${display}`] };
  }
  const parsed = parse(readFileSync(libraryPath, "utf8"), { filePath: libraryPath });
  if (!parsed.success || parsed.document === null) {
    return { code: 1, lines: [`Failed to parse ${display}`] };
  }
  if (dependsOn(parsed.document.block, MACHINEBLOCKS_LIBRARY)) {
    return { code: 0, lines: [`Skipped existing ${MACHINEBLOCKS_LIBRARY}`] };
  }
  const builder = BomBuilder.edit(parsed.document);
  if (!dependenciesAggregation(parsed.document.block)) {
    builder.addAggregation({ name: "dependencies", typeFqn: BLOCK_LIBRARY_BASE, override: true });
  }
  builder.ensureNamespaceBinding("mb", MACHINEBLOCKS_NAMESPACE);
  builder.addCompositionChild("dependencies", MACHINEBLOCKS_LIBRARY);
  const emitted = serialize(builder.seal());
  if (!emitted.success || emitted.text === null) {
    return { code: 1, lines: [`Failed to serialize ${display}`] };
  }
  writeFileSync(libraryPath, emitted.text, "utf8");
  return { code: 0, lines: [`Updated ${display}`] };
}

function dependsOn(block: BlockDefinition, typeFqn: string): boolean {
  const aggregation = dependenciesAggregation(block);
  if (!aggregation?.composition) {
    return false;
  }
  return aggregation.composition.children.some(
    (child) => child.kind === "blockInstance" && child.instance.typeFqn === typeFqn,
  );
}

function dependenciesAggregation(block: BlockDefinition): AggregationDefinition | undefined {
  const member = block.members.find((entry) => entry.kind === "aggregation" && entry.name === "dependencies");
  return member?.kind === "aggregation" ? member : undefined;
}

function npmInstall(rootDir: string): HostResult {
  const result = spawnSync("npm", ["install"], { cwd: rootDir, stdio: "inherit" });
  if (result.status !== 0) {
    return { code: 1, lines: ["npm install failed."] };
  }
  return { code: 0, lines: [] };
}

function ownVersion(): string {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function displayPath(file: string, rootDir: string): string {
  const rel = relative(rootDir, file);
  return rel && !rel.startsWith("..") ? rel : file;
}
