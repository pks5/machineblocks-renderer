import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { Diagnostic } from "@blockml/bom";
import { bootstrapProjectTypeRegistry, loadConfig, writeOutputFiles, type BomConfig } from "@blockml/cli";
import { compileToOutput, registerTarget, type RenderOutputFile } from "@blockml/compiler";
import { scanTypes } from "@blockml/framework";
import { BlockRenderEngine } from "@blockml/block-render-engine";
import {
  CONFIG_SET_UNEXPECTED,
  MachineBlocksRenderTarget,
  SELECTOR_EMPTY,
  isConfigSet,
  needsConfigSet,
  requireConfigSet,
  resolveConfigSet,
  SOURCE_PACKAGE_ALONE,
  SOURCE_PACKAGE_REQUIRED,
  TARGET_COLLISION,
  artifactExtension,
  isRenderBlock,
  mapManifestation,
  pathForManifestation,
  type ManifestationMapping,
} from "@machineblocks/render-target";
import { sourcePackageFromSelector, type CompileArgs } from "./args.js";
import { resolveOutputPath } from "./output-gate.js";

const TARGET_NAME = "machineblocks-v3-scad";
const MACHINEBLOCKS_CORE = "@machineblocks/core";

export interface HostResult {
  code: number;
  lines: string[];
}

export function runCompile(args: CompileArgs, rootDir: string): HostResult {
  const mapping = resolveMapping(args);
  if (!mapping.ok) {
    return { code: 2, lines: [`${mapping.code}: ${mapping.message}`] };
  }

  let config: BomConfig;
  try {
    config = loadConfig(rootDir);
  } catch (error) {
    return { code: 2, lines: [error instanceof Error ? error.message : String(error)] };
  }

  const srcDirName = config.srcDir ?? "blocks";
  const srcDir = resolve(rootDir, srcDirName);
  const libPath = resolveMbLibPath(rootDir, config);
  if (!libPath) {
    return { code: 2, lines: ["mbLibPath is not set and @machineblocks/core is not installed."] };
  }

  const bootstrap = bootstrapProjectTypeRegistry({ config, rootDir });
  const bootstrapErrors = bootstrap.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (bootstrapErrors.length > 0) {
    return { code: 1, lines: bootstrapErrors.map(formatDiagnostic) };
  }

  const scan = scanTypes([args.selector], bootstrap.registry);
  if (!scan.ok) {
    return { code: 2, lines: [scan.message] };
  }

  const selected = scan.hits.flatMap((fqn) => {
    const document = bootstrap.registry.get(fqn);
    if (!document || !isRenderBlock(document.block, bootstrap.registry)) {
      return [];
    }
    return [document];
  });
  if (selected.length === 0) {
    return {
      code: 1,
      lines: [`${SELECTOR_EMPTY}: No block matches selector ${args.selector}.`],
    };
  }

  const planned: Planned[] = [];
  const targetOwners = new Map<string, string>();
  const pathOwners = new Map<string, string>();
  for (const document of selected) {
    const manifested = mapManifestation(document.block.type, mapping.mapping, "selected");
    if (!manifested.ok) {
      return { code: 1, lines: [`${manifested.code}: ${manifested.message}`] };
    }
    const outputPath = pathForManifestation(manifested.fqn, artifactExtension(document.block));
    const targetClash = targetOwners.get(manifested.fqn);
    if (targetClash !== undefined) {
      return { code: 1, lines: [collision(TARGET_COLLISION, manifested.fqn, targetClash, document.block.type)] };
    }
    const pathClash = pathOwners.get(outputPath);
    if (pathClash !== undefined) {
      return { code: 1, lines: [collision(TARGET_COLLISION, outputPath, pathClash, document.block.type)] };
    }
    targetOwners.set(manifested.fqn, document.block.type);
    pathOwners.set(outputPath, document.block.type);
    const gated = resolveOutputPath(srcDir, outputPath);
    if (!gated.ok) {
      return { code: 1, lines: [`${gated.code}: ${gated.message}`] };
    }
    const filePath = document.source.filePath;
    if (!filePath) {
      return { code: 1, lines: [`${document.block.type} has no source file.`] };
    }
    planned.push({
      sourceFqn: document.block.type,
      targetFqn: manifested.fqn,
      path: outputPath,
      filePath,
    });
  }

  if (args.configSet !== undefined && selected.some((document) => isConfigSet(document.block, bootstrap.registry))) {
    return {
      code: 1,
      lines: [`${CONFIG_SET_UNEXPECTED}: --config-set cannot be set when compiling a ConfigSet.`],
    };
  }
  let configSet: string | undefined;
  if (selected.some((document) => needsConfigSet(document.block, bootstrap.registry))) {
    const resolved =
      args.configSet !== undefined
        ? requireConfigSet(bootstrap.registry, args.configSet)
        : resolveConfigSet(bootstrap.registry, srcDir);
    if (!resolved.ok) {
      return { code: 1, lines: [`${resolved.code}: ${resolved.message}`] };
    }
    configSet = resolved.fqn;
  }

  registerTarget(new MachineBlocksRenderTarget(new BlockRenderEngine()));
  const targetOptions = buildTargetOptions(config, libPath, mapping.mapping, configSet);
  const emitted: RenderOutputFile[] = [];
  for (const item of planned) {
    const source = readFileSync(item.filePath, "utf8");
    const result = compileToOutput(
      {
        scope: { kind: "document", document: { source, filePath: item.filePath } },
        targetOptions,
      },
      TARGET_NAME,
      {
        typeRegistry: bootstrap.registry,
        rootDir,
        outputBasePath: srcDir,
      },
    );
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (!result.success || errors.length > 0 || !result.output || result.output.files.length === 0) {
      const lines = errors.map(formatDiagnostic);
      if (lines.length === 0) {
        lines.push(`${item.sourceFqn} produced no output.`);
      }
      return { code: 1, lines };
    }
    emitted.push(...result.output.files);
  }

  const files = withSourceMaps(emitted);
  const writtenPaths = new Set<string>();
  for (const file of files) {
    if (writtenPaths.has(file.path)) {
      return {
        code: 1,
        lines: [`${TARGET_COLLISION}: ${file.path} is claimed by more than one artifact.`],
      };
    }
    writtenPaths.add(file.path);
    const gated = resolveOutputPath(srcDir, file.path);
    if (!gated.ok) {
      return { code: 1, lines: [`${gated.code}: ${gated.message}`] };
    }
  }

  writeOutputFiles({ files }, srcDir, rootDir, { cleanOutDir: false });
  return { code: 0, lines: [`Wrote ${files.length} file(s) to ${srcDir}`] };
}

