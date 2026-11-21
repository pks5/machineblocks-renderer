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
  const falseConstant = document(FALSE, "false.bml");
  falseConstant.block.type = "org.blockml.bml.type.Boolean.False";
  registry.register(falseConstant);
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

describe("customizer sentinel rules", () => {
  it("splits a constant plus one flat value and leaves other unions alone", () => {
    const content = render();
    expect(content).toContain("recessDepthAuto = true;\nrecessDepth = 0;");
    expect(content).toContain('hlp_recessDepthResolved = recessDepthAuto ? "auto" : recessDepth;');
    expect(content).toContain('["recessDepth", hlp_recessDepthResolved]');
    expect(content).toContain("platesAuto = false;\nplates = 2;");
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
    expect(content).toContain("shift = true;");
    expect(content).not.toContain("shift = [true");
    expect(content).toContain('holeXYZType = "Pin";');
    expect(content).toContain('diameter = "auto";');
    expect(content).toContain('holeXYGridOffsetZ = mb_param(config, settings, "holeXYGridOffsetZ", 3.5);');
  });
});
