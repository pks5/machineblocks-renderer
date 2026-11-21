import type { BlockDefinition, BlockInstance, LiteralValue, NamedTypeReference, TypeExpression } from "@blockml/bom";
import { resolveEffectiveMembers, type TypeRegistry } from "@blockml/framework";
import { compositionChildren } from "./composition.js";
import { hiddenCustomizer } from "./naming.js";
import { isIdentifier, serializeTyped } from "./serialize.js";

export const CUSTOMIZER_RULES_FQN = "com.machineblocks.bml.target.render.CustomizerRules";
export const SENTINEL_TOGGLE_FQN = "com.machineblocks.bml.target.render.SentinelToggle";
export const AXIS_VECTOR_FQN = "com.machineblocks.bml.target.render.AxisVector";

const AXIS_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "com.machineblocks.bml.type.AxisXY": ["x", "y"],
  "com.machineblocks.bml.type.AxisXYZ": ["x", "y", "z"],
};

const NUMBER_TYPES: ReadonlySet<string> = new Set([
  "org.blockml.bml.type.Decimal",
  "org.blockml.bml.type.Integer",
]);

/** Value arms a sentinel toggle can show as one customizer field. */
const VALUE_KINDS: Readonly<Record<string, "number" | "string" | "boolean">> = {
  "org.blockml.bml.type.Decimal": "number",
  "org.blockml.bml.type.Integer": "number",
  "org.blockml.bml.type.Text": "string",
  "org.blockml.bml.type.FilePath": "string",
  "org.blockml.bml.type.Boolean": "boolean",
};

export interface CustomizerField {
  name: string;
  scad: string;
}

export interface CustomizerProjection {
  fields: CustomizerField[];
  /** Set when the property value is a hidden recombination. An axis vector keeps the property name. */
  hiddenName?: string;
  expression?: string;
}

export interface CustomizerRuleSet {
  axes: AxisRule[];
  sentinels: SentinelRule[];
}

interface AxisRule {
  id: string;
  valueType: string;
  axis: string;
  fields: readonly string[];
}

interface SentinelRule {
  id: string;
  sentinel: string;
  valueType: string;
  checkboxSelects: "sentinel" | "value";
  checkboxSuffix: string;
  inactiveDefault: string;
  sentinelLiteral: string;
}

type Registry = TypeRegistry;

export function readCustomizerRules(
  registry: Registry,
): { ok: true; rules: CustomizerRuleSet } | { ok: false; message: string } {
  const document = registry.get(CUSTOMIZER_RULES_FQN);
  if (!document) {
    return { ok: true, rules: { axes: [], sentinels: [] } };
  }
  const axes: AxisRule[] = [];
  for (const child of compositionChildren(document.block, "axes")) {
    if (child.kind !== "blockInstance" || child.instance.typeFqn !== AXIS_VECTOR_FQN) {
      return { ok: false, message: "CustomizerRules.axes contains a value that is not an AxisVector." };
    }
    const rule = axisRuleOf(child.instance);
    if (!rule.ok) {
      return rule;
    }
    axes.push(rule.rule);
  }
  const sentinels: SentinelRule[] = [];
  for (const child of compositionChildren(document.block, "rules")) {
    if (child.kind !== "blockInstance" || child.instance.typeFqn !== SENTINEL_TOGGLE_FQN) {
      return { ok: false, message: "CustomizerRules.rules contains a value that is not a SentinelToggle." };
    }
    const rule = ruleOf(child.instance, registry);
    if (!rule.ok) {
      return rule;
    }
    sentinels.push(rule.rule);
  }
  return { ok: true, rules: { axes, sentinels } };
}

