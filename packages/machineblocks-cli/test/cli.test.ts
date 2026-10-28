import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initProject } from "@blockml/cli";
import { execute } from "../src/execute.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const { existsSync, mkdirSync, symlinkSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const installed = join(dirname(fileURLToPath(import.meta.url)), "../../../node_modules/@blockml");
  return {
    ...actual,
    spawnSync: (...args: Parameters<typeof actual.spawnSync>) => {
      const [command, commandArgs, options] = args;
      if (command === "npm" && Array.isArray(commandArgs) && commandArgs[0] === "install") {
        const cwd = options && typeof options === "object" && "cwd" in options && options.cwd ? String(options.cwd) : process.cwd();
        mkdirSync(join(cwd, "node_modules", "@blockml"), { recursive: true });
        for (const name of ["core", "cli"]) {
          const dest = join(cwd, "node_modules", "@blockml", name);
          if (!existsSync(dest)) {
            symlinkSync(join(installed, name), dest);
          }
        }
        const machineblocksCli = join(cwd, "node_modules", "@machineblocks", "cli");
        if (!existsSync(machineblocksCli)) {
          mkdirSync(join(cwd, "node_modules", "@machineblocks"), { recursive: true });
          symlinkSync(join(dirname(fileURLToPath(import.meta.url)), ".."), machineblocksCli);
        }
        return { status: 0, signal: null, pid: 0, output: [], stdout: "", stderr: "" };
      }
      return actual.spawnSync(...args);
    },
  };
});

const require = createRequire(import.meta.url);
const directories: string[] = [];

