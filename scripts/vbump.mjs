#!/usr/bin/env node
/**
 * Synchronously bump versions of the three workspace packages and their BML libraries.
 *
 * Updates workspace package.json files, their BML Library.bml versions,
 * the workspace Library, and package-lock.json (via npm install, unless --dry-run).
 *
 * Usage:
 *   node scripts/vbump.mjs major|minor|patch [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_LIBRARY = join(
  ROOT,
  "blocks/com/machineblocks/bml/renderer/workspace/Library.bml",
);
const KINDS = new Set(["major", "minor", "patch"]);

function parseArgs(argv) {
  const opts = { kind: undefined, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (KINDS.has(arg)) {
      opts.kind = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected x.y.z version, got ${JSON.stringify(version)}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(version, kind) {
  const parsed = parseSemver(version);
  if (kind === "major") {
    return `${parsed.major + 1}.0.0`;
  }
  if (kind === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
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

function collectLibraryFiles() {
  const files = [];
  const packagesDir = join(ROOT, "packages");
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    walkLibraryFiles(join(packagesDir, entry.name, "blocks"), files);
  }
  files.push(WORKSPACE_LIBRARY);
  return files;
}

function walkLibraryFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkLibraryFiles(path, out);
    } else if (entry.isFile() && entry.name === "Library.bml") {
      out.push(path);
    }
  }
}

function uniqueVersions(items) {
  return [...new Set(items.map((item) => item.version))];
}

function readPackage(file) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  return { file, name: pkg.name, version: pkg.version, pkg };
}

function libraryVersion(source) {
  const match = /<version>\s*([^\s<]+)\s*<\/version>/.exec(source);
  if (!match) {
    throw new Error("No <version> element");
  }
  return match[1];
}

function replaceLibraryVersion(source, from, to) {
  const next = source.replace(
    /(<version>\s*)([^\s<]+)(\s*<\/version>)/,
    (full, open, current, close) => {
      if (current !== from) {
        throw new Error(`Library version ${current} does not match ${from}`);
      }
      return `${open}${to}${close}`;
    },
  );
  if (next === source) {
    throw new Error(`Did not replace <version>${from}</version>`);
  }
  return next;
}

function bumpDepRange(range, from, to) {
  if (typeof range !== "string") {
    return range;
  }
  const match = /^(workspace:|file:|npm:)/.exec(range);
  if (match) {
    return range;
  }
  const prefix = range.startsWith("^") || range.startsWith("~") ? range[0] : "";
  const bare = prefix ? range.slice(1) : range;
  if (bare !== from) {
    return range;
  }
  return `${prefix}${to}`;
}

function bumpPackageJson(pkg, workspaceNames, from, to) {
  const next = structuredClone(pkg);
  next.version = to;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = next[field];
    if (!deps) {
      continue;
    }
    for (const [name, range] of Object.entries(deps)) {
      if (!workspaceNames.has(name)) {
        continue;
      }
      deps[name] = bumpDepRange(range, from, to);
    }
  }
  return `${JSON.stringify(next, null, 2)}\n`;
}

function rel(file) {
  return relative(ROOT, file);
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

  if (opts.help || !opts.kind) {
    console.log(`Usage: node scripts/vbump.mjs major|minor|patch [--dry-run]

  major   0.1.0 → 1.0.0
  minor   0.1.0 → 0.2.0
  patch   0.1.0 → 0.1.1`);
    process.exitCode = opts.help ? 0 : 1;
    return;
  }

  const packages = workspacePackageJsons().map(readPackage);
  const packageVersions = uniqueVersions(packages);
  if (packageVersions.length !== 1) {
    throw new Error(
      `Workspace package versions are not in sync:\n${packages
        .map((pkg) => `  ${pkg.version}  ${pkg.name}  ${rel(pkg.file)}`)
        .join("\n")}`,
    );
  }

  const current = packageVersions[0];
  parseSemver(current);
  const next = bumpVersion(current, opts.kind);
  const workspaceNames = new Set(packages.map((pkg) => pkg.name));

  const libraries = collectLibraryFiles().map((file) => {
    const source = readFileSync(file, "utf8");
    return { file, source, version: libraryVersion(source) };
  });
  const drifted = libraries.filter((lib) => lib.version !== current);
  if (drifted.length > 0) {
    throw new Error(
      `BML library versions are not in sync with packages (${current}):\n${drifted
        .map((lib) => `  ${lib.version}  ${rel(lib.file)}`)
        .join("\n")}`,
    );
  }

  console.log(`${opts.dryRun ? "Dry run: " : ""}vbump:${opts.kind}  ${current} → ${next}`);
  console.log(`Packages (${packages.length}):`);
  for (const pkg of packages) {
    console.log(`  ${rel(pkg.file)}`);
    if (!opts.dryRun) {
      writeFileSync(
        pkg.file,
        bumpPackageJson(pkg.pkg, workspaceNames, current, next),
      );
    }
  }

  console.log(`BML libraries (${libraries.length}):`);
  for (const lib of libraries) {
    console.log(`  ${rel(lib.file)}`);
    if (!opts.dryRun) {
      writeFileSync(lib.file, replaceLibraryVersion(lib.source, current, next));
    }
  }

  if (opts.dryRun) {
    return;
  }

  console.log("Refreshing package-lock.json...");
  execFileSync("npm", ["install"], { cwd: ROOT, stdio: "inherit" });
  console.log(`Done. ${current} → ${next}`);
}

main();
