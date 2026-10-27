import type { LiteralValue, TypeExpression } from "@blockml/bom";
import { collectBaseTypeChain, resolveEffectiveMembers, type TypeRegistry } from "@blockml/framework";
import { compositionChildren } from "./composition.js";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ENUM_TYPE = "org.blockml.bml.type.EnumType";
const COLOR_TYPE = "org.blockml.bml.type.Color";
const AUTO_TYPE = "com.machineblocks.bml.type.Auto";
const AXIS_XY = "com.machineblocks.bml.type.AxisXY";
const AXIS_XYZ = "com.machineblocks.bml.type.AxisXYZ";
const SIZE_XYZ = "com.machineblocks.bml.type.SizeXYZ";
const OFFSET_XYZ = "com.machineblocks.bml.type.OffsetXYZ";
const ROTATION_XYZ = "com.machineblocks.bml.type.RotationXYZ";
const FACE_MAP_XY = "com.machineblocks.bml.type.FaceMapXY";
const FACE_MAP_XYZ = "com.machineblocks.bml.type.FaceMapXYZ";
const WALL_GAP = "com.machineblocks.bml.type.WallGap";
const SELECTIVE_GRID = "com.machineblocks.bml.type.SelectiveGrid";

const TRIPLE = ["x", "y", "z"] as const;
const FACE4 = ["xNeg", "xPos", "yNeg", "yPos"] as const;
const FACE6 = ["xNeg", "xPos", "yNeg", "yPos", "zNeg", "zPos"] as const;
const FACE_TOKEN: Record<string, string> = {
  xNeg: "x-",
  xPos: "x+",
  yNeg: "y-",
  yPos: "y+",
  zNeg: "z-",
  zPos: "z+",
};

export interface SerializeOptions {
  registry?: TypeRegistry | undefined;
  typeFqn?: string | undefined;
  type?: TypeExpression | undefined;
}

export interface SerializeSuccess {
  ok: true;
  scad: string;
}

export interface SerializeFailure {
  ok: false;
  message: string;
}

export function isIdentifier(raw: string): boolean {
  return IDENTIFIER.test(raw.trim());
}

