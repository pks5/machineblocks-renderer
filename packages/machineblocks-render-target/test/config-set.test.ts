import { describe, expect, it } from "vitest";
import { parse } from "@blockml/parser";
import { TypeRegistry } from "@blockml/framework";
import { buildRenderSession, createRenderContext } from "@blockml/compiler";
import type { BomDocument } from "@blockml/bom";
import { BlockRenderEngine } from "@blockml/block-render-engine";
import { MachineBlocksRenderTarget, resolveConfigSet } from "@machineblocks/render-target";
import { SHOP_OPTIONS, SHOP_PATH, SHOP_SOURCE, shopDocument } from "./shop-fixture.js";

function document(source: string, filePath: string): BomDocument {
  const parsed = parse(source, { filePath });
  if (!parsed.document) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return parsed.document;
}

function render(source: string, filePath: string, extras: BomDocument[] = [], targetOptions: unknown = SHOP_OPTIONS) {
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
  return target.render({ scope: { kind: "document" }, targetOptions }, createRenderContext(session));
}

function configSet(name: string, packageFqn: string, profiles: string): string {
  return `<?xml version="1.0"?>
<config:${name} xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:config="${packageFqn}"
  xmlns:mbcore="com.machineblocks.bml.core">
  <baseType>mbcore:ConfigSet</baseType>
  <is>A config set</is>
  <aggregations>
    <profiles override="true">
      <composition>
        ${profiles}
      </composition>
    </profiles>
  </aggregations>
</config:${name}>`;
}

const LEAF = `<?xml version="1.0"?>
<bricks:Plate xmlns="http://blockml.org/bml"
  xmlns:bricks="com.machineblocks.bml.bricks"
  xmlns:mbcore="com.machineblocks.bml.core">
  <baseType>mbcore:Block</baseType>
  <is>A plate</is>
  <aggregations>
    <_parts override="true">
      <composition>
        <mbcore:NativeBlock />
      </composition>
    </_parts>
  </aggregations>
</bricks:Plate>`;

describe("ConfigSet", () => {
  it("emits one function per profile and falls back to the first", () => {
    const result = render(SHOP_SOURCE, SHOP_PATH, [], { "machineblocks-v3-scad": { mbLibPath: "/mb" } });
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain("function mb__com__example__scad__config__Shop__func__config(profile) =");
    expect(content).toContain('profile == "draft" ? mb__com__example__scad__config__Shop__func__draft()');
    expect(content).toContain('profile == "final" ? mb__com__example__scad__config__Shop__func__final()');
    expect(content).toContain(": mb__com__example__scad__config__Shop__func__draft();");
    expect(content).toContain('function mb__com__example__scad__config__Shop__func__draft() = [\n    ["printerLayerHeight", 0.1]\n];');
    expect(content).not.toContain("configProfile");
    expect(content).not.toContain("use <");
  });

  it("builds the customizer dropdown from the selected set", () => {
    const mill = "com.example.bml.config.Mill";
    const result = render(LEAF, "plate.bml", [document(configSet("Mill", "com.example.bml.config", '<mbcore:ConfigProfile bml:id="coarse" name="Coarse" printerLayerHeight="0.3" />'), "/out/com/example/bml/config/Mill.bml")], {
      "machineblocks-v3-scad": { mbLibPath: "/mb", configSet: mill },
    });
    expect(result.diagnostics ?? []).toEqual([]);
    const content = result.files[0]?.content ?? "";
    expect(content).toContain('configProfile = "coarse"; // [coarse:Coarse]');
    expect(content).toContain("mb__com__example__scad__config__Mill__func__config(configProfile);");
    expect(content).toContain("use <../../../example/scad/config/Mill.scad>;");
    expect(content).not.toContain("draft:Draft");
  });

  it("reports a profile without a name", () => {
    const result = render(
      configSet("Bare", "com.example.bml.config", '<mbcore:ConfigProfile bml:id="only" printerLayerHeight="0.1" />'),
      "/out/com/example/bml/config/Bare.bml",
      [],
      { "machineblocks-v3-scad": { mbLibPath: "/mb" } },
    );
    expect(result.files).toEqual([]);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(["MB_CONFIG_PROFILE_INCOMPLETE"]);
  });

  it("uses the first project set, then the first core set", () => {
    const registry = new TypeRegistry();
    registry.register(document(abstractConfigSet(), "/core/blocks/com/machineblocks/bml/core/ConfigSet.bml"));
    registry.register(
      document(
        configSet("Aaa", "com.machineblocks.bml.config", '<mbcore:ConfigProfile bml:id="aaa" name="Aaa" />'),
        "/core/blocks/com/machineblocks/bml/config/Aaa.bml",
      ),
    );
    registry.register(
      document(
        configSet("DefaultConfigSet", "com.machineblocks.bml.config", '<mbcore:ConfigProfile bml:id="fine" name="Fine" />'),
        "/core/blocks/com/machineblocks/bml/config/DefaultConfigSet.bml",
      ),
    );
    expect(resolveConfigSet(registry, "/repo/blocks")).toEqual({
      ok: true,
      fqn: "com.machineblocks.bml.config.Aaa",
    });

    registry.register(
      document(
        configSet("Later", "com.example.bml.config", '<mbcore:ConfigProfile bml:id="beta" name="Beta" />'),
        "/repo/blocks/z/Later.bml",
      ),
    );
    registry.register(
      document(
        configSet("First", "com.example.bml.config", '<mbcore:ConfigProfile bml:id="alpha" name="Alpha" />'),
        "/repo/blocks/a/First.bml",
      ),
    );
    expect(resolveConfigSet(registry, "/repo/blocks")).toEqual({
      ok: true,
      fqn: "com.example.bml.config.First",
    });
  });
});

function abstractConfigSet(): string {
  return `<?xml version="1.0"?>
<mbcore:ConfigSet xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:mbcore="com.machineblocks.bml.core">
  <baseType>mbcore:Block</baseType>
  <is>A collection of config profiles</is>
  <abstract>true</abstract>
</mbcore:ConfigSet>`;
}
