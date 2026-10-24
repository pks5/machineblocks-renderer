import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "@blockml/cli";
import { execute } from "../src/execute.js";

const require = createRequire(import.meta.url);
const directories: string[] = [];

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
  it("scaffolds a project and records the MachineBlocks profile", () => {
    const root = emptyDir();

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    const pkg = readPackage(root);
    expect(pkg.blockml).toEqual({ library: "./blocks/com/example/bml/Library.bml" });
    expect(pkg.dependencies?.["@blockml/core"]).toBeDefined();
    expect(pkg.devDependencies?.["@blockml/cli"]).toBeDefined();
    expect(pkg.devDependencies?.["@machineblocks/cli"]).toBe("^0.1.0");
    const library = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    expect(library).toContain("org.blockml.bml");
    expect(library).toContain('xmlns:mb="com.machineblocks.bml"');
    expect(library).toContain("<mb:Library");
  });

  it("does not duplicate the profile on a second run", () => {
    const root = emptyDir();
    expect(execute(["init", "com.example.bml"], root).code).toBe(0);
    const library = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    const pkg = readFileSync(join(root, "package.json"), "utf8");

    const again = execute(["init", "com.example.bml"], root);

    expect(again.code).toBe(0);
    expect(again.lines.join("\n")).toContain("Skipped existing @machineblocks/cli");
    expect(again.lines.join("\n")).toContain("Skipped existing com.machineblocks.bml.Library");
    expect(readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8")).toBe(library);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(pkg);
  });

  it("adds the library dependency to a project blockml init already created", () => {
    const root = emptyDir();
    expect(initProject({ packageFqn: "com.example.bml", rootDir: root }).code).toBe(0);
    const before = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    expect(before).not.toContain("com.machineblocks.bml");

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    const library = readFileSync(join(root, "blocks/com/example/bml/Library.bml"), "utf8");
    expect(library).toContain("org.blockml.bml");
    expect(library).toContain("<mb:Library");
    expect(readPackage(root).devDependencies?.["@machineblocks/cli"]).toBe("^0.1.0");
  });

  it("leaves an existing dependencies entry in place", () => {
    const root = emptyDir();
    expect(initProject({ packageFqn: "com.example.bml", rootDir: root }).code).toBe(0);
    const pkg = readPackage(root);
    pkg.dependencies = { ...pkg.dependencies, "@machineblocks/cli": "1.2.3" };
    writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

    const result = execute(["init", "com.example.bml"], root);

    expect(result.code).toBe(0);
    const after = readPackage(root);
    expect(after.dependencies?.["@machineblocks/cli"]).toBe("1.2.3");
    expect(after.devDependencies?.["@machineblocks/cli"]).toBeUndefined();
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

  it("shows init help", () => {
    const root = emptyDir();

    const command = execute(["init", "--help"], root);
    const general = execute(["--help"], root);

    expect(command.code).toBe(0);
    expect(command.lines.join("\n")).toContain("machineblocks init <package-fqn>");
    expect(general.code).toBe(0);
    expect(general.lines.join("\n")).toContain("machineblocks init <package-fqn>");
  });
});

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
