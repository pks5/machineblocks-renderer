import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "@blockml/parser";
import { TypeRegistry } from "@blockml/framework";
import { buildRenderSession, createRenderContext } from "@blockml/compiler";
import type { BomDocument } from "@blockml/bom";
import { BlockRenderEngine } from "@blockml/block-render-engine";
import { MachineBlocksRenderTarget } from "@machineblocks/render-target";
import { SHOP_OPTIONS, shopDocument } from "./shop-fixture.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = join(HERE, "../blocks/com/machineblocks/bml/target/render");

const AUTO = `<mbt:Auto xmlns="http://blockml.org/bml" xmlns:mbt="com.machineblocks.bml.type" xmlns:type="org.blockml.bml.type">
  <baseType>type:Block</baseType>
  <is>Auto</is>
  <properties>
    <value type="type:Text"><value>Auto</value></value>
  </properties>
</mbt:Auto>
`;

const BEVEL = `<mbt:Bevel xmlns="http://blockml.org/bml" xmlns:mbt="com.machineblocks.bml.type" xmlns:type="org.blockml.bml.type">
  <baseType>type:Block</baseType>
  <is>Bevel</is>
  <properties>
    <sw type="mbt:OffsetXY" />
    <nw type="mbt:OffsetXY" />
    <ne type="mbt:OffsetXY" />
    <se type="mbt:OffsetXY" />
  </properties>
</mbt:Bevel>
`;

const OFFSET_XY = `<mbt:OffsetXY xmlns="http://blockml.org/bml" xmlns:mbt="com.machineblocks.bml.type" xmlns:type="org.blockml.bml.type">
  <baseType>type:Block</baseType>
  <is>Offset</is>
  <properties>
    <x type="type:Decimal" />
    <y type="type:Decimal" />
  </properties>
</mbt:OffsetXY>
`;

const FALSE = `<type:False xmlns="http://blockml.org/bml" xmlns:type="org.blockml.bml.type">
  <baseType>type:Block</baseType>
  <is>False</is>
  <properties>
    <value type="type:Boolean"><value>false</value></value>
  </properties>
</type:False>
`;

const SAMPLE = `<bricks:Sample xmlns="http://blockml.org/bml"
  xmlns:bricks="com.machineblocks.bml.bricks"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:mbt="com.machineblocks.bml.type"
  xmlns:mbunit="com.machineblocks.bml.unit"
  xmlns:type="org.blockml.bml.type">
  <baseType>mbcore:Block</baseType>
  <is>A customizer sample</is>
  <properties>
    <recessDepth type="mbt:Auto | type:Decimal">
      <value>Auto</value>
    </recessDepth>
    <plates type="mbt:Auto | type:Decimal">
      <value>2</value>
    </plates>
    <bevel type="mbt:Bevel">
      <value>{sw:{x:0,y:0},nw:{x:0,y:0},ne:{x:1,y:2},se:{x:3,y:4}}</value>
    </bevel>
    <text type="type:Boolean.False | type:Text">
      <value>false</value>
    </text>
    <label type="type:Boolean.False | type:Text">
      <value>Hi</value>
    </label>
    <studIcon type="type:Boolean.False | type:FilePath">
      <value>false</value>
    </studIcon>
    <slope type="type:Boolean.False | mbt:FaceMapXY(type:Decimal)">
      <value>false</value>
    </slope>
    <holeXYGridOffsetZ type="type:Decimal(mbunit:MBU) | mbt:AxisXY(type:Decimal(mbunit:MBU))">
      <value>3.5</value>
    </holeXYGridOffsetZ>
    <perAxis type="type:Decimal | mbt:AxisXY(type:Decimal)">
      <value>{x:3,y:4}</value>
    </perAxis>
    <thickness type="type:Decimal | mbt:AxisXYZ(type:Decimal)">
      <value>2</value>
    </thickness>
    <shift type="type:Boolean | mbt:AxisXYZ(type:Boolean)">
      <value>true</value>
    </shift>
    <flags type="type:Boolean | mbt:AxisXY(type:Boolean)">
      <value>{x:true,y:false}</value>
    </flags>
    <holeXYZType type="mbt:HoleType | mbt:AxisXYZ(mbt:HoleType)">
      <value>Pin</value>
    </holeXYZType>
    <diameter type="mbt:Auto | type:Decimal | mbt:AxisXYZ(type:Decimal)">
      <value>Auto</value>
    </diameter>
  </properties>
  <aggregations>
    <_parts override="true">
      <composition>
        <mbcore:NativeBlock />
      </composition>
    </_parts>
  </aggregations>
</bricks:Sample>
`;

function document(source: string, filePath: string): BomDocument {
  const parsed = parse(source, { filePath });
  if (!parsed.document) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return parsed.document;
}

