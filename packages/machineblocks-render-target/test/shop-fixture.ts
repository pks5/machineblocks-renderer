import { parse } from "@blockml/parser";
import type { BomDocument } from "@blockml/bom";

export const SHOP_FQN = "com.example.bml.config.Shop";
export const SHOP_PATH = "/out/com/example/bml/config/Shop.bml";

export const SHOP_OPTIONS = {
  "machineblocks-v3-scad": { mbLibPath: "/mb", configSet: SHOP_FQN },
};

export const SHOP_SOURCE = `<?xml version="1.0"?>
<config:Shop xmlns="http://blockml.org/bml"
  xmlns:bml="org.blockml.bml.annotation.BmlAnnotation"
  xmlns:config="com.example.bml.config"
  xmlns:mbcore="com.machineblocks.bml.core">
  <baseType>mbcore:ConfigSet</baseType>
  <is>A shop config</is>
  <aggregations>
    <profiles override="true">
      <composition>
        <mbcore:ConfigProfile bml:id="draft" name="Draft" printerLayerHeight="0.1" />
        <mbcore:ConfigProfile bml:id="final" name="Final" printerLayerHeight="0.2" />
      </composition>
    </profiles>
  </aggregations>
</config:Shop>
`;

export function shopDocument(): BomDocument {
  const parsed = parse(SHOP_SOURCE, { filePath: SHOP_PATH });
  if (!parsed.document) {
    throw new Error(parsed.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  return parsed.document;
}