export function scadString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Customizer JSON stores every value as a string. Strings stay unquoted. */
export function presetParameterValue(value: LiteralValue, options?: SerializeOptions): string | undefined {
  const scad = serializeLiteral(value, options);
  if (scad === undefined) {
    return undefined;
  }
  if (scad.startsWith('"') && scad.endsWith('"')) {
    return scad.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return scad;
}

export function serializeLiteral(value: LiteralValue, options?: SerializeOptions): string | undefined {
  const outcome = serializeTyped(value.value, {
    registry: options?.registry,
    typeFqn: options?.typeFqn ?? value.typeFqn,
    type: options?.type,
  });
  return outcome.ok ? outcome.scad : undefined;
}

export function serializeTyped(value: unknown, options: SerializeOptions = {}): SerializeSuccess | SerializeFailure {
  return writeValue(value, options.type, options.typeFqn, options.registry);
}

function writeValue(
  value: unknown,
  type: TypeExpression | undefined,
  typeFqn: string | undefined,
  registry: TypeRegistry | undefined,
): SerializeSuccess | SerializeFailure {
  const described = describe(type, typeFqn);
  if (described.kind === "union") {
    let failure: SerializeFailure = { ok: false, message: "Value matches no alternative of the union." };
    for (const alternative of described.alternatives) {
      const attempt = writeValue(value, alternative, undefined, registry);
      if (attempt.ok) {
        return attempt;
      }
      failure = attempt;
    }
    return failure;
  }
  if (described.list) {
    if (!Array.isArray(value)) {
      return { ok: false, message: "A list value must be an array." };
    }
    const items: string[] = [];
    for (const item of value) {
      const written = writeValue(item, described.element, described.elementFqn, registry);
      if (!written.ok) {
        return written;
      }
      items.push(written.scad);
    }
    return { ok: true, scad: `[${items.join(", ")}]` };
  }
  return writeScalar(value, described.fqn, registry);
}

interface DescribedType {
  kind: "named" | "union";
  fqn?: string | undefined;
  list: boolean;
  element?: TypeExpression | undefined;
  elementFqn?: string | undefined;
  alternatives: TypeExpression[];
}

function describe(type: TypeExpression | undefined, typeFqn: string | undefined): DescribedType {
  if (type?.kind === "union") {
    return { kind: "union", list: false, alternatives: type.alternatives };
  }
  if (type?.kind === "grouped") {
    const inner = describe(type.expression, typeFqn);
    return { ...inner, list: inner.list || type.multiplicity !== undefined };
  }
  if (type?.kind === "named") {
    return {
      kind: "named",
      fqn: type.fqn,
      list: type.multiplicity !== undefined,
      element: type.multiplicity ? { kind: "named", fqn: type.fqn, ...(type.typeArguments ? { typeArguments: type.typeArguments } : {}) } : undefined,
      elementFqn: type.fqn,
      alternatives: [],
    };
  }
  const fqn = bareFqn(typeFqn);
  const list = typeFqn?.includes("[") === true;
  return { kind: "named", fqn, list, elementFqn: fqn, alternatives: [] };
}

function bareFqn(typeFqn: string | undefined): string | undefined {
  if (!typeFqn) {
    return undefined;
  }
  const trimmed = typeFqn.trim();
  if (!trimmed) {
    return undefined;
  }
  const head = trimmed.split("(")[0]?.replace(/\[\]/g, "").trim();
  return head || undefined;
}

function writeScalar(
  value: unknown,
  fqn: string | undefined,
  registry: TypeRegistry | undefined,
): SerializeSuccess | SerializeFailure {
  if (typeof value === "boolean" || typeof value === "number") {
    return { ok: true, scad: String(value) };
  }
  if (typeof value === "string") {
    return writeString(value, fqn, registry);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (const item of value) {
      const written = writeScalar(item, undefined, registry);
      if (!written.ok) {
        return written;
      }
      items.push(written.scad);
    }
    return { ok: true, scad: `[${items.join(", ")}]` };
  }
  if (!isRecord(value)) {
    return { ok: false, message: "Value cannot be serialized." };
  }
  return writeStruct(value, fqn, registry);
}

function writeString(
  value: string,
  fqn: string | undefined,
  registry: TypeRegistry | undefined,
): SerializeSuccess | SerializeFailure {
  if (fqn === AUTO_TYPE) {
    return value === "Auto" || value === "auto"
      ? { ok: true, scad: scadString("auto") }
      : { ok: false, message: `Auto does not accept ${value}.` };
  }
  if (fqn && isEnum(fqn, registry)) {
    const token = enumToken(fqn, value, registry);
    if (!token) {
      return { ok: false, message: `Unknown enum member ${value} on ${fqn}.` };
    }
    return { ok: true, scad: scadString(token) };
  }
  if (fqn === COLOR_TYPE || isColor(fqn, registry)) {
    return { ok: true, scad: scadString(value) };
  }
  return { ok: true, scad: scadString(value) };
}

function writeStruct(
  value: Record<string, unknown>,
  fqn: string | undefined,
  registry: TypeRegistry | undefined,
): SerializeSuccess | SerializeFailure {
  const head = resolvedHead(fqn, registry);
  if (head === WALL_GAP || isWallGap(fqn, registry)) {
    return writeWallGap(value, registry);
  }
  if (head === SELECTIVE_GRID) {
    return writeSelectiveGrid(value, registry);
  }
  if (head === FACE_MAP_XY) {
    return writeFace4(value, registry);
  }
  if (head === FACE_MAP_XYZ) {
    return writeFace6(value, registry);
  }
  if (head === AXIS_XYZ) {
    return writeAxisXYZ(value, registry);
  }
  if (head === AXIS_XY || head === SIZE_XYZ || head === OFFSET_XYZ || head === ROTATION_XYZ) {
    const fields = head === AXIS_XY ? (["x", "y"] as const) : TRIPLE;
    return writeFields(value, [...fields], undefined, registry);
  }
  if (fqn === COLOR_TYPE || isColor(fqn, registry)) {
    const hex = value.hex;
    if (typeof hex === "string") {
      return { ok: true, scad: scadString(hex) };
    }
  }
  const declared = declaredFields(fqn, registry);
  if (declared && declared.length > 0) {
    return writeFields(value, declared, fqn, registry);
  }
  if (hasTriple(value)) {
    return writeFields(value, [...TRIPLE], undefined, registry);
  }
  return { ok: false, message: `Struct ${fqn ?? "value"} cannot be serialized.` };
}

function writeFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  ownerFqn: string | undefined,
  registry: TypeRegistry | undefined,
): SerializeSuccess | SerializeFailure {
  const parts: string[] = [];
  for (const field of fields) {
    if (!(field in value)) {
      return { ok: false, message: `Struct is missing ${field}.` };
    }
    const fieldType = ownerFqn ? fieldTypeOf(ownerFqn, field, registry) : undefined;
    const written = writeValue(value[field], fieldType?.type, fieldType?.typeFqn, registry);
    if (!written.ok) {
      return written;
    }
    parts.push(written.scad);
  }
  return { ok: true, scad: `[${parts.join(", ")}]` };
}