function linkBlockmlPackages(root: string): void {
  const installed = join(dirname(fileURLToPath(import.meta.url)), "../../../node_modules/@blockml");
  mkdirSync(join(root, "node_modules", "@blockml"), { recursive: true });
  for (const name of ["core", "cli"]) {
    const dest = join(root, "node_modules", "@blockml", name);
    if (!existsSync(dest)) {
      symlinkSync(join(installed, name), dest);
    }
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("machineblocks compile", () => {
  it("maps a recursive bml selector and keeps the package hierarchy", () => {
    const root = project();
    writeBlock(root, "com.example.bml.bricks.Brick");
    writeBlock(root, "com.example.bml.wheels.Wheel");

    const result = execute(["compile", "com.example.bml.**"], root);

    expect(result.code).toBe(0);
    expect(existsSync(scad(root, "com/example/scad/bricks/Brick.scad"))).toBe(true);
    expect(existsSync(scad(root, "com/example/scad/wheels/Wheel.scad"))).toBe(true);
    const map = JSON.parse(readFileSync(scad(root, "com/example/scad/bricks/Brick.scad.map"), "utf8")) as {
      version?: number;
    };
    expect(map.version).toBe(3);
  });

  it("derives the source package from a package selector", () => {
    const root = project();
    writeBlock(root, "com.example.models.bricks.Brick");

    const result = execute(["compile", "com.example.models.**", "--target-package", "com.example.scad"], root);

    expect(result.code).toBe(0);
    expect(existsSync(scad(root, "com/example/scad/bricks/Brick.scad"))).toBe(true);
    expect(existsSync(scad(root, "com/example/models/bricks/Brick.scad"))).toBe(false);
  });

  it("rejects one block with --target-package and writes nothing", () => {
    const root = project();
    writeBlock(root, "com.example.models.Brick");

    const result = execute(["compile", "com.example.models.Brick", "--target-package", "com.example.scad"], root);

    expect(result.code).toBe(2);
    expect(result.lines.join("\n")).toContain("--source-package");
    expect(existsSync(scad(root, "com/example/scad/Brick.scad"))).toBe(false);
  });

  it("stops before writing when two blocks share a target", () => {
    const root = project();
    writeBlock(root, "com.example.bml.scad.Brick");
    writeBlock(root, "com.example.scad.bml.Brick");

    const result = execute(["compile", "com.example.**"], root);

    expect(result.code).toBe(1);
    expect(result.lines.join("\n")).toContain("MB_TARGET_COLLISION");
    expect(existsSync(scad(root, "com/example/scad/scad/Brick.scad"))).toBe(false);
  });

  it("maps independent bml trees in one selector", () => {
    const root = project();
    writeBlock(root, "com.alpha.demo.bml.Brick");
    writeBlock(root, "org.beta.demo.bml.Wheel");

    const result = execute(["compile", "*.*.demo.bml.*"], root);

    expect(result.code).toBe(0);
    expect(existsSync(scad(root, "com/alpha/demo/scad/Brick.scad"))).toBe(true);
    expect(existsSync(scad(root, "org/beta/demo/scad/Wheel.scad"))).toBe(true);
  });

  it("skips documentation and fails when no block remains", () => {
    const root = project();
    writeBlock(root, "com.example.bml.bricks.Brick");
    writeNotes(root, "com.example.bml.bricks.Notes");

    const compiled = execute(["compile", "com.example.bml.**"], root);
    expect(compiled.code).toBe(0);
    expect(existsSync(scad(root, "com/example/scad/bricks/Brick.scad"))).toBe(true);
    expect(existsSync(scad(root, "com/example/scad/bricks/Notes.scad"))).toBe(false);

    const notesOnly = project();
    writeNotes(notesOnly, "com.example.bml.bricks.Notes");
    const empty = execute(["compile", "com.example.bml.**"], notesOnly);
    expect(empty.code).toBe(1);
    expect(empty.lines.join("\n")).toContain("MB_SELECTOR_EMPTY");
  });

  it("writes nothing when one selected block has no target", () => {
    const root = project();
    writeBlock(root, "com.example.bml.Brick");
    writeBlock(root, "com.example.plain.Brick");

    const result = execute(["compile", "com.example.**"], root);

    expect(result.code).toBe(1);
    expect(result.lines.join("\n")).toContain("MB_TARGET_PACKAGE_UNDETERMINED");
    expect(existsSync(scad(root, "com/example/scad/Brick.scad"))).toBe(false);
  });

  it("validates a project without registering a write", () => {
    const root = project();
    writeBlock(root, "com.example.bml.Brick");

    const result = execute(["validate"], root);

    expect(result.code).toBe(0);
    expect(existsSync(scad(root, "com/example/scad/Brick.scad"))).toBe(false);
  });
});

describe("machineblocks init", () => {
  it("records the MachineBlocks profile and skips install when --no-install is set", () => {
    const root = emptyDir();

    const result = execute(["init", "com.example.bml", "--no-install"], root);

    expect(result.code).toBe(0);
    const pkg = readPackage(root);
    expect(pkg.blockml).toEqual({ library: "./blocks/com/example/bml/Library.bml" });
    expect(pkg.dependencies?.["@blockml/core"]).toBeDefined();
    expect(pkg.dependencies?.["@machineblocks/core"]).toBe(coreRange());
    const dependencyNames = Object.keys(pkg.dependencies ?? {});
    expect(dependencyNames.indexOf("@machineblocks/core")).toBe(dependencyNames.indexOf("@blockml/core") + 1);
    expect(pkg.devDependencies?.["@blockml/cli"]).toBeDefined();
    expect(pkg.devDependencies?.["@machineblocks/cli"]).toBe(cliRange());
    const library = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    expect(library).toContain("org.blockml.bml");
    expect(library).toContain('xmlns:mb="com.machineblocks.bml"');
    expect(library).toContain("<mb:Library");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(root, "node_modules"))).toBe(false);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(result.lines.join("\n")).toContain("npx blockml agents-md generate");
  });

  it("does not duplicate the profile on a second run", () => {
    const root = emptyDir();
    expect(execute(["init", "com.example.bml"], root).code).toBe(0);
    const library = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    const pkg = readFileSync(join(root, "package.json"), "utf8");

    const again = execute(["init", "com.example.bml"], root);

    expect(again.code).toBe(0);
    expect(again.lines.join("\n")).toContain("Skipped existing @machineblocks/cli");
    expect(again.lines.join("\n")).toContain("Skipped existing @machineblocks/core");
    expect(again.lines.join("\n")).toContain("Skipped existing com.machineblocks.bml.Library");
    expect(readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8")).toBe(library);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(pkg);
  });

  it("adds the library dependency to a project blockml init already created", () => {
    const root = emptyDir();
    expect(initProject({ packageFqn: "com.example.bml", rootDir: root, noInstall: true }).code).toBe(0);
    const before = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    expect(before).not.toContain("com.machineblocks.bml");

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    const library = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    expect(library).toContain("org.blockml.bml");
    expect(library).toContain("<mb:Library");
    expect(readPackage(root).devDependencies?.["@machineblocks/cli"]).toBe(cliRange());
  });

  it("leaves an existing dependencies entry in place", () => {
    const root = emptyDir();
    expect(initProject({ packageFqn: "com.example.bml", rootDir: root, noInstall: true }).code).toBe(0);
    const pkg = readPackage(root);
    pkg.dependencies = { ...pkg.dependencies, "@machineblocks/cli": "1.2.3" };
    writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    const after = readPackage(root);
    expect(after.dependencies?.["@machineblocks/cli"]).toBe("1.2.3");
    expect(after.devDependencies?.["@machineblocks/cli"]).toBeUndefined();
  });

  it("leaves an existing @machineblocks/core dependency in place", () => {
    const root = emptyDir();
    expect(initProject({ packageFqn: "com.example.bml", rootDir: root, noInstall: true }).code).toBe(0);
    const pkg = readPackage(root);
    pkg.dependencies = { ...pkg.dependencies, "@machineblocks/core": "9.9.9" };
    writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

    const result = execute(["init", "com.example.bml", "--no-install"], root);

    expect(result.code).toBe(0);
    expect(result.lines.join("\n")).toContain("Skipped existing @machineblocks/core");
    expect(readPackage(root).dependencies?.["@machineblocks/core"]).toBe("9.9.9");
  });

  it("rejects an invalid package FQN", () => {
    const root = emptyDir();

    const result = execute(["init", "Library"], root);

    expect(result.code).toBe(2);
    expect(result.lines.join("\n")).toContain("Invalid package FQN");
    expect(existsSync(join(root, "blocks"))).toBe(false);
  });

  it("warns when the package FQN has no bml segment", () => {
    const root = emptyDir();

    const result = execute(["init", "com.example.models"], root);

    expect(result.code).toBe(0);
    expect(result.lines.join("\n")).toContain("no bml segment");
    expect(readFileSync(join(root, "blocks/com/example/models/Library.bml"), "utf8")).toContain("<mb:Library");
  });

  it("adds MachineBlocks CLI instructions when it generates AGENTS.md", () => {
    const root = emptyDir();

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("# BlockML Project Instructions");
    expect(agents).toContain("# Tools");
    expect(agents).toContain("# MachineBlocks CLI");
    expect(agents).toContain("`machineblocks` extends the BlockML CLI; it does not replace it.");
    expect(agents).toContain(
      "Use `machineblocks` for `validate`, `compile`, `init`, and `update`. Use `blockml` for model discovery, inspection, transformations, and other generic operations.",
    );
    expect(agents).toContain("## Validation and Compilation");
    expect(agents).toContain("Do not use `blockml compile` for MachineBlocks SCAD generation");
    expect(agents.indexOf("# MachineBlocks CLI")).toBeGreaterThan(agents.indexOf("# Tools"));
    expect(agents.indexOf("# Rules")).toBeGreaterThan(agents.indexOf("# MachineBlocks CLI"));
    expect(result.lines.join("\n")).toContain("Created AGENTS.md");
    expect(result.lines.join("\n")).not.toContain("agents-md generate");

    const reference = emptyDir();
    linkBlockmlPackages(reference);
    expect(initProject({ packageFqn: "com.example.bml", rootDir: reference }).code).toBe(0);
    const blockmlAgents = readFileSync(join(reference, "AGENTS.md"), "utf8");
    expect(blockmlAgents).not.toContain("# MachineBlocks CLI");
    expect(blockmlAgents).toContain("# Tools");
  });

  it("overwrites AGENTS.md on a BlockML project", () => {
    const root = emptyDir();
    expect(execute(["init", "com.example.bml", "--no-install"], root).code).toBe(0);
    writeFileSync(join(root, "AGENTS.md"), "keep\n");

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("# BlockML Project Instructions");
    expect(result.lines.join("\n")).toContain("Updated AGENTS.md");
    expect(existsSync(join(root, "AGENTS.md.pre-blockml"))).toBe(false);
  });

  it("renames a foreign AGENTS.md before writing and still runs preflight with --no-install", () => {
    const root = emptyDir();
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "app" })}\n`);
    writeFileSync(join(root, "AGENTS.md"), "foreign\n");

    const result = execute(["init", "com.example.bml", "--no-install"], root);

    expect(result.code).toBe(0);
    expect(readFileSync(join(root, "AGENTS.md.pre-blockml"), "utf8")).toBe("foreign\n");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(result.lines.join("\n")).toContain("Renamed AGENTS.md to AGENTS.md.pre-blockml");
    expect(readPackage(root).devDependencies?.["@machineblocks/cli"]).toBe(cliRange());
    expect(existsSync(join(root, "node_modules"))).toBe(false);
  });

  it("keeps the foreign AGENTS.md and writes a generated one", () => {
    const root = emptyDir();
    writeFileSync(join(root, "AGENTS.md"), "foreign\n");

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    expect(readFileSync(join(root, "AGENTS.md.pre-blockml"), "utf8")).toBe("foreign\n");
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("# BlockML Project Instructions");
  });

  it("stops before writing when AGENTS.md.pre-blockml already exists", () => {
    const root = emptyDir();
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "app" })}\n`);
    writeFileSync(join(root, "AGENTS.md"), "foreign\n");
    writeFileSync(join(root, "AGENTS.md.pre-blockml"), "backup\n");

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(2);
    expect(result.lines.join("\n")).toContain("AGENTS.md.pre-blockml already exists.");
    expect(existsSync(join(root, "blocks"))).toBe(false);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("foreign\n");
    expect(readFileSync(join(root, "AGENTS.md.pre-blockml"), "utf8")).toBe("backup\n");
    expect(readPackage(root).blockml).toBeUndefined();
    expect(readPackage(root).devDependencies?.["@machineblocks/cli"]).toBeUndefined();
  });

  it("stops before writing when package.json cannot be parsed", () => {
    const root = emptyDir();
    writeFileSync(join(root, "package.json"), "{");
    writeFileSync(join(root, "AGENTS.md"), "foreign\n");

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(2);
    expect(result.lines.join("\n")).toContain("Could not parse package.json.");
    expect(existsSync(join(root, "blocks"))).toBe(false);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("foreign\n");
    expect(existsSync(join(root, "AGENTS.md.pre-blockml"))).toBe(false);
  });

  it("shows init help", () => {
    const root = emptyDir();

    const command = execute(["init", "--help"], root);
    const general = execute(["--help"], root);

    expect(command.code).toBe(0);
    expect(command.lines.join("\n")).toContain("machineblocks init <package-fqn> [--src dir] [--no-install]");
    expect(command.lines.join("\n")).toContain("--no-install");
    expect(command.lines.join("\n")).not.toContain("--install");
    expect(general.code).toBe(0);
    expect(general.lines.join("\n")).toContain("machineblocks init <package-fqn> [--src dir] [--no-install]");
  });
});

