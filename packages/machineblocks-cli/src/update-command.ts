import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HostResult } from "./compile-command.js";

const CLI_PACKAGE = "@machineblocks/cli";
const MACHINEBLOCKS_CORE = "@machineblocks/core";
const BLOCKML_CLI = "@blockml/cli";
const BLOCKML_CORE = "@blockml/core";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

type DepField = (typeof DEP_FIELDS)[number];

interface PinSpec {
  name: string;
  range: string;
  defaultField: DepField;
}

interface PinPlan {
  field: DepField;
  from: string | undefined;
  to: string;
  action: "set" | "keep";
  keptBecause: "same" | "protocol" | "non-string" | undefined;
}

export function runUpdate(noInstall: boolean, rootDir: string): HostResult {
  const lines: string[] = [];
  const profile = profilePins();
  if (typeof profile === "string") {
    return { code: 2, lines: [profile] };
  }

  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    return { code: 2, lines: ["Not a BlockML project. package.json is missing."] };
  }
  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch {
    return { code: 2, lines: ["Could not parse package.json."] };
  }
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { code: 2, lines: ["Could not parse package.json."] };
  }
  if (!hasBlockmlKey(pkg)) {
    return { code: 2, lines: ["Not a BlockML project. package.json has no blockml key."] };
  }
  for (const field of DEP_FIELDS) {
    if (depRecord(pkg, field) === "invalid") {
      return { code: 2, lines: [`Could not update package.json ${field}.`] };
    }
  }

  const plans: { name: string; items: PinPlan[] }[] = [];
  for (const pin of profile) {
    const planned = planPin(pkg, pin.name, pin.range, pin.defaultField);
    if (planned.error) {
      return { code: 2, lines: [planned.error] };
    }
    plans.push({ name: pin.name, items: planned.plans });
  }

  let changed = false;
  for (const pin of plans) {
    for (const item of pin.items) {
      if (item.action === "set") {
        applyPin(pkg, item, pin.name);
        changed = true;
        lines.push(
          item.from === undefined
            ? `Added ${item.field}.${pin.name} ${item.to}`
            : `Updated ${item.field}.${pin.name} from ${item.from} to ${item.to}`,
        );
      } else if (item.keptBecause !== "same") {
        const shown = item.from ?? "non-version specifier";
        lines.push(`Left ${item.field}.${pin.name} at ${shown}`);
      }
    }
  }
  if (!changed && plans.every((pin) => pin.items.every((item) => item.keptBecause === "same"))) {
    lines.push("package.json already matches this CLI.");
  }
  if (changed) {
    try {
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    } catch {
      return { code: 1, lines: [...lines, "Could not write package.json."] };
    }
  }
  if (noInstall) {
    if (changed) {
      lines.push("Next: npm install");
    }
    return { code: 0, lines };
  }
  const installed = npmInstall(rootDir);
  if (installed.code !== 0) {
    return { code: installed.code, lines: [...lines, ...installed.lines] };
  }
  return { code: 0, lines };
}

function profilePins(): PinSpec[] | string {
  const pkg = ownPackageJson();
  const machineblocksCore = pkg.dependencies?.[MACHINEBLOCKS_CORE];
  const blockmlCli = pkg.dependencies?.[BLOCKML_CLI];
  const blockmlCore = pkg.dependencies?.[BLOCKML_CORE];
  if (machineblocksCore === undefined) {
    return `This host does not declare a dependency range for ${MACHINEBLOCKS_CORE}.`;
  }
  if (blockmlCli === undefined) {
    return `This host does not declare a dependency range for ${BLOCKML_CLI}.`;
  }
  if (blockmlCore === undefined) {
    return `This host does not declare a dependency range for ${BLOCKML_CORE}.`;
  }
  return [
    { name: CLI_PACKAGE, range: `^${pkg.version ?? "0.0.0"}`, defaultField: "devDependencies" },
    { name: MACHINEBLOCKS_CORE, range: machineblocksCore, defaultField: "dependencies" },
    { name: BLOCKML_CLI, range: blockmlCli, defaultField: "devDependencies" },
    { name: BLOCKML_CORE, range: blockmlCore, defaultField: "dependencies" },
  ];
}

function ownPackageJson(): { version?: string; dependencies?: Record<string, string> } {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    version?: string;
    dependencies?: Record<string, string>;
  };
}

function hasBlockmlKey(pkg: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(pkg, "blockml");
}

function depRecord(
  pkg: Record<string, unknown>,
  field: DepField,
): Record<string, unknown> | "missing" | "invalid" {
  if (!Object.prototype.hasOwnProperty.call(pkg, field) || pkg[field] === undefined) {
    return "missing";
  }
  const value = pkg[field];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "invalid";
  }
  return value as Record<string, unknown>;
}

/** Registry ranges have no ":". workspace:, file:, npm:, git, and http specifiers do. */
function isRegistryRange(range: string): boolean {
  return !range.includes(":");
}

function planPin(
  pkg: Record<string, unknown>,
  name: string,
  target: string,
  defaultField: DepField,
): { plans: PinPlan[]; error?: string } {
  const hits: { field: DepField; value: unknown }[] = [];
  for (const field of DEP_FIELDS) {
    const rec = depRecord(pkg, field);
    if (rec === "missing" || rec === "invalid") {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(rec, name)) {
      hits.push({ field, value: rec[name] });
    }
  }
  if (hits.length === 0) {
    const dest = depRecord(pkg, defaultField);
    if (dest === "invalid") {
      return { plans: [], error: `Could not update package.json ${defaultField}.` };
    }
    return {
      plans: [{ field: defaultField, from: undefined, to: target, action: "set", keptBecause: undefined }],
    };
  }
  const plans: PinPlan[] = [];
  for (const hit of hits) {
    if (typeof hit.value !== "string") {
      plans.push({ field: hit.field, from: undefined, to: target, action: "keep", keptBecause: "non-string" });
      continue;
    }
    if (!isRegistryRange(hit.value)) {
      plans.push({ field: hit.field, from: hit.value, to: target, action: "keep", keptBecause: "protocol" });
      continue;
    }
    if (hit.value === target) {
      plans.push({ field: hit.field, from: hit.value, to: target, action: "keep", keptBecause: "same" });
      continue;
    }
    plans.push({ field: hit.field, from: hit.value, to: target, action: "set", keptBecause: undefined });
  }
  return { plans };
}

function applyPin(pkg: Record<string, unknown>, plan: PinPlan, name: string): void {
  const rec = depRecord(pkg, plan.field);
  if (rec === "missing") {
    pkg[plan.field] = { [name]: plan.to };
    return;
  }
  if (rec === "invalid") {
    return;
  }
  rec[name] = plan.to;
}

function npmInstall(rootDir: string): HostResult {
  const result = spawnSync("npm", ["install"], { cwd: rootDir, stdio: "inherit" });
  if (result.status !== 0) {
    return { code: 1, lines: ["npm install failed."] };
  }
  return { code: 0, lines: [] };
}
