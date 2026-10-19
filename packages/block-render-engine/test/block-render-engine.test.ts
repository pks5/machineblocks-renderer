import { describe, expect, it } from "vitest";
import type { BlockInstance } from "@blockml/bom";
import type { RenderContext } from "@blockml/compiler";
import { BlockRenderEngine, type BlockProcessor } from "@blockml/block-render-engine";

const block: BlockInstance = {
  typeFqn: "example.Block",
  memberValues: {},
};

const context = {
  blockFqn: "example.Block",
  outputRelativePath: "Example.scad",
} as RenderContext;

describe("BlockRenderEngine", () => {
  const engine = new BlockRenderEngine();

  it("returns the compile callback output unchanged", () => {
    const output = {
      files: [{ path: "Example.scad", content: "opaque {{{ not parsed" }],
    };
    const processor: BlockProcessor = {
      baseType: "example.Block",
      process: () => output,
      compile(receivedBlock, receivedContext) {
        expect(receivedBlock).toBe(block);
        expect(receivedContext).toBe(context);
        return output;
      },
    };

    expect(engine.compile(block, processor, context)).toBe(output);
  });

  it("reports a missing compile callback", () => {
    const processor: BlockProcessor = {
      baseType: "example.Block",
      process: () => ({ files: [] }),
    };

    const result = engine.compile(block, processor, context);

    expect(result.files).toEqual([]);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual([
      "BML_ENGINE_COMPILE_CALLBACK_MISSING",
    ]);
  });

  it("reports unsupported strategies", () => {
    const results = [
      engine.renderTemplate(block, "device.py.tpl"),
      engine.renderTemplates(block, ["device.py.tpl", "config.json.tpl"]),
      engine.copyTemplate("lib/math_service.scad", "lib/math_service.scad"),
      engine.callLLM(block, "generate", context),
    ];

    for (const result of results) {
      expect(result.files).toEqual([]);
      expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual([
        "BML_ENGINE_STRATEGY_UNSUPPORTED",
      ]);
    }
  });
});
