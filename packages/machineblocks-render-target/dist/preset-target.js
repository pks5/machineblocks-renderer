import { PRESET_TARGET_OPEN } from "./diagnostics.js";
import { mapManifestation, pathForManifestation } from "./naming.js";
import { BLOCK_PRESETS_FQN } from "./version.js";
/** Closed T on BlockPresets, walking a catalog that binds T through an intermediate generic. */
export function presetTarget(block, registry) {
    const env = new Map();
    const seen = new Set();
    let current = block;
    while (current && !seen.has(current.type)) {
        seen.add(current.type);
        const applied = presetApplication(current);
        if (applied !== undefined) {
            const fqn = applied === "missing" ? undefined : resolveTypeArgument(applied, env);
            return fqn ? { kind: "closed", fqn } : { kind: "open" };
        }
        if (current.type === BLOCK_PRESETS_FQN) {
            return { kind: "open" };
        }
        const parentFqn = current.baseType;
        if (!parentFqn) {
            return { kind: "none" };
        }
        const parent = registry.get(parentFqn)?.block;
        bindGenericApplication(current, parent, env);
        if (!parent && parentFqn === BLOCK_PRESETS_FQN) {
            return { kind: "open" };
        }
        current = parent;
    }
    return { kind: "none" };
}
export function plannedOutputPath(block, registry, mapping) {
    const target = presetTarget(block, registry);
    if (target.kind === "open") {
        return {
            ok: false,
            code: PRESET_TARGET_OPEN,
            message: `${block.type} leaves BlockPresets parameter T open.`,
        };
    }
    const fqn = target.kind === "closed" ? target.fqn : block.type;
    const manifested = mapManifestation(fqn, mapping, target.kind === "closed" ? "reference" : "selected");
    if (!manifested.ok) {
        return manifested;
    }
    return { ok: true, path: pathForManifestation(manifested.fqn, target.kind === "closed" ? "json" : "scad") };
}
function presetApplication(block) {
    const expr = block.baseTypeExpression;
    if (expr?.kind === "named" && expr.fqn === BLOCK_PRESETS_FQN) {
        return expr.typeArguments?.[0] ?? "missing";
    }
    if (block.baseType === BLOCK_PRESETS_FQN && block.type !== BLOCK_PRESETS_FQN) {
        return "missing";
    }
    return undefined;
}
function bindGenericApplication(child, parent, env) {
    const parameters = parent?.genericTypes;
    if (!parameters || parameters.length === 0) {
        return;
    }
    const expr = child.baseTypeExpression;
    if (!expr || expr.kind !== "named" || expr.fqn !== parent.type) {
        return;
    }
    const args = expr.typeArguments ?? [];
    parameters.forEach((parameter, index) => {
        const arg = args[index];
        const resolved = arg ? resolveTypeArgument(arg, env) : resolveDefault(parameter.defaultType, env);
        if (resolved) {
            env.set(parameter.name, resolved);
        }
    });
}
function resolveDefault(defaultType, env) {
    if (!defaultType) {
        return undefined;
    }
    return env.get(defaultType) ?? (defaultType.includes(".") ? defaultType : undefined);
}
function resolveTypeArgument(expr, env) {
    if (expr.kind === "named") {
        return expr.fqn;
    }
    if (expr.kind === "genericParam") {
        return env.get(expr.name);
    }
    if (expr.kind === "grouped") {
        return resolveTypeArgument(expr.expression, env);
    }
    return undefined;
}
//# sourceMappingURL=preset-target.js.map