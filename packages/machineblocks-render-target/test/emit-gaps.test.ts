import { describe, expect, it } from "vitest";
import { parse } from "@blockml/parser";
import { TypeRegistry } from "@blockml/framework";
import { buildRenderSession, createRenderContext } from "@blockml/compiler";
import type { BomDocument } from "@blockml/bom";
import { BlockRenderEngine } from "@blockml/block-render-engine";
import { MachineBlocksRenderTarget } from "@machineblocks/render-target";

const LIB = { "machineblocks-v3-scad": { mbLibPath: "/mb" } };

const STUD_TYPE = `<mbt:StudType xmlns="http://blockml.org/bml" xmlns:bml="org.blockml.bml.annotation.BmlAnnotation" xmlns:mbt="com.machineblocks.bml.type">
  <baseType>mbt:MBEnum(org.blockml.bml.type.Text)</baseType>
  <aggregations>
    <values override="true">
      <composition>
        <mbt:StudType bml:id="Solid" value="solid" />
        <mbt:StudType bml:id="Hollow" value="hollow" />
      </composition>
    </values>
  </aggregations>
</mbt:StudType>`;

const FACE_AXIS = `<mbt:FaceAxisXY xmlns="http://blockml.org/bml" xmlns:bml="org.blockml.bml.annotation.BmlAnnotation" xmlns:mbt="com.machineblocks.bml.type">
  <baseType>mbt:MBEnum(org.blockml.bml.type.Text)</baseType>
  <aggregations>
    <values override="true">
      <composition>
        <mbt:FaceAxisXY bml:id="Y" value="y" />
        <mbt:FaceAxisXY bml:id="XNeg" value="x-" />
      </composition>
    </values>
  </aggregations>
</mbt:FaceAxisXY>`;

const DIRECTION = `<mbt:Direction xmlns="http://blockml.org/bml" xmlns:bml="org.blockml.bml.annotation.BmlAnnotation" xmlns:mbt="com.machineblocks.bml.type">
  <baseType>mbt:MBEnum(org.blockml.bml.type.Text)</baseType>
  <aggregations>
    <values override="true">
      <composition>
        <mbt:Direction bml:id="West" value="west" />
        <mbt:Direction bml:id="North" value="north" />
      </composition>
    </values>
  </aggregations>
</mbt:Direction>`;

const BRICK = `<bricks:Brick xmlns="http://blockml.org/bml" xmlns:bricks="com.machineblocks.bml.bricks" xmlns:mbt="com.machineblocks.bml.type">
  <properties>
    <size type="mbt:SizeXYZ"><value>{x:4,y:2,z:3}</value></size>
    <direction type="mbt:Direction"><value>West</value></direction>
  </properties>
</bricks:Brick>`;

function document(source: string, filePath: string): BomDocument {
  const parsed = parse(source, { filePath });
  if (!parsed.document) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return parsed.document;
}

