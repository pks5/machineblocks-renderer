#!/usr/bin/env node
/**
 * Set one external dependency family to a single version across the repo.
 *
 * Walks the root package.json and every workspace package.json. Rewrites matching
 * ranges in dependencies, devDependencies, peerDependencies, and
 * optionalDependencies, then refreshes package-lock.json via npm install.
 *
 * Families:
 *   core       @blockml/core
 *   mb-core    @machineblocks/core
 *   toolchain  direct @blockml/* except @blockml/core and workspace packages
 *
 * A bare version keeps each entry's existing ^ or ~ prefix. A version that
 * already starts with ^ or ~ is written as that range everywhere.
 * workspace:, file:, and npm: ranges are left unchanged.
 *
 * Usage:
 *   node scripts/deps-set.mjs <family> [version] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAMILIES = new Set(["core", "mb-core", "toolchain"]);
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const VERSION = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const SIMPLE_RANGE = new RegExp(`^([~^]?)(${VERSION})$`);
const TARGET_VERSION = new RegExp(`^([~^])?(${VERSION})$`);

const USAGE = `Usage: node scripts/deps-set.mjs <family> [version] [--dry-run]

  core       @blockml/core
  mb-core    @machineblocks/core
  toolchain  direct @blockml/* except @blockml/core and workspace packages

  node scripts/deps-set.mjs core                 list current ranges
  node scripts/deps-set.mjs core 1.5.0           keep each entry's ^ or ~
  node scripts/deps-set.mjs core ^1.5.0          force that range
  node scripts/deps-set.mjs toolchain 0.10.0 --dry-run`;

function parseArgs(argv) {
  const opts = { family: undefined, version: undefined, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (!opts.family) {
      opts.family = arg;
    } else if (!opts.version) {
      opts.version = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function workspacePackageJsons() {
  const packagesDir = join(ROOT, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name, "package.json"))
    .filter((file) => {
      try {
        return JSON.parse(readFileSync(file, "utf8")).name;
      } catch {
        return false;
      }
    });
}

function readPackage(file) {
  return { file, pkg: JSON.parse(readFileSync(file, "utf8")) };
}

function rel(file) {
  return relative(ROOT, file);
}

function matchesFamily(name, family, workspaceNames) {
  if (family === "core") {
    return name === "@blockml/core";
  }
  if (family === "mb-core") {
    return name === "@machineblocks/core";
  }
  return (
    name.startsWith("@blockml/") &&
    name !== "@blockml/core" &&
    !workspaceNames.has(name)
  );
}

function parseTarget(input) {
  const match = TARGET_VERSION.exec(input);
  if (!match) {
    throw new Error(
      `Expected a version like 1.5.0, ^1.5.0, or 3.0.0-A5, got ${JSON.stringify(input)}`,
    );
  }
  return {
    forcedPrefix: match[1] ?? null,
    bare: match[2],
  };
}

function collectHits(packages, family, workspaceNames) {
  const hits = [];
  for (const { file, pkg } of packages) {
    for (const field of DEP_FIELDS) {
      const deps = pkg[field];
      if (!deps) {
        continue;
      }
      for (const [name, range] of Object.entries(deps)) {
        if (!matchesFamily(name, family, workspaceNames)) {
          continue;
        }
        hits.push({ file, field, name, range, pkg });
      }
    }
  }
  return hits;
}

function classifyRange(range) {
  if (typeof range !== "string") {
    return { kind: "complex" };
  }
  if (/^(workspace:|file:|npm:)/.test(range)) {
    return { kind: "protocol" };
  }
  const match = SIMPLE_RANGE.exec(range);
  if (!match) {
    return { kind: "complex" };
  }
  return { kind: "simple", prefix: match[1], bare: match[2] };
}

function nextRange(hit, target) {
  const parsed = classifyRange(hit.range);
  if (parsed.kind === "protocol") {
    return { action: "skip", reason: hit.range };
  }
  if (parsed.kind === "complex") {
    throw new Error(
      `Cannot rewrite ${hit.range} for ${hit.name} in ${rel(hit.file)} (${hit.field})`,
    );
  }
  const prefix = target.forcedPrefix ?? parsed.prefix;
  return { action: "set", range: `${prefix}${target.bare}`, bare: parsed.bare };
}

function printDrift(hits) {
  const versions = new Set();
  for (const hit of hits) {
    const parsed = classifyRange(hit.range);
    if (parsed.kind === "simple") {
      versions.add(parsed.bare);
    }
  }
  if (versions.size <= 1) {
    return;
  }
  console.log("Versions differ within this family:");
  for (const hit of hits) {
    console.log(`  ${hit.range}  ${rel(hit.file)}  ${hit.field}  ${hit.name}`);
  }
}

function printHits(hits) {
  let currentFile;
  for (const hit of hits) {
    if (hit.file !== currentFile) {
      currentFile = hit.file;
      console.log(rel(hit.file));
    }
    console.log(`  ${hit.field}  ${hit.name}  ${hit.range}`);
  }
}

function apply(hits, target, dryRun) {
  const changes = [];
  for (const hit of hits) {
    const next = nextRange(hit, target);
    if (next.action === "skip") {
      console.log(
        `skip  ${rel(hit.file)}  ${hit.field}  ${hit.name}  ${next.reason}`,
      );
      continue;
    }
    const same = next.range === hit.range;
    console.log(
      `${same ? "unchanged" : "set"}  ${rel(hit.file)}  ${hit.field}  ${hit.name}  ${hit.range} → ${next.range}`,
    );
    if (!same) {
      hit.pkg[hit.field][hit.name] = next.range;
      changes.push(hit);
    }
  }

  const files = [...new Set(changes.map((hit) => hit.file))];
  if (!dryRun) {
    const written = new Set();
    for (const hit of changes) {
      if (written.has(hit.file)) {
        continue;
      }
      written.add(hit.file);
      writeFileSync(hit.file, `${JSON.stringify(hit.pkg, null, 2)}\n`);
    }
  }
  return files;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (opts.help || !opts.family) {
    console.log(USAGE);
    process.exitCode = opts.help ? 0 : 1;
    return;
  }
  if (!FAMILIES.has(opts.family)) {
    console.error(`Unknown family: ${opts.family}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const workspaceFiles = workspacePackageJsons();
  const packages = [join(ROOT, "package.json"), ...workspaceFiles].map(readPackage);
  const workspaceNames = new Set(
    workspaceFiles.map((file) => JSON.parse(readFileSync(file, "utf8")).name),
  );
  const hits = collectHits(packages, opts.family, workspaceNames);

  if (!opts.version) {
    console.log(opts.family);
    if (hits.length === 0) {
      console.log("No matches.");
      return;
    }
    printDrift(hits);
    printHits(hits);
    return;
  }

  let target;
  try {
    target = parseTarget(opts.version);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  if (hits.length === 0) {
    console.error(`No ${opts.family} dependencies to update.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `${opts.dryRun ? "Dry run: " : ""}deps:set ${opts.family}  ${opts.version}`,
  );
  printDrift(hits);
  let files;
  try {
    files = apply(hits, target, opts.dryRun);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.log("Already at the requested range.");
    return;
  }
  if (opts.dryRun) {
    return;
  }

  console.log("Refreshing package-lock.json...");
  execFileSync("npm", ["install"], { cwd: ROOT, stdio: "inherit" });
  console.log(`Done. ${opts.family} → ${opts.version}`);
}

main();