describe("machineblocks update", () => {
  it("rewrites registry ranges to this host and skips install when --no-install is set", () => {
    const root = blockmlProject({
      dependencies: { "@blockml/core": "^1.0.0", "@machineblocks/core": "^1.0.0" },
      devDependencies: { "@blockml/cli": "^0.1.0", "@machineblocks/cli": "^0.0.1" },
    });
    mkdirSync(join(root, "blocks"));
    writeFileSync(join(root, "blocks/keep.bml"), "stay\n");
    writeFileSync(join(root, "AGENTS.md"), "stay\n");
    writeFileSync(join(root, "CLAUDE.md"), "stay\n");

    const result = execute(["update", "--no-install"], root);

    expect(result.code).toBe(0);
    const pkg = readPackage(root);
    expect(pkg.dependencies?.["@blockml/core"]).toBe(blockmlCoreRange());
    expect(pkg.dependencies?.["@machineblocks/core"]).toBe(coreRange());
    expect(pkg.devDependencies?.["@blockml/cli"]).toBe(blockmlCliRange());
    expect(pkg.devDependencies?.["@machineblocks/cli"]).toBe(cliRange());
    expect(result.lines.join("\n")).toContain(`Updated devDependencies.@machineblocks/cli from ^0.0.1 to ${cliRange()}`);
    expect(result.lines.join("\n")).toContain("Next: npm install");
    expect(existsSync(join(root, "node_modules"))).toBe(false);
    expect(readFileSync(join(root, "blocks/keep.bml"), "utf8")).toBe("stay\n");
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("stay\n");
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("stay\n");
  });

  it("adds missing pins in the init fields", () => {
    const root = blockmlProject({});

    const result = execute(["update", "--no-install"], root);

    expect(result.code).toBe(0);
    const pkg = readPackage(root);
    expect(pkg.dependencies?.["@blockml/core"]).toBe(blockmlCoreRange());
    expect(pkg.dependencies?.["@machineblocks/core"]).toBe(coreRange());
    expect(pkg.devDependencies?.["@blockml/cli"]).toBe(blockmlCliRange());
    expect(pkg.devDependencies?.["@machineblocks/cli"]).toBe(cliRange());
    expect(result.lines.join("\n")).toContain(`Added devDependencies.@machineblocks/cli ${cliRange()}`);
    expect(result.lines.join("\n")).toContain(`Added dependencies.@machineblocks/core ${coreRange()}`);
  });

  it("updates a pin that already lives in another dependency field", () => {
    const root = blockmlProject({
      dependencies: {
        "@blockml/core": blockmlCoreRange(),
        "@machineblocks/core": coreRange(),
        "@machineblocks/cli": "^0.0.1",
      },
      devDependencies: { "@blockml/cli": blockmlCliRange() },
    });

    const result = execute(["update", "--no-install"], root);

    expect(result.code).toBe(0);
    const pkg = readPackage(root);
    expect(pkg.dependencies?.["@machineblocks/cli"]).toBe(cliRange());
    expect(pkg.devDependencies?.["@machineblocks/cli"]).toBeUndefined();
    expect(result.lines.join("\n")).toContain(`Updated dependencies.@machineblocks/cli from ^0.0.1 to ${cliRange()}`);
  });

  it("leaves a specifier that contains a colon", () => {
    const root = blockmlProject({
      dependencies: { "@blockml/core": blockmlCoreRange(), "@machineblocks/core": "workspace:*" },
      devDependencies: { "@blockml/cli": blockmlCliRange(), "@machineblocks/cli": cliRange() },
    });

    const result = execute(["update", "--no-install"], root);

    expect(result.code).toBe(0);
    expect(readPackage(root).dependencies?.["@machineblocks/core"]).toBe("workspace:*");
    expect(result.lines.join("\n")).toContain("Left dependencies.@machineblocks/core at workspace:*");
    expect(result.lines.join("\n")).not.toContain("Next: npm install");
  });

  it("leaves package.json byte for byte when the ranges already match", () => {
    const root = blockmlProject({
      dependencies: { "@blockml/core": blockmlCoreRange(), "@machineblocks/core": coreRange() },
      devDependencies: { "@blockml/cli": blockmlCliRange(), "@machineblocks/cli": cliRange() },
    });
    const before = readFileSync(join(root, "package.json"), "utf8");

    const skipped = execute(["update", "--no-install"], root);
    expect(skipped.code).toBe(0);
    expect(skipped.lines).toEqual(["package.json already matches this CLI."]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect(existsSync(join(root, "node_modules"))).toBe(false);

    const installed = execute(["update"], root);
    expect(installed.code).toBe(0);
    expect(installed.lines).toEqual(["package.json already matches this CLI."]);
    expect(existsSync(join(root, "node_modules"))).toBe(true);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });

  it("writes nothing when the directory is not a BlockML project", () => {
    const missing = emptyDir();
    const missingResult = execute(["update", "--no-install"], missing);
    expect(missingResult.code).toBe(2);
    expect(missingResult.lines).toEqual(["Not a BlockML project. package.json is missing."]);
    expect(existsSync(join(missing, "package.json"))).toBe(false);

    const plain = emptyDir();
    const original = `${JSON.stringify({ name: "app", dependencies: { "@machineblocks/core": "^1.0.0" } }, null, 2)}\n`;
    writeFileSync(join(plain, "package.json"), original);
    const plainResult = execute(["update"], plain);
    expect(plainResult.code).toBe(2);
    expect(plainResult.lines).toEqual(["Not a BlockML project. package.json has no blockml key."]);
    expect(readFileSync(join(plain, "package.json"), "utf8")).toBe(original);
    expect(existsSync(join(plain, "node_modules"))).toBe(false);

    const broken = emptyDir();
    writeFileSync(join(broken, "package.json"), "{");
    const brokenResult = execute(["update"], broken);
    expect(brokenResult.code).toBe(2);
    expect(brokenResult.lines).toEqual(["Could not parse package.json."]);
    expect(readFileSync(join(broken, "package.json"), "utf8")).toBe("{");
  });

  it("writes nothing when a dependency field cannot hold a pin", () => {
    const root = emptyDir();
    const original = `${JSON.stringify({ name: "app", blockml: {}, dependencies: [] })}\n`;
    writeFileSync(join(root, "package.json"), original);

    const result = execute(["update", "--no-install"], root);

    expect(result.code).toBe(2);
    expect(result.lines).toEqual(["Could not update package.json dependencies."]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(original);
  });

  it("rejects an unexpected argument and an unknown option", () => {
    const root = blockmlProject({});
    const before = readFileSync(join(root, "package.json"), "utf8");

    const positional = execute(["update", "now"], root);
    expect(positional.code).toBe(2);
    expect(positional.lines[0]).toBe("Unexpected argument: now");
    expect(positional.lines.join("\n")).toContain("machineblocks update [--no-install]");

    const option = execute(["update", "--force"], root);
    expect(option.code).toBe(2);
    expect(option.lines[0]).toBe("Unknown option: --force");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });
});

function hostPackage(): { version?: string; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")) as {
    version?: string;
    dependencies?: Record<string, string>;
  };
}

function cliRange(): string {
  return `^${hostPackage().version ?? "0.0.0"}`;
}

function coreRange(): string {
  return hostPackage().dependencies?.["@machineblocks/core"] ?? "";
}

function blockmlCliRange(): string {
  return hostPackage().dependencies?.["@blockml/cli"] ?? "";
}

function blockmlCoreRange(): string {
  return hostPackage().dependencies?.["@blockml/core"] ?? "";
}

function blockmlProject(pins: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): string {
  const root = emptyDir();
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "app",
        blockml: { library: "./blocks/com/example/bml/Library.bml" },
        ...pins,
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function emptyDir(): string {
  const root = mkdtempSync(join(tmpdir(), "mb-cli-"));
  directories.push(root);
  return root;
}

interface PackageJson {
  blockml?: { library?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackage(root: string): PackageJson {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;
}

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "mb-cli-"));
  directories.push(root);
  const core = require.resolve("@blockml/core/blocks/org/blockml/bml/Library.bml");
  const machineblocks = require.resolve("@machineblocks/core/blocks/com/machineblocks/bml/Library.bml");
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "fixture", type: "module" })}\n`);
  writeFileSync(
    join(root, "blockml.config.json"),
    `${JSON.stringify(
      {
        srcDir: "blocks",
        libraries: [core, machineblocks],
        targetOptions: { "machineblocks-v3-scad": { mbLibPath: "/mb" } },
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(root, "blocks"), { recursive: true });
  return root;
}

function writeBlock(root: string, fqn: string): void {
  writeType(root, fqn, "mbcore:Block", false);
}

function writeNotes(root: string, fqn: string): void {
  writeType(root, fqn, "core:Documentation", true);
}

function writeType(root: string, fqn: string, baseType: string, documentation: boolean): void {
  const parts = fqn.split(".");
  const name = parts[parts.length - 1] ?? "Block";
  const packageFqn = parts.slice(0, -1).join(".");
  const directory = join(root, "blocks", ...parts.slice(0, -1));
  mkdirSync(directory, { recursive: true });
  const body = documentation
    ? `<documentation>Notes</documentation>`
    : `<aggregations>
    <parts>
      <composition>
        <mbcore:NativeBlock />
      </composition>
    </parts>
  </aggregations>`;
  writeFileSync(
    join(directory, `${name}.bml`),
    `<?xml version="1.0"?>
<t:${name} xmlns="http://blockml.org/bml"
  xmlns:core="org.blockml.bml.core"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:t="${packageFqn}">
  <baseType>${baseType}</baseType>
  <is>A fixture</is>
  ${body}
</t:${name}>
`,
  );
}

function scad(root: string, path: string): string {
  return join(root, "blocks", path);
}
