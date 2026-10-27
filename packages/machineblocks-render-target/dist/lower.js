import { parseExpression } from "@blockml/framework";
import { FUNCTION_NO_RUNTIME, LEAF_VALUE_UNSUPPORTED } from "./diagnostics.js";
import { isIdentifier, serializeTyped } from "./serialize.js";
const MATH = {
    "#math.min": "min",
    "#math.max": "max",
    "#math.floor": "floor",
    "#math.ceil": "ceil",
    "#math.round": "round",
    "#math.abs": "abs",
};
const INDEX_FIELDS = {
    "com.machineblocks.bml.type.AxisXY": ["x", "y"],
    "com.machineblocks.bml.type.AxisXYZ": ["x", "y", "z"],
    "com.machineblocks.bml.type.SizeXYZ": ["x", "y", "z"],
    "com.machineblocks.bml.type.OffsetXYZ": ["x", "y", "z"],
    "com.machineblocks.bml.type.RotationXYZ": ["x", "y", "z"],
    "com.machineblocks.bml.type.FaceMapXY": ["xNeg", "xPos", "yNeg", "yPos"],
    "com.machineblocks.bml.type.FaceMapXYZ": ["xNeg", "xPos", "yNeg", "yPos", "zNeg", "zPos"],
    "com.machineblocks.bml.type.WallGap": ["face", "pos", "len"],
    "com.machineblocks.bml.type.SelectiveGrid": ["start", "end", "value"],
};
const WALL_GAP = "com.machineblocks.bml.type.WallGap";
const FIELD_TYPES = {
    [WALL_GAP]: { face: "com.machineblocks.bml.type.FaceAxisXY" },
    "com.machineblocks.bml.type.SelectiveGrid": {
        start: "com.machineblocks.bml.type.AxisXY",
        end: "com.machineblocks.bml.type.AxisXY",
    },
};
export function lowerExpression(raw, scope) {
    const parsed = parseExpression(raw);
    if (!parsed.ok) {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: parsed.error.message };
    }
    return lowerNode(parsed.result.ast, scope);
}
export function lowerMember(kind, literal, raw, scope) {
    if (kind === "expression") {
        return lowerExpression(raw ?? "", scope);
    }
    const outcome = serializeTyped(literal, scopeOptions(scope));
    if (!outcome.ok) {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: outcome.message };
    }
    return { ok: true, scad: outcome.scad, constant: true };
}
export function propertyTypesOf(members) {
    const types = new Map();
    for (const member of members) {
        if (member.kind !== "property") {
            continue;
        }
        types.set(member.name, { typeFqn: member.typeFqn || undefined, type: member.type });
    }
    return types;
}
export function asProperty(member) {
    return member.kind === "property";
}
function lowerNode(node, scope) {
    const folded = tryFold(node);
    if (folded !== undefined) {
        const outcome = serializeTyped(folded, scopeOptions(scope));
        if (outcome.ok) {
            return { ok: true, scad: outcome.scad, constant: true };
        }
    }
    switch (node.kind) {
        case "literal":
            return lowerMember("literal", node.value, undefined, scope);
        case "array":
            return lowerList(node.elements, scope);
        case "object":
            return lowerObject(node.entries, scope);
        case "binary": {
            const left = lowerNode(node.left, scope);
            if (!left.ok) {
                return left;
            }
            const right = lowerNode(node.right, untyped(scope));
            if (!right.ok) {
                return right;
            }
            return { ok: true, scad: `(${left.scad} ${node.operator} ${right.scad})`, constant: false };
        }
        case "call":
            return lowerCall(node.callee, node.args, scope);
        case "property":
            return lowerProperty(node.path, scope);
        case "interpolated":
            return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Interpolated text is not a SCAD expression." };
        default:
            return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Expression cannot be lowered." };
    }
}
function lowerList(elements, scope) {
    const elementScope = listElementScope(scope);
    const parts = [];
    let constant = true;
    for (const element of elements) {
        const lowered = lowerNode(element, elementScope);
        if (!lowered.ok) {
            return lowered;
        }
        constant &&= lowered.constant;
        parts.push(lowered.scad);
    }
    return { ok: true, scad: `[${parts.join(", ")}]`, constant };
}
function lowerObject(entries, scope) {
    const foldedEntries = {};
    const dynamic = {};
    let constant = true;
    for (const [key, node] of Object.entries(entries)) {
        const lowered = lowerNode(node, fieldScope(scope, key));
        if (!lowered.ok) {
            return lowered;
        }
        dynamic[key] = lowered;
        constant &&= lowered.constant;
        const value = tryFold(node);
        if (value !== undefined) {
            foldedEntries[key] = value;
        }
    }
    if (constant) {
        const outcome = serializeTyped(foldedEntries, scopeOptions(scope));
        if (outcome.ok) {
            return { ok: true, scad: outcome.scad, constant: true };
        }
    }
    if (isWallGap(scope.typeFqn)) {
        return lowerDynamicWallGap(dynamic);
    }
    const fields = indexFields(scope.typeFqn) ?? Object.keys(entries);
    const parts = [];
    for (const field of fields) {
        const lowered = dynamic[field];
        if (!lowered) {
            return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: `Expression object is missing ${field}.` };
        }
        parts.push(lowered.scad);
    }
    return { ok: true, scad: `[${parts.join(", ")}]`, constant: false };
}
function lowerCall(callee, args, scope) {
    if (callee.startsWith("@") || callee.startsWith("#model") || callee.includes("@bean") || callee.startsWith("@model")) {
        return { ok: false, code: FUNCTION_NO_RUNTIME, message: `${callee} has no OpenSCAD runtime.` };
    }
    const name = MATH[callee];
    if (!name) {
        return { ok: false, code: FUNCTION_NO_RUNTIME, message: `${callee} has no OpenSCAD runtime.` };
    }
    const parts = [];
    let constant = true;
    for (const arg of args) {
        const lowered = lowerNode(arg, untyped(scope));
        if (!lowered.ok) {
            return lowered;
        }
        constant &&= lowered.constant;
        parts.push(lowered.scad);
    }
    return { ok: true, scad: `${name}(${parts.join(", ")})`, constant: false };
}
function lowerProperty(path, scope) {
    const segments = path.flatMap((segment) => segment.split(".")).filter((segment) => segment.length > 0);
    if (segments[0] === "#this") {
        segments.shift();
    }
    const head = segments[0];
    if (!head || head.startsWith("@") || head.startsWith("#")) {
        return {
            ok: false,
            code: FUNCTION_NO_RUNTIME,
            message: `${path.join(".")} has no OpenSCAD runtime.`,
        };
    }
    if (segments.length === 1 && !scope.properties.has(head) && !scope.locals.has(head)) {
        const token = enumConstant(head, scope);
        if (token) {
            return { ok: true, scad: token, constant: true };
        }
    }
    if (!isIdentifier(head)) {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: `${head} is not a SCAD name.` };
    }
    let scad = head;
    let current = scope.properties.get(head);
    for (let index = 1; index < segments.length; index += 1) {
        const field = segments[index];
        if (!field) {
            continue;
        }
        const fields = indexFields(current?.typeFqn);
        const ordinal = fields?.indexOf(field) ?? -1;
        if (ordinal < 0) {
            return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: `${head} has no SCAD index for ${field}.` };
        }
        scad = `${scad}[${ordinal}]`;
        current = undefined;
    }
    return { ok: true, scad, constant: false };
}
function enumConstant(name, scope) {
    const outcome = serializeTyped(name, scopeOptions(scope));
    if (!outcome.ok) {
        return undefined;
    }
    if (outcome.scad === `"${name}"`) {
        return undefined;
    }
    return outcome.scad;
}
function listElementScope(scope) {
    const type = scope.type;
    if (type?.kind === "named" && type.multiplicity) {
        return {
            ...scope,
            typeFqn: type.fqn,
            type: {
                kind: "named",
                fqn: type.fqn,
                ...(type.typeArguments ? { typeArguments: type.typeArguments } : {}),
            },
        };
    }
    if (type?.kind === "grouped" && type.multiplicity) {
        const inner = type.expression;
        return { ...scope, type: inner, typeFqn: inner.kind === "named" ? inner.fqn : undefined };
    }
    return untyped(scope);
}
function lowerDynamicWallGap(dynamic) {
    const face = dynamic.face;
    if (!face) {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Expression object is missing face." };
    }
    const pos = dynamic.pos ?? dynamic.position;
    const len = dynamic.len ?? dynamic.length;
    const lenIsFull = !len || (len.constant && (len.scad === '"full"' || len.scad === '"Full"'));
    const posScad = pos?.scad ?? "0";
    const posConstant = pos ? pos.constant : true;
    if (lenIsFull && (!pos || (pos.constant && pos.scad === "0"))) {
        return { ok: true, scad: `[${face.scad}]`, constant: face.constant };
    }
    if (lenIsFull || !len) {
        return { ok: true, scad: `[${face.scad}, ${posScad}]`, constant: face.constant && posConstant };
    }
    return {
        ok: true,
        scad: `[${face.scad}, ${posScad}, ${len.scad}]`,
        constant: face.constant && posConstant && len.constant,
    };
}
function isWallGap(typeFqn) {
    return typeFqn?.split("(")[0]?.trim() === WALL_GAP;
}
function fieldScope(scope, field) {
    const head = scope.typeFqn?.split("(")[0]?.trim();
    const typeFqn = head ? FIELD_TYPES[head]?.[field] : undefined;
    if (!typeFqn) {
        return untyped(scope);
    }
    return { ...scope, typeFqn, type: undefined };
}
function untyped(scope) {
    return { ...scope, typeFqn: undefined, type: undefined };
}
function scopeOptions(scope) {
    return { registry: scope.registry, typeFqn: scope.typeFqn, type: scope.type };
}
function indexFields(typeFqn) {
    if (!typeFqn) {
        return undefined;
    }
    const head = typeFqn.split("(")[0]?.trim();
    return head ? INDEX_FIELDS[head] : undefined;
}
function tryFold(node) {
    switch (node.kind) {
        case "literal":
            return node.value;
        case "array": {
            const elements = [];
            for (const element of node.elements) {
                const value = tryFold(element);
                if (value === undefined && !isNullLiteral(element)) {
                    return undefined;
                }
                elements.push(value);
            }
            return elements;
        }
        case "object": {
            const entries = {};
            for (const [key, child] of Object.entries(node.entries)) {
                const value = tryFold(child);
                if (value === undefined && !isNullLiteral(child)) {
                    return undefined;
                }
                entries[key] = value;
            }
            return entries;
        }
        case "binary": {
            const left = tryFold(node.left);
            const right = tryFold(node.right);
            if (typeof left !== "number" || typeof right !== "number") {
                return undefined;
            }
            switch (node.operator) {
                case "+":
                    return left + right;
                case "-":
                    return left - right;
                case "*":
                    return left * right;
                case "/":
                    return right === 0 ? undefined : left / right;
                default:
                    return undefined;
            }
        }
        case "call": {
            const name = MATH[node.callee];
            if (!name) {
                return undefined;
            }
            const args = node.args.map((arg) => tryFold(arg));
            if (args.some((arg) => typeof arg !== "number")) {
                return undefined;
            }
            const [a, b] = args;
            switch (name) {
                case "min":
                    return Math.min(a ?? 0, b ?? 0);
                case "max":
                    return Math.max(a ?? 0, b ?? 0);
                case "floor":
                    return Math.floor(a ?? 0);
                case "ceil":
                    return Math.ceil(a ?? 0);
                case "round":
                    return Math.round(a ?? 0);
                case "abs":
                    return Math.abs(a ?? 0);
                default:
                    return undefined;
            }
        }
        default:
            return undefined;
    }
}
function isNullLiteral(node) {
    return node.kind === "literal" && node.value === null;
}
//# sourceMappingURL=lower.js.map