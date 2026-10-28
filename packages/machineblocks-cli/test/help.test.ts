import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { execute } from "../src/execute.js";
import { COMPILE_HELP, COMPILE_USAGE, HELP, INIT_HELP, UPDATE_HELP, VALIDATE_HELP } from "../src/help.js";

const docs = join(
  dirname(fileURLToPath(import.meta.url)),
  "../blocks/com/machineblocks/bml/cli/documentation",
);

function cdata(name: string): string {
  const text = readFileSync(join(docs, `${name}.bml`), "utf8");
  const match = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (!match?.[1]) {
    throw new Error(`No CDATA in ${name}`);
  }
  return match[1]
    .split("\n")
    .map((line) => (line.startsWith("    ") ? line.slice(4) : line))
    .join("\n")
    .trim();
}

function printed(name: string): string {
  const body = cdata(name);
  const marker = "Printed help:\n";
  const index = body.indexOf(marker);
  return index < 0 ? body : body.slice(index + marker.length).trim();
}

describe("machineblocks help", () => {
  it("copies the printed pages from the documentation blocks", () => {
    expect(HELP).toBe(cdata("Help"));
    expect(VALIDATE_HELP).toBe(printed("ValidateCommand"));
    expect(COMPILE_HELP).toBe(printed("CompileCommand"));
    expect(INIT_HELP).toBe(printed("InitCommand"));
    expect(UPDATE_HELP).toBe(printed("UpdateCommand"));
  });

  it("prints a page per command", () => {
    expect(execute(["--help"], ".").lines).toEqual([HELP]);
    expect(execute(["validate", "--help"], ".").lines).toEqual([VALIDATE_HELP]);
    expect(execute(["compile", "--help"], ".").lines).toEqual([COMPILE_HELP]);
    expect(execute(["init", "--help"], ".").lines).toEqual([INIT_HELP]);
    expect(execute(["update", "--help"], ".").lines).toEqual([UPDATE_HELP]);
  });

  it("prints short usage when compile has no selector", () => {
    const result = execute(["compile"], ".");
    expect(result.code).toBe(2);
    expect(result.lines.join("\n")).toContain(COMPILE_USAGE);
    expect(result.lines.join("\n")).not.toContain("When:");
  });
});
