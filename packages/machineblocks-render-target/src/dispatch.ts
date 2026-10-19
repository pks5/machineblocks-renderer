import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext } from "@blockml/compiler";
import type { BlockProcessor } from "@blockml/block-render-engine";
import { BLOCK_FQN, SET_FQN } from "./version.js";

export interface DispatchTarget {
  processors: readonly BlockProcessor[];
  delegates: readonly DispatchTarget[];
}

/** Authored baseType FQNs, then ancestors loaded in the registry. Nearest type first. */
export function baseTypeChain(block: BlockDefinition, registry: RenderContext["session"]["typeRegistry"]): string[] {
  const chain = [block.type];
  const seen = new Set<string>([block.type]);
  let base = block.baseType;
  while (base !== undefined && !seen.has(base)) {
    chain.push(base);
    seen.add(base);
    base = registry.get(base)?.block.baseType;
  }
  return chain;
}

export function isRenderBlock(
  block: BlockDefinition,
  registry: RenderContext["session"]["typeRegistry"],
): boolean {
  const chain = baseTypeChain(block, registry);
  return chain.includes(BLOCK_FQN) || chain.includes(SET_FQN);
}

/** Exact FQN, then the nearest baseType. Delegates use the same two steps. */
export function selectProcessor(block: BlockDefinition, registry: RenderContext["session"]["typeRegistry"], target: DispatchTarget): BlockProcessor | undefined {
  const chain = baseTypeChain(block, registry);
  const own = mostSpecific(chain, target.processors);
  if (own) {
    return own;
  }
  for (const delegate of target.delegates) {
    const found = selectProcessor(block, registry, delegate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function mostSpecific(chain: readonly string[], processors: readonly BlockProcessor[]): BlockProcessor | undefined {
  let best: { processor: BlockProcessor; index: number } | undefined;
  for (const processor of processors) {
    const index = chain.indexOf(processor.baseType);
    if (index === -1) {
      continue;
    }
    if (!best || index < best.index) {
      best = { processor, index };
    }
  }
  return best?.processor;
}
