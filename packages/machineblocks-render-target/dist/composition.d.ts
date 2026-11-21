import type { BlockDefinition, CompositionNode } from "@blockml/bom";
export declare function compositionChildren(block: BlockDefinition, aggregationName: string): CompositionNode[];
/** A BlockPresets catalog is JSON. Every other emitted block is SCAD. */
export declare function artifactExtension(block: BlockDefinition, registry: {
    get(fqn: string): {
        block: BlockDefinition;
    } | undefined;
}): "json" | "scad";
export declare function hasDirectives(block: BlockDefinition): boolean;
//# sourceMappingURL=composition.d.ts.map