function writeAxisXYZ(value: Record<string, unknown>, registry: TypeRegistry | undefined): SerializeSuccess | SerializeFailure {
  const parts: SerializeSuccess[] = [];
  for (const field of TRIPLE) {
    if (!(field in value)) {
      return { ok: false, message: `AxisXYZ is missing ${field}.` };
    }
    const written = writeValue(value[field], undefined, undefined, registry);
    if (!written.ok) {
      return written;
    }
    parts.push(written);
  }
  const [x, y, z] = parts;
  if (!x || !y || !z) {
    return { ok: false, message: "AxisXYZ is missing a component." };
  }
  if (x.scad === y.scad && y.scad === z.scad) {
    return x;
  }
  if (x.scad === y.scad) {
    return { ok: true, scad: `[${x.scad}, ${z.scad}]` };
  }
  return { ok: true, scad: `[${x.scad}, ${y.scad}, ${z.scad}]` };
}

function writeFace4(value: Record<string, unknown>, registry: TypeRegistry | undefined): SerializeSuccess | SerializeFailure {
  const written = faceParts(value, FACE4, registry);
  if (!written.ok) {
    return written;
  }
  const [xNeg, xPos, yNeg, yPos] = written.parts;
  if (!xNeg || !xPos || !yNeg || !yPos) {
    return { ok: false, message: "FaceMapXY is missing a face." };
  }
  if (xNeg === xPos && yNeg === yPos && xNeg === yNeg) {
    return { ok: true, scad: xNeg };
  }
  if (xNeg === xPos && yNeg === yPos) {
    return { ok: true, scad: `[${xNeg}, ${yNeg}]` };
  }
  return { ok: true, scad: `[${xNeg}, ${xPos}, ${yNeg}, ${yPos}]` };
}

function writeFace6(value: Record<string, unknown>, registry: TypeRegistry | undefined): SerializeSuccess | SerializeFailure {
  const extra = Object.keys(value).filter((key) => !FACE6.includes(key as (typeof FACE6)[number]));
  const missing = FACE6.filter((key) => !(key in value));
  if (extra.length > 0 || missing.length > 0) {
    return writeFacePairs(value, registry);
  }
  const written = faceParts(value, FACE6, registry);
  if (!written.ok) {
    return written;
  }
  return { ok: true, scad: `[${written.parts.join(", ")}]` };
}

function writeFacePairs(value: Record<string, unknown>, registry: TypeRegistry | undefined): SerializeSuccess | SerializeFailure {
  const pairs: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    const token = FACE_TOKEN[key] ?? key;
    const written = writeValue(raw, undefined, undefined, registry);
    if (!written.ok) {
      return written;
    }
    pairs.push(`[${scadString(token)}, ${written.scad}]`);
  }
  return { ok: true, scad: `[${pairs.join(", ")}]` };
}

function faceParts(
  value: Record<string, unknown>,
  fields: readonly string[],
  registry: TypeRegistry | undefined,
): { ok: true; parts: string[] } | SerializeFailure {
  const parts: string[] = [];
  for (const field of fields) {
    if (!(field in value)) {
      return { ok: false, message: `Face map is missing ${field}.` };
    }
    const written = writeValue(value[field], undefined, undefined, registry);
    if (!written.ok) {
      return written;
    }
    parts.push(written.scad);
  }
  return { ok: true, parts };
}

function writeWallGap(value: Record<string, unknown>, registry: TypeRegistry | undefined): SerializeSuccess | SerializeFailure {
  if (!("face" in value)) {
    return { ok: false, message: "WallGap is missing face." };
  }
  const faceType = isEnum("com.machineblocks.bml.type.FaceAxisXY", registry)
    ? "com.machineblocks.bml.type.FaceAxisXY"
    : undefined;
  const face = writeValue(value.face, undefined, faceType, registry);
  if (!face.ok) {
    return face;
  }
  return finishWallGap(face.scad, value, registry);
}

function finishWallGap(
  face: string,
  value: Record<string, unknown>,
  registry: TypeRegistry | undefined,
): SerializeSuccess | SerializeFailure {
  const lenRaw = value.len ?? value.length;
  const posRaw = value.pos ?? value.position;
  const lenIsFull = lenRaw === "full" || lenRaw === "Full" || lenRaw === undefined;
  if (lenIsFull && (posRaw === undefined || posRaw === 0)) {
    return { ok: true, scad: `[${face}]` };
  }
  const pos = posRaw === undefined ? { ok: true as const, scad: "0" } : writeValue(posRaw, undefined, undefined, registry);
  if (!pos.ok) {
    return pos;
  }
  if (lenIsFull) {
    return { ok: true, scad: `[${face}, ${pos.scad}]` };
  }
  const len = writeValue(lenRaw, undefined, undefined, registry);
  if (!len.ok) {
    return len;
  }
  return { ok: true, scad: `[${face}, ${pos.scad}, ${len.scad}]` };
}