export function projectCustomizer(input: {
  name: string;
  type: TypeExpression | undefined;
  value: unknown;
  registry: Registry;
  rules: CustomizerRuleSet;
  names: ReadonlySet<string>;
}): CustomizerProjection | undefined {
  const alternatives = namedPair(input.type);
  if (!alternatives) {
    return undefined;
  }
  const axis = projectAxis(input.name, input.value, alternatives, input.rules.axes);
  if (axis !== undefined) {
    return axis;
  }
  for (const rule of input.rules.sentinels) {
    const sentinel = alternatives.find((alternative) => alternative.fqn === rule.sentinel);
    const valueArm = alternatives.find((alternative) => alternative.fqn === rule.valueType);
    if (!sentinel || !valueArm || sentinel === valueArm) {
      continue;
    }
    const kind = VALUE_KINDS[rule.valueType];
    if (!kind) {
      continue;
    }
    const sentinelHit = serializedAs(input.value, sentinel, input.registry) === rule.sentinelLiteral;
    const valueHit = typeof input.value === kind && !sentinelHit;
    if (!sentinelHit && !valueHit) {
      return undefined;
    }
    const checkbox = `${input.name}${rule.checkboxSuffix}`;
    const hiddenName = hiddenCustomizer(`${input.name}Resolved`);
    if (!isIdentifier(checkbox) || !isIdentifier(hiddenName) || input.names.has(checkbox) || input.names.has(hiddenName)) {
      return undefined;
    }
    const checked = rule.checkboxSelects === "sentinel" ? sentinelHit : !sentinelHit;
    const valueScad = valueHit ? serializedAs(input.value, valueArm, input.registry) : rule.inactiveDefault;
    if (valueScad === undefined) {
      return undefined;
    }
    const whenChecked = rule.checkboxSelects === "sentinel" ? rule.sentinelLiteral : input.name;
    const whenCleared = rule.checkboxSelects === "sentinel" ? input.name : rule.sentinelLiteral;
    return {
      fields: [
        { name: checkbox, scad: checked ? "true" : "false" },
        { name: input.name, scad: valueScad },
      ],
      hiddenName,
      expression: `${checkbox} ? ${whenChecked} : ${whenCleared}`,
    };
  }
  return undefined;
}

export function formatHidden(configAssignment: string, projections: readonly CustomizerProjection[]): string {
  const lines = projections.flatMap((projection) =>
    projection.hiddenName !== undefined && projection.expression !== undefined
      ? [`${projection.hiddenName} = ${projection.expression};`]
      : [],
  );
  return lines.length === 0 ? configAssignment : `${configAssignment}\n${lines.join("\n")}`;
}

export function customizerText(name: string, scad: string, projection: CustomizerProjection | undefined): string {
  if (!projection) {
    return `${name} = ${scad};`;
  }
  return projection.fields.map((field) => `${field.name} = ${field.scad};`).join("\n");
}

function projectAxis(
  name: string,
  value: unknown,
  alternatives: readonly NamedTypeReference[],
  rules: readonly AxisRule[],
): CustomizerProjection | undefined {
  for (const rule of rules) {
    const scalar = alternatives.find((alternative) => alternative.fqn === rule.valueType);
    const axis = alternatives.find((alternative) => alternative.fqn === rule.axis);
    if (!scalar || !axis || scalar === axis) {
      continue;
    }
    const argument = axis.typeArguments?.[0];
    if (argument?.kind !== "named" || argument.fqn !== rule.valueType) {
      continue;
    }
    const scad = axisLiteral(value, rule.fields);
    if (scad === undefined) {
      return undefined;
    }
    return { fields: [{ name, scad }] };
  }
  return undefined;
}

function axisLiteral(value: unknown, fields: readonly string[]): string | undefined {
  if (typeof value === "number") {
    return `[${fields.map(() => String(value)).join(", ")}]`;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const field of fields) {
    const component = value[field];
    if (typeof component !== "number") {
      return undefined;
    }
    parts.push(String(component));
  }
  return `[${parts.join(", ")}]`;
}

function axisRuleOf(instance: BlockInstance): { ok: true; rule: AxisRule } | { ok: false; message: string } {
  const id = literalString(instance.id) ?? instance.typeFqn;
  const valueType = literalString(instance.memberValues.valueType);
  const axis = literalString(instance.memberValues.axis);
  const fields = axis ? AXIS_FIELDS[axis] : undefined;
  if (!valueType || !axis) {
    return { ok: false, message: `AxisVector ${id} is missing a field.` };
  }
  if (!NUMBER_TYPES.has(valueType)) {
    return { ok: false, message: `AxisVector ${id} value type ${valueType} is not a number.` };
  }
  if (!fields) {
    return { ok: false, message: `AxisVector ${id} axis ${axis} is not AxisXY or AxisXYZ.` };
  }
  return { ok: true, rule: { id, valueType, axis, fields } };
}