interface Planned {
  sourceFqn: string;
  targetFqn: string;
  path: string;
  filePath: string;
}

function resolveMapping(
  args: CompileArgs,
): { ok: true; mapping: ManifestationMapping } | { ok: false; code: string; message: string } {
  if (args.sourcePackage !== undefined && args.targetPackage === undefined) {
    return {
      ok: false,
      code: SOURCE_PACKAGE_ALONE,
      message: "--source-package requires --target-package.",
    };
  }
  if (args.targetPackage !== undefined) {
    const sourcePackage = args.sourcePackage ?? sourcePackageFromSelector(args.selector);
    if (sourcePackage === undefined) {
      return {
        ok: false,
        code: SOURCE_PACKAGE_REQUIRED,
        message: [
          "--target-package needs a source package.",
          "",
          `The selector ${args.selector} is a single block, so the source root is not determined.`,
          "",
          "Specify --source-package.",
        ].join("\n"),
      };
    }
    return {
      ok: true,
      mapping: { kind: "explicit", sourcePackage, targetPackage: args.targetPackage },
    };
  }
  return { ok: true, mapping: { kind: "automatic" } };
}

function buildTargetOptions(
  config: BomConfig,
  mbLibPath: string,
  mapping: ManifestationMapping,
  configSet: string | undefined,
): Record<string, unknown> {
  const configured = config.targetOptions?.[TARGET_NAME];
  const nested: Record<string, unknown> = {};
  if (configured !== null && typeof configured === "object") {
    for (const [key, value] of Object.entries(configured)) {
      if (key !== "sourcePackage" && key !== "targetPackage" && key !== "mbLibPath" && key !== "configSet") {
        nested[key] = value;
      }
    }
  }
  nested.mbLibPath = mbLibPath;
  if (configSet !== undefined) {
    nested.configSet = configSet;
  }
  if (mapping.kind === "explicit") {
    nested.sourcePackage = mapping.sourcePackage;
    nested.targetPackage = mapping.targetPackage;
  }
  return { [TARGET_NAME]: nested };
}

function resolveMbLibPath(rootDir: string, config: BomConfig): string | undefined {
  const configured = (config as BomConfig & { mbLibPath?: unknown }).mbLibPath;
  if (typeof configured === "string" && configured.length > 0) {
    return resolve(rootDir, configured);
  }
  const nested = config.targetOptions?.[TARGET_NAME];
  if (nested !== null && typeof nested === "object" && "mbLibPath" in nested) {
    const fromTarget = (nested as { mbLibPath?: unknown }).mbLibPath;
    if (typeof fromTarget === "string" && fromTarget.length > 0) {
      return resolve(rootDir, fromTarget);
    }
  }
  if (isCorePackage(rootDir)) {
    return rootDir;
  }
  try {
    const require = createRequire(import.meta.url);
    return dirname(require.resolve(`${MACHINEBLOCKS_CORE}/package.json`));
  } catch {
    return undefined;
  }
}

function isCorePackage(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as { name?: unknown };
    return pkg.name === MACHINEBLOCKS_CORE && existsSync(join(rootDir, "lib", "block.scad"));
  } catch {
    return false;
  }
}

function withSourceMaps(files: readonly RenderOutputFile[]): RenderOutputFile[] {
  const out: RenderOutputFile[] = [];
  for (const file of files) {
    out.push({ path: file.path, content: file.content });
    const sourceMap = (file as { sourceMap?: unknown }).sourceMap;
    if (typeof sourceMap === "string") {
      out.push({ path: `${file.path}.map`, content: sourceMap });
    }
  }
  return out;
}

function collision(code: string, target: string, firstSource: string, secondSource: string): string {
  return `${code}: ${target} is the target of both ${firstSource} and ${secondSource}.`;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const source = diagnostic.source;
  const where = source?.file ? `${source.file}:${source.line}:${source.column} ` : "";
  return `${where}${diagnostic.code}: ${diagnostic.message}`;
}
