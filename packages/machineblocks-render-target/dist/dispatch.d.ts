import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext } from "@blockml/compiler";
import type { BlockProcessor } from "@blockml/block-render-engine";
export interface DispatchTarget {
    processors: readonly BlockProcessor[];
    delegates: readonly DispatchTarget[];
}
/** Authored baseType FQNs, then ancestors loaded in the registry. Nearest type first. */
export declare function baseTypeChain(block: BlockDefinition, registry: RenderContext["session"]["typeRegistry"]): string[];
export declare function isRenderBlock(block: BlockDefinition, registry: RenderContext["session"]["typeRegistry"]): boolean;
/** Exact FQN, then the nearest baseType. Delegates use the same two steps. */
export declare function selectProcessor(block: BlockDefinition, registry: RenderContext["session"]["typeRegistry"], target: DispatchTarget): BlockProcessor | undefined;
//# sourceMappingURL=dispatch.d.ts.map