import type { BlockDefinition, CompositionNode } from "@blockml/bom";
export declare function compositionChildren(block: BlockDefinition, aggregationName: string): CompositionNode[];
/** Preset-only blocks are JSON. Every other emitted block is SCAD. */
export declare function artifactExtension(block: BlockDefinition): "json" | "scad";
export declare function hasDirectives(block: BlockDefinition): boolean;
//# sourceMappingURL=composition.d.ts.map