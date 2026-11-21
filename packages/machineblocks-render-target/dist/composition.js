import { presetTarget } from "./preset-target.js";
export function compositionChildren(block, aggregationName) {
    const children = [];
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
/** A BlockPresets catalog is JSON. Every other emitted block is SCAD. */
export function artifactExtension(block, registry) {
    return presetTarget(block, registry).kind === "none" ? "scad" : "json";
}
export function hasDirectives(block) {
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
//# sourceMappingURL=composition.js.map