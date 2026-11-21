import { describe, expect, it } from "vitest";
import { parse } from "@blockml/parser";
import { TypeRegistry } from "@blockml/framework";
import { buildRenderSession, createRenderContext } from "@blockml/compiler";
import type { BomDocument } from "@blockml/bom";
import { BlockRenderEngine } from "@blockml/block-render-engine";
import { MachineBlocksRenderTarget } from "@machineblocks/render-target";
import { SHOP_OPTIONS, shopDocument } from "./shop-fixture.js";

const LIB = SHOP_OPTIONS;

function document(source: string, filePath: string): BomDocument {
  const parsed = parse(source, { filePath });
  if (!parsed.document) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return parsed.document;
}

function render(source: string, filePath: string, extras: BomDocument[] = []) {
  const registry = new TypeRegistry();
  registry.register(shopDocument());
  for (const extra of extras) {
    registry.register(extra);
  }
  registry.register(document(source, filePath));
  const session = buildRenderSession({
    typeRegistry: registry,
    targetName: "machineblocks-v3-scad",
    scopeKind: "document",
    sourceFilePath: filePath,
    outputBasePath: "/out",
  });
  const target = new MachineBlocksRenderTarget(new BlockRenderEngine());
  return target.render({ scope: { kind: "document" }, targetOptions: LIB }, createRenderContext(session));
}

const NATIVE = `<mbcore:NativeBlock xmlns="http://blockml.org/bml" xmlns:mbcore="com.machineblocks.bml.core" xmlns:type="org.blockml.bml.type">
  <is>Native</is>
  <properties>
    <studs type="type:Boolean"><value>true</value></studs>
  </properties>
</mbcore:NativeBlock>`;

const STANDARD = `<bricks:Standard xmlns="http://blockml.org/bml" xmlns:bricks="com.machineblocks.bml.bricks" xmlns:type="org.blockml.bml.type" xmlns:mbt="com.machineblocks.bml.type">
  <is>A brick</is>
  <properties>
    <size type="mbt:SizeXYZ"><value>{x:4,y:2,z:3}</value></size>
    <studs type="type:Boolean"><value>true</value></studs>
    <baseColor type="type:Text"><value>#EAC645</value></baseColor>
  </properties>
</bricks:Standard>`;