function render(source: string, filePath: string, extras: BomDocument[] = []) {
  const registry = new TypeRegistry();
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

function leaf(properties: string, childAttributes: string): string {
  return `<?xml version="1.0"?>
<bricks:Plate xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:bricks="com.machineblocks.bml.bricks"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:type="org.blockml.bml.type"
  xmlns:mbt="com.machineblocks.bml.type">
  <baseType>mbcore:Block</baseType>
  <is>A plate</is>
  <properties>
    ${properties}
  </properties>
  <aggregations>
    <_parts override="true">
      <composition>
        <mbcore:NativeBlock ${childAttributes} />
      </composition>
    </_parts>
  </aggregations>
</bricks:Plate>`;
}

describe("emit gaps", () => {
  const enums = [document(STUD_TYPE, "StudType.bml"), document(FACE_AXIS, "FaceAxisXY.bml")];

  it("emits an enum catalog token and struct literals in the customizer", () => {
    const result = render(
      leaf(
        `<studType type="mbt:StudType"><value>Solid</value></studType>
         <gap type="mbt:WallGap"><value>{face: "Y", pos: 1, len: 2}</value></gap>
         <full type="mbt:WallGap"><value>{face: "Y", len: "full"}</value></full>
         <pad type="mbt:FaceMapXY"><value>{xNeg: 0.2, xPos: 0.2, yNeg: 0.2, yPos: 0.2}</value></pad>
         <hole type="mbt:AxisXYZ"><value>{x: 3, y: 3, z: 4}</value></hole>
         <tint type="type:Color"><value>#EAC645</value></tint>
         <faces type="mbt:FaceMapXYZ"><value>{xNeg: 1, yPos: 2}</value></faces>
         <grid type="mbt:SelectiveGrid"><value>{start: {x: 0, y: 0}, end: {x: 1, y: 2}, value: true}</value></grid>`,
        'studType="${ studType }"',
      ),
      "plate.bml",
      enums,
    );
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain('studType = "solid";');
    expect(content).toContain('gap = ["y", 1, 2];');
    expect(content).toContain('full = ["y"];');
    expect(content).toContain("pad = 0.2;");
    expect(content).toContain("hole = [3, 4];");
    expect(content).toContain('tint = "#EAC645";');
    expect(content).toContain('faces = [["x-", 1], ["y+", 2]];');
    expect(content).toContain("grid = [[0, 0], [1, 2], true];");
  });

  it("writes no file when an enum id or a struct cannot be serialized", () => {
    const unknown = render(
      leaf(`<studType type="mbt:StudType"><value>Missing</value></studType>`, 'studType="${ studType }"'),
      "plate.bml",
      enums,
    );
    expect(unknown.files).toEqual([]);
    expect(unknown.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["BML_LEAF_VALUE_UNSUPPORTED"]);

    const struct = render(
      leaf(`<mystery type="type:Text"><value>{foo: 1}</value></mystery>`, ""),
      "plate.bml",
    );
    expect(struct.files).toEqual([]);
    expect(struct.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["BML_LEAF_VALUE_UNSUPPORTED"]);
  });

  it("lowers property indexes, math calls, and static objects", () => {
    const result = render(
      leaf(
        `<size type="mbt:SizeXYZ"><value>{x: 4, y: 6, z: 3}</value></size>
         <folded type="type:Decimal"><value>\${ #math.min(3, 1) }</value></folded>`,
        'height="${ #math.min(size.y, 2) }" box="${ {x: 1, y: 1, z: 3} }"',
      ),
      "plate.bml",
    );
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain("size = [4, 6, 3];");
    expect(content).toContain("folded = 1;");
    expect(content).toContain("box = [1, 1, 3];");
    expect(content).toContain('["height", min(size[1], 2)]');
    expect(content).toContain('["box", box]');
  });

  it("rejects a bean call without a file", () => {
    const result = render(
      leaf(`<label type="type:Text"><value>\${ @bean.label() }</value></label>`, ""),
      "plate.bml",
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["BML_FUNCTION_NO_RUNTIME_IMPL"]);
  });

  it("expands with, each, and if on a working copy", () => {
    const result = render(
      `<?xml version="1.0"?>
<examples:Span xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:examples="com.machineblocks.bml.examples"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:type="org.blockml.bml.type"
  xmlns:mbt="com.machineblocks.bml.type">
  <baseType>mbcore:Block</baseType>
  <is>Two parts sharing a with binding</is>
  <properties>
    <size type="mbt:SizeXYZ"><value>{x: 4, y: 6, z: 3}</value></size>
    <columns type="type:Integer"><value>2</value></columns>
    <rows type="type:Integer"><value>3</value></rows>
    <studs type="type:Boolean"><value>true</value></studs>
  </properties>
  <aggregations>
    <_parts override="true">
      <composition bml:with="b1SizeY=\${ size.y }">
        <mbcore:NativeBlock bml:id="a" size="\${ {x: size.x, y: b1SizeY, z: size.z} }" />
        <mbcore:NativeBlock bml:id="b" bml:if="\${ studs }" bml:each="i : \${ columns * rows }" bml:with="x=\${ i },y=\${ rows }" />
        <mbcore:NativeBlock bml:id="c" bml:each="item : \${ [1, 2] }" />
      </composition>
    </_parts>
  </aggregations>
</examples:Span>`,
      "span.bml",
    );
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain("b1SizeY = size[1];");
    expect(content).toContain('["size", [size[0], b1SizeY, size[2]]]');
    expect(content).toContain("for (i = [0 : (columns * rows) - 1]) {");
    expect(content).toContain("x = i;");
    expect(content).toContain("y = rows;");
    expect(content).toContain("if (studs) {");
    expect(content).toContain("for (item = [1, 2]) {");
  });

  it("keeps an unknown each shape and a directive on a Set deferred", () => {
    const block = render(
      `<?xml version="1.0"?>
<examples:Odd xmlns="http://blockml.org/bml" xmlns:bml="org.blockml.bml.annotation.BmlAnnotation" xmlns:examples="com.machineblocks.bml.examples" xmlns:mbcore="com.machineblocks.bml.core">
  <baseType>mbcore:Block</baseType>
  <aggregations>
    <_parts override="true">
      <composition>
        <mbcore:NativeBlock bml:id="a" bml:each="i, j : \${ 4 }" />
        <mbcore:NativeBlock bml:id="b" />
      </composition>
    </_parts>
  </aggregations>
</examples:Odd>`,
      "odd.bml",
    );
    expect(block.files).toEqual([]);
    expect(block.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["BML_DIRECTIVE_DEFERRED"]);

    const set = render(
      `<?xml version="1.0"?>
<sets:Kit xmlns="http://blockml.org/bml" xmlns:bml="org.blockml.bml.annotation.BmlAnnotation" xmlns:sets="com.example.bml.sets" xmlns:mbcore="com.machineblocks.bml.core" xmlns:bricks="com.machineblocks.bml.bricks">
  <baseType>mbcore:Set</baseType>
  <aggregations>
    <_parts override="true">
      <composition>
        <bricks:Brick bml:id="00001" bml:each="i : \${ 2 }" />
      </composition>
    </_parts>
  </aggregations>
</sets:Kit>`,
      "kit.bml",
    );
    expect(set.files).toEqual([]);
    expect(set.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["BML_DIRECTIVE_DEFERRED"]);
  });

  it("calls a part module with the type size default and enum direction", () => {
    const result = render(
      `<?xml version="1.0"?>
<sets:Kit xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:sets="com.example.bml.sets"
  xmlns:mbcore="com.machineblocks.bml.core"
  xmlns:bricks="com.machineblocks.bml.bricks">
  <baseType>mbcore:Set</baseType>
  <aggregations>
    <_parts override="true">
      <composition>
        <bricks:Brick bml:id="00001" direction="West" />
        <bricks:Brick bml:id="00002" />
      </composition>
    </_parts>
  </aggregations>
</sets:Kit>`,
      "kit.bml",
      [document(BRICK, "brick.bml"), document(DIRECTION, "Direction.bml")],
    );
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain('["00001", [4, 2, 3], "west", [0, 0, 0]]');
    expect(content).toContain('["00002", [4, 2, 3], "west", [0, 0, 0]]');
    expect(content).toContain(`mb__com__machineblocks__scad__bricks__Brick(
        config = mb_config,
        settings = [
            ["size", [4, 2, 3]],
            ["offset", [0, 0, 0]],
            ["direction", "west"]
        ]
    );`);
    expect(content).not.toContain("translate(");
  });
});
