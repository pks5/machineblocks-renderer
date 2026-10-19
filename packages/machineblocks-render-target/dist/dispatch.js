import { BLOCK_FQN, SET_FQN } from "./version.js";
/** Authored baseType FQNs, then ancestors loaded in the registry. Nearest type first. */
export function baseTypeChain(block, registry) {
    const chain = [block.type];
    const seen = new Set([block.type]);
    let base = block.baseType;
    while (base !== undefined && !seen.has(base)) {
        chain.push(base);
        seen.add(base);
        base = registry.get(base)?.block.baseType;
    }
    return chain;
}
export function isRenderBlock(block, registry) {
    const chain = baseTypeChain(block, registry);
    return chain.includes(BLOCK_FQN) || chain.includes(SET_FQN);
}
/** Exact FQN, then the nearest baseType. Delegates use the same two steps. */
export function selectProcessor(block, registry, target) {
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
function mostSpecific(chain, processors) {
    let best;
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
//# sourceMappingURL=dispatch.js.map