describe("composite, set, presets, source map", () => {
  it("emits a wrapper module for two NativeBlock children", () => {
    const result = render(
      `<?xml version="1.0"?>
<examples:Pair xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:examples="com.machineblocks.bml.examples"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:type="org.blockml.bml.type">
  <baseType>mbcore:Block</baseType>
  <is>Two parts</is>
  <properties>
    <studs type="type:Boolean"><value>true</value></studs>
    <label type="type:Text"><value>hi</value></label>
  </properties>
  <aggregations>
    <_parts override="true">
      <composition>
        <mbcore:NativeBlock bml:id="top" studs="\${ studs }" baseCutoutType="groove" />
        <mbcore:NativeBlock bml:id="bottom" studs="\${ studs }" tongue="true" />
      </composition>
    </_parts>
  </aggregations>
</examples:Pair>`,
      "pair.bml",
      [document(NATIVE, "native.bml")],
    );
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain("module mb__com__machineblocks__scad__examples__Pair(config = undef, settings = undef)");
    expect(content).toContain("studs = mb_param_studs(config, settings, true);");
    expect(content).toContain('label = mb_param(config, settings, "label", "hi");');
    expect(content).toContain('["base", false]');
    expect(content).toContain('["studs", false]');
    expect(content).toContain("mb_assembly_groove(gen_assembly, gen_renderGroups, gen_group_top)");
    expect(content).toContain("mb_assembly_tongue(gen_assembly, gen_renderGroups, gen_group_bottom)");
    expect(content).toContain('gen_part_top = "top";');
    expect(content).toContain("mb_block_id(gen_blockId, gen_part_bottom)");
  });

  it("reports an empty block", () => {
    const result = render(
      `<examples:Bare xmlns="http://blockml.org/bml" xmlns:examples="com.machineblocks.bml.examples" xmlns:mbcore="com.machineblocks.bml.core"><baseType>mbcore:Block</baseType><is>Empty</is></examples:Bare>`,
      "bare.bml",
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["MB_EMPTY_BLOCK"]);
  });

  it("emits STEPS and instance modules for a set", () => {
    const result = render(
      `<?xml version="1.0"?>
<sets:Kit xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:sets="com.example.bml.sets"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:bricks="com.machineblocks.bml.bricks">
  <baseType>mbcore:Set</baseType>
  <is>A set</is>
  <aggregations>
    <_parts override="true">
      <composition>
        <bricks:Standard bml:id="00002" direction="west" offset="{x:0,y:0,z:1}" size="{x:4,y:4,z:9}" />
        <bricks:Standard bml:id="00001" direction="north" size="{x:16,y:16,z:1}" />
      </composition>
    </_parts>
  </aggregations>
</sets:Kit>`,
      "kit.bml",
    );
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain('["00002", [4, 4, 9], "west", [0, 0, 1]]');
    expect(content).toContain('["00001", [16, 16, 1], "north", [0, 0, 0]]');
    expect(content).toContain("mb_parts_total_size(gen_STEPS)");
    expect(content).toContain('["base", false]');
    expect(content).toContain('["studs", false]');
    expect(content).toContain("mb_set_step_print_position(assembly, gen_STEPS, gen_i)");
    expect(content).toContain('["assembly", "merged"]');
    expect(content).toContain("combined ? highlightColor : baseColor");
    expect(content).toContain('["combined", true]');
    expect(content).toContain('highlightColor = "#55AB68"');
    expect(content).toContain('mb_param(config, settings, "mode", default="total")');
    expect(content).toContain('if (instanceId == "00002")');
    expect(content).toContain('else if (instanceId == "00001")');
    expect(content).toContain(`mb__com__machineblocks__scad__bricks__Standard(
        config = config,
        settings = [
            ["id", gen_blockId],
            ["size", size],
            ["direction", direction],
            ["offset", offset],
            ["baseColor", baseColor],
            ["assembly", assembly]
        ]
    );`);
    expect(content).toContain("use <../../../machineblocks/scad/bricks/Standard.scad>;");
    const map = JSON.parse((result.files[0] as { sourceMap?: string }).sourceMap ?? "{}") as { mappings?: string };
    const lineCount = content.endsWith("\n") ? content.slice(0, -1).split("\n").length : content.split("\n").length;
    expect(map.mappings?.split(";").length).toBe(lineCount);
  });

  it("emits preset JSON beside the target block, with defaults omitted and chains merged", () => {
    const result = render(
      `<?xml version="1.0"?>
<bricks:Catalog xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:bricks="com.machineblocks.bml.bricks">
  <baseType>mbcore:BlockPresets(bricks:Standard)</baseType>
  <is>Presets</is>
  <aggregations>
    <presets override="true">
      <composition>
        <bricks:Standard bml:id="brick_2x4" name="Brick 2x4" size="{x:2,y:4,z:3}" studs="true" />
        <bricks:Standard bml:id="color_blue" name="Blue" baseColor="#5296D5" />
        <bricks:Standard bml:id="brick_2x4_blue" name="Brick 2x4 Blue">
          <basePresets>brick_2x4</basePresets>
          <basePresets>color_blue</basePresets>
        </bricks:Standard>
      </composition>
    </presets>
  </aggregations>
</bricks:Catalog>`,
      "catalog.bml",
      [document(STANDARD, "standard.bml")],
    );
    expect(result.diagnostics ?? []).toEqual([]);
    expect(result.files[0]?.path).toBe("com/machineblocks/scad/bricks/Standard.json");
    const json = JSON.parse(result.files[0]?.content ?? "{}") as {
      fileFormatVersion: string;
      parameterSets: Record<string, Record<string, string>>;
    };
    expect(json.fileFormatVersion).toBe("1");
    expect(json.parameterSets["Brick 2x4"]).toEqual({ size: "[2, 4, 3]" });
    expect(json.parameterSets.Blue).toEqual({ baseColor: "#5296D5" });
    expect(json.parameterSets["Brick 2x4 Blue"]).toEqual({
      size: "[2, 4, 3]",
      baseColor: "#5296D5",
    });
  });

  it("follows T when a catalog closes an intermediate generic", () => {
    const mid = document(
      `<?xml version="1.0"?>
<ex:Mid xmlns="http://blockml.org/bml" xmlns:ex="com.example.bml" xmlns:mbcore="com.machineblocks.bml.core">
  <genericTypes><T baseType="mbcore:Block"/></genericTypes>
  <baseType>mbcore:BlockPresets(T)</baseType>
  <is>Open catalog</is>
</ex:Mid>`,
      "mid.bml",
    );
    const result = render(
      `<?xml version="1.0"?>
<ex:Closed xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:ex="com.example.bml"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:bricks="com.machineblocks.bml.bricks">
  <baseType>ex:Mid(bricks:Standard)</baseType>
  <is>Closed catalog</is>
  <aggregations>
    <presets override="true">
      <composition>
        <bricks:Standard bml:id="brick_2x4" name="Brick 2x4" size="{x:2,y:4,z:3}" />
      </composition>
    </presets>
  </aggregations>
</ex:Closed>`,
      "closed.bml",
      [document(STANDARD, "standard.bml"), mid],
    );
    expect(result.diagnostics ?? []).toEqual([]);
    expect(result.files[0]?.path).toBe("com/machineblocks/scad/bricks/Standard.json");
  });

  it("rejects a BlockPresets catalog that leaves T open", () => {
    const result = render(
      `<?xml version="1.0"?>
<ex:Mid xmlns="http://blockml.org/bml" xmlns:ex="com.example.bml" xmlns:mbcore="com.machineblocks.bml.core">
  <genericTypes><T baseType="mbcore:Block"/></genericTypes>
  <baseType>mbcore:BlockPresets(T)</baseType>
  <is>Open catalog</is>
</ex:Mid>`,
      "mid.bml",
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["BML_PRESET_TARGET_OPEN"]);
  });
});
