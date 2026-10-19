import { compositionChildren } from "./composition.js";
import { PRESET_CYCLE, errorOutput } from "./diagnostics.js";
import { presetParameterValue } from "./serialize.js";
export function renderPresetFile(block, registry, outputRelativePath) {
    const instances = compositionChildren(block, "presets").flatMap((child) => child.kind === "blockInstance" ? [child.instance] : []);
    const byId = new Map();
    for (const instance of instances) {
        const id = literalString(instance.id);
        if (id) {
            byId.set(id, instance);
        }
    }
    const parameterSets = {};
    for (const instance of instances) {
        const merged = mergePreset(instance, byId, []);
        if (isFailure(merged)) {
            return merged;
        }
        const name = literalString(instance.memberValues.name) ?? literalString(instance.id) ?? "preset";
        const defaults = defaultsFor(instance.typeFqn, registry);
        const values = {};
        for (const [key, value] of Object.entries(merged)) {
            if (key === "name" || key === "basePresets") {
                continue;
            }
            if (defaults.get(key) === value) {
                continue;
            }
            values[key] = value;
        }
        parameterSets[name] = values;
    }
    const content = `${JSON.stringify({ fileFormatVersion: "1", parameterSets }, null, 2)}\n`;
    return {
        files: [{ path: outputRelativePath.replace(/\.scad$/, ".json"), content }],
    };
}
function mergePreset(instance, byId, stack) {
    const id = literalString(instance.id) ?? "";
    if (id && stack.includes(id)) {
        return errorOutput(PRESET_CYCLE, `Preset cycle at ${id}.`, instance.source ?? { file: "", line: 1, column: 1 });
    }
    const nextStack = id ? [...stack, id] : stack;
    const merged = {};
    for (const baseId of presetIds(instance.memberValues.basePresets)) {
        const base = byId.get(baseId);
        if (!base) {
            continue;
        }
        const resolved = mergePreset(base, byId, nextStack);
        if (isFailure(resolved)) {
            return resolved;
        }
        Object.assign(merged, resolved);
    }
    for (const [key, member] of Object.entries(instance.memberValues)) {
        if (key === "basePresets" || member.kind !== "literal") {
            continue;
        }
        const text = presetParameterValue(member);
        if (text !== undefined) {
            merged[key] = text;
        }
    }
    return merged;
}
function defaultsFor(typeFqn, registry) {
    const defaults = new Map();
    const definition = registry.get(typeFqn)?.block;
    if (!definition) {
        return defaults;
    }
    for (const member of definition.members) {
        if (member.kind !== "property" || !member.value || member.value.kind !== "literal") {
            continue;
        }
        const text = presetParameterValue(member.value);
        if (text !== undefined) {
            defaults.set(member.name, text);
        }
    }
    return defaults;
}
function presetIds(value) {
    if (!value || value.kind !== "literal") {
        return [];
    }
    if (typeof value.value === "string") {
        return [value.value];
    }
    if (Array.isArray(value.value) && value.value.every((item) => typeof item === "string")) {
        return value.value;
    }
    return [];
}
function literalString(value) {
    if (!value || value.kind !== "literal" || typeof value.value !== "string") {
        return undefined;
    }
    return value.value;
}
function isFailure(value) {
    return "files" in value;
}
//# sourceMappingURL=presets.js.map