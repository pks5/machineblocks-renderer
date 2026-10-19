import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagnostic } from "@blockml/bom";
import { loadConfig } from "@blockml/cli";
import { compileBmlToBom, validateRegistryDocuments } from "@blockml/compiler";
import {
  bootstrapFullProjectRegistry,
  projectSourceRoots,
  registryFilesUnderRoots,
  rootFqnByFilePath,
} from "@blockml/framework";
import type { ValidateArgs } from "./args.js";
import type { HostResult } from "./compile-command.js";

export function runValidate(args: ValidateArgs, rootDir: string): HostResult {
  let config;
  try {
    config = loadConfig(rootDir);
  } catch (error) {
    return { code: 2, lines: [error instanceof Error ? error.message : String(error)] };
  }
  const srcDir = config.srcDir ?? "blocks";
  const bootstrap = bootstrapFullProjectRegistry({
    rootDir,
    srcDir,
    libraries: config.libraries ?? [],
  });
  if (args.file !== undefined) {
    const filePath = resolve(rootDir, args.file);
    if (!existsSync(filePath)) {
      return { code: 2, lines: [`File not found: ${args.file}`] };
    }
    const parsed = compileBmlToBom(
      { source: readFileSync(filePath, "utf8"), filePath },
      { typeRegistry: bootstrap.registry, rootDir },
    );
    return outcome([...bootstrap.diagnostics, ...parsed.diagnostics], 1);
  }
  const registryFiles = [...rootFqnByFilePath(bootstrap.registry).keys()];
  const files = args.all
    ? registryFiles
    : registryFilesUnderRoots(bootstrap.registry, projectSourceRoots(rootDir, srcDir));
  const validated = validateRegistryDocuments(bootstrap.registry, files);
  return outcome([...bootstrap.diagnostics, ...validated.diagnostics], validated.blocksTested);
}

function outcome(diagnostics: readonly Diagnostic[], blocksTested: number): HostResult {
  const failed = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const lines = diagnostics.map((diagnostic) => {
    const source = diagnostic.source;
    const where = source?.file ? `${source.file}:${source.line}:${source.column} ` : "";
    return `${where}${diagnostic.code}: ${diagnostic.message}`;
  });
  lines.push(
    failed
      ? `Validated ${blocksTested} block(s) with errors.`
      : `Validated ${blocksTested} block(s).`,
  );
  return { code: failed ? 1 : 0, lines };
}