function writeSelectiveGrid(value: Record<string, unknown>, registry: TypeRegistry | undefined): SerializeSuccess | SerializeFailure {
  return writeFields(value, ["start", "end", "value"], SELECTIVE_GRID, registry);
}

function fieldTypeOf(
  ownerFqn: string,
  field: string,
  registry: TypeRegistry | undefined,
): { typeFqn?: string | undefined; type?: TypeExpression | undefined } | undefined {
  if (!registry) {
    return axisFieldType(ownerFqn, field);
  }
  const block = registry.get(ownerFqn)?.block;
  if (!block) {
    return axisFieldType(ownerFqn, field);
  }
  const property = resolveEffectiveMembers(block, registry).find(
    (member) => member.kind === "property" && member.name === field,
  );
  if (!property || property.kind !== "property") {
    return axisFieldType(ownerFqn, field);
  }
  return { typeFqn: property.typeFqn || undefined, type: property.type };
}

function axisFieldType(ownerFqn: string, field: string): { typeFqn?: string | undefined } | undefined {
  if ((ownerFqn === SELECTIVE_GRID || ownerFqn === AXIS_XY) && (field === "start" || field === "end" || field === "x" || field === "y")) {
    return { typeFqn: field === "start" || field === "end" ? AXIS_XY : undefined };
  }
  return undefined;
}

function declaredFields(fqn: string | undefined, registry: TypeRegistry | undefined): string[] | undefined {
  if (!fqn || !registry) {
    return undefined;
  }
  const block = registry.get(fqn)?.block;
  if (!block) {
    return undefined;
  }
  return resolveEffectiveMembers(block, registry).flatMap((member) =>
    member.kind === "property" ? [member.name] : [],
  );
}

function resolvedHead(fqn: string | undefined, registry: TypeRegistry | undefined): string | undefined {
  if (!fqn || !registry) {
    return fqn;
  }
  const block = registry.get(fqn)?.block;
  if (!block) {
    return fqn;
  }
  const chain = collectBaseTypeChain(block, registry).map((entry) => entry.type);
  if (chain.includes(WALL_GAP) || fqn === WALL_GAP) {
    return WALL_GAP;
  }
  if (fqn === SIZE_XYZ || fqn === OFFSET_XYZ || fqn === ROTATION_XYZ || fqn === AXIS_XY || fqn === AXIS_XYZ) {
    return fqn;
  }
  if (fqn === FACE_MAP_XY || fqn === FACE_MAP_XYZ || fqn === SELECTIVE_GRID) {
    return fqn;
  }
  return fqn;
}

function isWallGap(fqn: string | undefined, registry: TypeRegistry | undefined): boolean {
  if (!fqn) {
    return false;
  }
  if (fqn === WALL_GAP) {
    return true;
  }
  const block = registry?.get(fqn)?.block;
  if (!block || !registry) {
    return false;
  }
  return collectBaseTypeChain(block, registry).some((entry) => entry.type === WALL_GAP);
}

function isEnum(fqn: string, registry: TypeRegistry | undefined): boolean {
  const block = registry?.get(fqn)?.block;
  if (!block) {
    return false;
  }
  if (block.type === ENUM_TYPE || block.baseType?.includes("EnumType") || block.baseType?.includes("MBEnum")) {
    return true;
  }
  if (!registry) {
    return false;
  }
  return collectBaseTypeChain(block, registry).some(
    (entry) => entry.type === ENUM_TYPE || entry.baseType?.includes("MBEnum") === true,
  );
}

function isColor(fqn: string | undefined, registry: TypeRegistry | undefined): boolean {
  if (!fqn) {
    return false;
  }
  if (fqn === COLOR_TYPE) {
    return true;
  }
  const block = registry?.get(fqn)?.block;
  if (!block || !registry) {
    return false;
  }
  return collectBaseTypeChain(block, registry).some((entry) => entry.type === COLOR_TYPE || entry.baseType === COLOR_TYPE);
}

function enumToken(fqn: string, memberId: string, registry: TypeRegistry | undefined): string | undefined {
  const block = registry?.get(fqn)?.block;
  if (!block) {
    return undefined;
  }
  for (const child of compositionChildren(block, "values")) {
    if (child.kind !== "blockInstance") {
      continue;
    }
    const id = child.instance.id;
    if (!id || id.kind !== "literal" || id.value !== memberId) {
      continue;
    }
    const catalog = child.instance.memberValues.value;
    if (catalog?.kind === "literal" && typeof catalog.value === "string") {
      return catalog.value;
    }
  }
  return undefined;
}

function hasTriple(value: Record<string, unknown>): boolean {
  return typeof value.x === "number" && typeof value.y === "number" && typeof value.z === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
