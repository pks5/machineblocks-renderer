import type { PropertyDefinition, TypeExpression } from "@blockml/bom";
import { parseExpression, type ExpressionNode, type TypeRegistry } from "@blockml/framework";
import { FUNCTION_NO_RUNTIME, LEAF_VALUE_UNSUPPORTED } from "./diagnostics.js";
import { isIdentifier, serializeTyped, type SerializeOptions } from "./serialize.js";

const MATH: Record<string, string> = {
  "#math.min": "min",
  "#math.max": "max",
  "#math.floor": "floor",
  "#math.ceil": "ceil",
  "#math.round": "round",
  "#math.abs": "abs",
};

const INDEX_FIELDS: Record<string, readonly string[]> = {
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

const FIELD_TYPES: Record<string, Record<string, string>> = {
  "com.machineblocks.bml.type.WallGap": { face: "com.machineblocks.bml.type.FaceAxisXY" },
  "com.machineblocks.bml.type.SelectiveGrid": {
    start: "com.machineblocks.bml.type.AxisXY",
    end: "com.machineblocks.bml.type.AxisXY",
  },
};

export interface PropertyType {
  typeFqn?: string | undefined;
  type?: TypeExpression | undefined;
}

export interface LowerScope {
  registry?: TypeRegistry | undefined;
  typeFqn?: string | undefined;
  type?: TypeExpression | undefined;
  properties: ReadonlyMap<string, PropertyType>;
  locals: ReadonlySet<string>;
}

export interface Lowered {
  ok: true;
  scad: string;
  constant: boolean;
}

export interface LowerError {
  ok: false;
  code: string;
  message: string;
}

export function lowerExpression(raw: string, scope: LowerScope): Lowered | LowerError {
  const parsed = parseExpression(raw);
  if (!parsed.ok) {
    return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: parsed.error.message };
  }
  return lowerNode(parsed.result.ast, scope);
}

export function lowerMember(
  kind: "literal" | "expression",
  literal: unknown,
  raw: string | undefined,
  scope: LowerScope,
): Lowered | LowerError {
  if (kind === "expression") {
    return lowerExpression(raw ?? "", scope);
  }
  const outcome = serializeTyped(literal, scopeOptions(scope));
  if (!outcome.ok) {
    return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: outcome.message };
  }
  return { ok: true, scad: outcome.scad, constant: true };
}

export function propertyTypesOf(
  members: readonly { kind: string; name: string; typeFqn?: string; type?: TypeExpression }[],
): Map<string, PropertyType> {
  const types = new Map<string, PropertyType>();
  for (const member of members) {
    if (member.kind !== "property") {
      continue;
    }
    types.set(member.name, { typeFqn: member.typeFqn || undefined, type: member.type });
  }
  return types;
}

export function asProperty(member: { kind: string }): member is PropertyDefinition {
  return member.kind === "property";
}

function lowerNode(node: ExpressionNode, scope: LowerScope): Lowered | LowerError {
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

function lowerList(elements: readonly ExpressionNode[], scope: LowerScope): Lowered | LowerError {
  const elementScope = untyped(scope);
  const parts: string[] = [];
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

function lowerObject(entries: Record<string, ExpressionNode>, scope: LowerScope): Lowered | LowerError {
  const foldedEntries: Record<string, unknown> = {};
  const dynamic: Record<string, Lowered> = {};
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
  const fields = indexFields(scope.typeFqn) ?? Object.keys(entries);
  const parts: string[] = [];
  for (const field of fields) {
    const lowered = dynamic[field];
    if (!lowered) {
      return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: `Expression object is missing ${field}.` };
    }
    parts.push(lowered.scad);
  }
  return { ok: true, scad: `[${parts.join(", ")}]`, constant: false };
}

function lowerCall(callee: string, args: readonly ExpressionNode[], scope: LowerScope): Lowered | LowerError {
  if (callee.startsWith("@") || callee.startsWith("#model") || callee.includes("@bean") || callee.startsWith("@model")) {
    return { ok: false, code: FUNCTION_NO_RUNTIME, message: `${callee} has no OpenSCAD runtime.` };
  }
  const name = MATH[callee];
  if (!name) {
    return { ok: false, code: FUNCTION_NO_RUNTIME, message: `${callee} has no OpenSCAD runtime.` };
  }
  const parts: string[] = [];
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

function lowerProperty(path: string[], scope: LowerScope): Lowered | LowerError {
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

function enumConstant(name: string, scope: LowerScope): string | undefined {
  const outcome = serializeTyped(name, scopeOptions(scope));
  if (!outcome.ok) {
    return undefined;
  }
  if (outcome.scad === `"${name}"`) {
    return undefined;
  }
  return outcome.scad;
}

function fieldScope(scope: LowerScope, field: string): LowerScope {
  const head = scope.typeFqn?.split("(")[0]?.trim();
  const typeFqn = head ? FIELD_TYPES[head]?.[field] : undefined;
  if (!typeFqn) {
    return untyped(scope);
  }
  return { ...scope, typeFqn, type: undefined };
}

function untyped(scope: LowerScope): LowerScope {
  return { ...scope, typeFqn: undefined, type: undefined };
}

function scopeOptions(scope: LowerScope): SerializeOptions {
  return { registry: scope.registry, typeFqn: scope.typeFqn, type: scope.type };
}

function indexFields(typeFqn: string | undefined): readonly string[] | undefined {
  if (!typeFqn) {
    return undefined;
  }
  const head = typeFqn.split("(")[0]?.trim();
  return head ? INDEX_FIELDS[head] : undefined;
}

function tryFold(node: ExpressionNode): unknown {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "array": {
      const elements: unknown[] = [];
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
      const entries: Record<string, unknown> = {};
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
      const [a, b] = args as number[];
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

function isNullLiteral(node: ExpressionNode): boolean {
  return node.kind === "literal" && node.value === null;
}
