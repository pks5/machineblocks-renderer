import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