function render(): string {
  const registry = new TypeRegistry();
  registry.register(shopDocument());
  registry.register(document(AUTO, "auto.bml"));
  registry.register(document(OFFSET_XY, "offset.bml"));
  registry.register(document(BEVEL, "bevel.bml"));
  const falseConstant = document(FALSE, "false.bml");
  falseConstant.block.type = "org.blockml.bml.type.Boolean.False";
  registry.register(falseConstant);
  registry.register(document(readFileSync(join(RULES, "AxisComponents.bml"), "utf8"), "AxisComponents.bml"));
  registry.register(document(readFileSync(join(RULES, "TypeSplit.bml"), "utf8"), "TypeSplit.bml"));
  registry.register(document(readFileSync(join(RULES, "SentinelToggle.bml"), "utf8"), "SentinelToggle.bml"));
  registry.register(document(readFileSync(join(RULES, "CustomizerRules.bml"), "utf8"), "CustomizerRules.bml"));
  registry.register(document(SAMPLE, "sample.bml"));
  const session = buildRenderSession({
    typeRegistry: registry,
    targetName: "machineblocks-v3-scad",
    scopeKind: "document",
    sourceFilePath: "sample.bml",
    outputBasePath: "/out",
  });
  const target = new MachineBlocksRenderTarget(new BlockRenderEngine());
  const result = target.render({ scope: { kind: "document" }, targetOptions: SHOP_OPTIONS }, createRenderContext(session));
  expect(result.diagnostics ?? []).toEqual([]);
  return result.files?.[0]?.content ?? "";
}

describe("customizer rules", () => {
  it("splits a constant plus one flat value and leaves other unions alone", () => {
    const content = render();
    expect(content).toContain("recessDepthAuto = true;\nrecessDepth = 0;");
    expect(content).toContain('hlp_recessDepthResolved = recessDepthAuto ? "auto" : recessDepth;');
    expect(content).toContain('["recessDepth", hlp_recessDepthResolved]');
    expect(content).toContain("platesAuto = false;\nplates = 2;");
    expect(content.indexOf('studIcon = "";')).toBeLessThan(content.indexOf("/* [Bevel] */"));
    expect(content).toContain(`/* [Bevel] */
// Bevel X and Y for the corner [0,0] (grid)
bevel0 = [0, 0]; // [0:0.25:128]
// Bevel X and Y for the corner [0,1] (grid)
bevel1 = [0, 0]; // [0:0.25:128]
// Bevel X and Y for the corner [1,1] (grid)
bevel2 = [1, 2]; // [0:0.25:128]
// Bevel X and Y for the corner [1,0] (grid)
bevel3 = [3, 4]; // [0:0.25:128]`);
    expect(content).toContain("hlp_bevel = [bevel0, bevel1, bevel2, bevel3];");
    expect(content).toContain('["bevel", hlp_bevel]');
    expect(content).toContain('bevel = mb_param(config, settings, "bevel", [[0, 0], [0, 0], [1, 2], [3, 4]]);');
    expect(content).not.toContain("bevel = [[");
    expect(content).toContain('textOn = false;\ntext = "";');
    expect(content).toContain("hlp_textResolved = textOn ? text : false;");
    expect(content).toContain('labelOn = true;\nlabel = "Hi";');
    expect(content).toContain('studIconOn = false;\nstudIcon = "";');
    expect(content).toContain("hlp_studIconResolved = studIconOn ? studIcon : false;");
    expect(content).toContain("slope = false;");
    expect(content).not.toContain("slopeOn");
    expect(content).not.toContain('recessDepth = "auto"');
    expect(content).toContain("holeXYGridOffsetZ = [3.5, 3.5];");
    expect(content).toContain('["holeXYGridOffsetZ", holeXYGridOffsetZ]');
    expect(content).not.toContain("hlp_holeXYGridOffsetZ");
    expect(content).toContain("perAxis = [3, 4];");
    expect(content).toContain("thickness = [2, 2, 2];");
    expect(content).toContain("shiftX = true;\nshiftY = true;\nshiftZ = true;");
    expect(content).toContain("hlp_shift = [shiftX, shiftY, shiftZ];");
    expect(content).toContain('["shift", hlp_shift]');
    expect(content).toContain('shift = mb_param(config, settings, "shift", true);');
    expect(content).not.toContain("shift = [true");
    expect(content).toContain("flagsX = true;\nflagsY = false;");
    expect(content).toContain("hlp_flags = [flagsX, flagsY];");
    expect(content).toContain('["flags", hlp_flags]');
    expect(content).toContain('flags = mb_param(config, settings, "flags", [true, false]);');
    expect(content).toContain('holeXYZType = "Pin";');
    expect(content).toContain('diameter = "auto";');
    expect(content).toContain('holeXYGridOffsetZ = mb_param(config, settings, "holeXYGridOffsetZ", 3.5);');
  });
});