function ruleOf(
  instance: BlockInstance,
  registry: Registry,
): { ok: true; rule: SentinelRule } | { ok: false; message: string } {
  const id = literalString(instance.id) ?? instance.typeFqn;
  const sentinel = literalString(instance.memberValues.sentinel);
  const valueType = literalString(instance.memberValues.valueType);
  const checkboxSelects = literalString(instance.memberValues.checkboxSelects);
  const checkboxSuffix = literalString(instance.memberValues.checkboxSuffix);
  const inactiveDefault = scadLiteral(instance.memberValues.inactiveDefault);
  if (!sentinel || !valueType || !checkboxSuffix || inactiveDefault === undefined) {
    return { ok: false, message: `SentinelToggle ${id} is missing a field.` };
  }
  if (checkboxSelects !== "sentinel" && checkboxSelects !== "value") {
    return { ok: false, message: `SentinelToggle ${id} checkboxSelects must be sentinel or value.` };
  }
  if (!VALUE_KINDS[valueType]) {
    return { ok: false, message: `SentinelToggle ${id} value type ${valueType} is not a flat customizer field.` };
  }
  const sentinelLiteral = sentinelScad(sentinel, registry);
  if (sentinelLiteral === undefined) {
    return { ok: false, message: `SentinelToggle ${id} cannot serialize ${sentinel}.` };
  }
  return {
    ok: true,
    rule: { id, sentinel, valueType, checkboxSelects, checkboxSuffix, inactiveDefault, sentinelLiteral },
  };
}

function sentinelScad(fqn: string, registry: Registry): string | undefined {
  const block = registry.get(fqn)?.block;
  if (!block) {
    return undefined;
  }
  const property = resolveEffectiveMembers(block, registry).find(
    (member) => member.kind === "property" && member.name === "value",
  );
  if (!property || property.kind !== "property" || property.value?.kind !== "literal") {
    return undefined;
  }
  const written = serializeTyped(property.value.value, {
    registry,
    typeFqn: fqn,
    type: { kind: "named", fqn },
  });
  return written.ok ? written.scad : undefined;
}

function namedPair(type: TypeExpression | undefined): NamedTypeReference[] | undefined {
  if (type?.kind !== "union" || type.alternatives.length !== 2) {
    return undefined;
  }
  const named = type.alternatives.filter((alternative): alternative is NamedTypeReference => alternative.kind === "named");
  return named.length === 2 ? named : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializedAs(
  value: unknown,
  alternative: { fqn: string },
  registry: Registry,
): string | undefined {
  const written = serializeTyped(value, {
    registry,
    typeFqn: alternative.fqn,
    type: { kind: "named", fqn: alternative.fqn },
  });
  return written.ok ? written.scad : undefined;
}

function scadLiteral(value: BlockInstance["memberValues"][string] | undefined): string | undefined {
  if (!value || value.kind !== "literal") {
    return undefined;
  }
  if (typeof value.value === "string") {
    return value.value;
  }
  if (typeof value.value === "number" || typeof value.value === "boolean") {
    return String(value.value);
  }
  return undefined;
}

function literalString(value: BlockInstance["id"] | BlockInstance["memberValues"][string] | undefined): string | undefined {
  if (!value || value.kind !== "literal" || typeof (value as LiteralValue).value !== "string") {
    return undefined;
  }
  return (value as LiteralValue).value as string;
}

export function projectionsOf(block: BlockDefinition, rules: CustomizerRuleSet, registry: Registry): Map<string, CustomizerProjection> {
  const names = new Set(
    block.members.flatMap((member) => (member.kind === "property" ? [member.name] : [])),
  );
  const projections = new Map<string, CustomizerProjection>();
  for (const member of block.members) {
    if (member.kind !== "property" || !member.type || member.value?.kind !== "literal") {
      continue;
    }
    const projection = projectCustomizer({
      name: member.name,
      type: member.type,
      value: member.value.value,
      registry,
      rules,
      names,
    });
    if (projection) {
      projections.set(member.name, projection);
    }
  }
  return projections;
}
