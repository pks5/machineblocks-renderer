import type { BlockDefinition, CompositionNode } from "@blockml/bom";

export function compositionChildren(block: BlockDefinition, aggregationName: string): CompositionNode[] {
  const children: CompositionNode[] = [];
  for (const composition of block.compositions) {
    if (composition.aggregationName === aggregationName) {
      children.push(...composition.children);
    }
  }
  if (children.length > 0 || block.compositions.length > 0) {
    return children;
  }
  if (aggregationName !== "parts") {
    return children;
  }
  for (const member of block.members) {
    if (member.kind === "aggregation" && member.name === aggregationName && member.composition) {
      children.push(...member.composition.children);
    }
  }
  return children;
}

/** Preset-only blocks are JSON. Every other emitted block is SCAD. */
export function artifactExtension(block: BlockDefinition): "json" | "scad" {
  const presets = compositionChildren(block, "presets");
  const parts = compositionChildren(block, "parts");
  return presets.length > 0 && parts.length === 0 ? "json" : "scad";
}

export function hasDirectives(block: BlockDefinition): boolean {
  for (const composition of block.compositions) {
    if (composition.directives && composition.directives.length > 0) {
      return true;
    }
    for (const child of composition.children) {
      if (child.directives && child.directives.length > 0) {
        return true;
      }
    }
  }
  return false;
}
