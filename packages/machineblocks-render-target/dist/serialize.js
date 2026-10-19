const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function isIdentifier(raw) {
    return IDENTIFIER.test(raw.trim());
}
export function scadString(value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
/** Customizer JSON stores every value as a string. Strings stay unquoted. */
export function presetParameterValue(value) {
    const raw = value.value;
    if (typeof raw === "string") {
        return raw;
    }
    if (typeof raw === "boolean" || typeof raw === "number") {
        return String(raw);
    }
    if (isSizeXYZ(raw)) {
        return `[${raw.x}, ${raw.y}, ${raw.z}]`;
    }
    return undefined;
}
export function serializeLiteral(value) {
    const raw = value.value;
    if (typeof raw === "boolean" || typeof raw === "number") {
        return String(raw);
    }
    if (typeof raw === "string") {
        return scadString(raw);
    }
    if (isSizeXYZ(raw)) {
        return `[${raw.x}, ${raw.y}, ${raw.z}]`;
    }
    return undefined;
}
function isSizeXYZ(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const record = value;
    return typeof record.x === "number" && typeof record.y === "number" && typeof record.z === "number";
}
//# sourceMappingURL=serialize.js.map