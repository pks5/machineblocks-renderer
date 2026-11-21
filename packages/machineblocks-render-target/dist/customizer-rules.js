import { resolveEffectiveMembers } from "@blockml/framework";
import { compositionChildren } from "./composition.js";
import { hiddenCustomizer } from "./naming.js";
import { isIdentifier, serializeStructProperty, serializeTyped, structPropertyNames } from "./serialize.js";
export const CUSTOMIZER_RULES_FQN = "com.machineblocks.bml.target.render.CustomizerRules";
export const SENTINEL_TOGGLE_FQN = "com.machineblocks.bml.target.render.SentinelToggle";
export const AXIS_VECTOR_FQN = "com.machineblocks.bml.target.render.AxisVector";
export const TYPE_SPLIT_FQN = "com.machineblocks.bml.target.render.TypeSplit";
const AXIS_FIELDS = {
    "com.machineblocks.bml.type.AxisXY": ["x", "y"],
    "com.machineblocks.bml.type.AxisXYZ": ["x", "y", "z"],
};
const NUMBER_TYPES = new Set([
    "org.blockml.bml.type.Decimal",
    "org.blockml.bml.type.Integer",
]);
/** Value arms a sentinel toggle can show as one customizer field. */
const VALUE_KINDS = {
    "org.blockml.bml.type.Decimal": "number",
    "org.blockml.bml.type.Integer": "number",
    "org.blockml.bml.type.Text": "string",
    "org.blockml.bml.type.FilePath": "string",
    "org.blockml.bml.type.Boolean": "boolean",
};
export function readCustomizerRules(registry) {
    const document = registry.get(CUSTOMIZER_RULES_FQN);
    if (!document) {
        return { ok: true, rules: { splits: [], axes: [], sentinels: [] } };
    }
    const splits = [];
    for (const child of compositionChildren(document.block, "splits")) {
        if (child.kind !== "blockInstance" || child.instance.typeFqn !== TYPE_SPLIT_FQN) {
            return { ok: false, message: "CustomizerRules.splits contains a value that is not a TypeSplit." };
        }
        const rule = splitRuleOf(child.instance, registry);
        if (!rule.ok) {
            return rule;
        }
        splits.push(rule.rule);
    }
    const axes = [];
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
    const sentinels = [];
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
    return { ok: true, rules: { splits, axes, sentinels } };
}
export function projectCustomizer(input) {
    const split = projectTypeSplit(input.name, input.type, input.value, input.registry, input.rules.splits, input.names);
    if (split) {
        return split;
    }
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
export function formatHidden(configAssignment, projections) {
    const lines = projections.flatMap((projection) => projection.hiddenName !== undefined && projection.expression !== undefined
        ? [`${projection.hiddenName} = ${projection.expression};`]
        : []);
    return lines.length === 0 ? configAssignment : `${configAssignment}\n${lines.join("\n")}`;
}
export function customizerText(name, scad, projection) {
    if (!projection) {
        return `${name} = ${scad};`;
    }
    return projection.fields.map(fieldText).join("\n");
}
/** Ungrouped parameters stay in order. Grouped projections follow, each in its own tab. */
export function formatCustomizer(entries) {
    const plain = [];
    const groups = [];
    for (const entry of entries) {
        const text = customizerText(entry.name, entry.scad, entry.projection);
        const group = entry.projection?.group;
        if (!group) {
            plain.push(text);
            continue;
        }
        const existing = groups.find((item) => item.name === group);
        if (existing) {
            existing.lines.push(text);
        }
        else {
            groups.push({ name: group, lines: [text] });
        }
    }
    const sections = [];
    if (plain.length > 0) {
        sections.push(plain.join("\n"));
    }
    for (const group of groups) {
        sections.push(`/* [${group.name}] */\n${group.lines.join("\n")}`);
    }
    return sections.join("\n\n");
}
function fieldText(field) {
    const hint = field.hint ? ` // ${field.hint}` : "";
    const line = `${field.name} = ${field.scad};${hint}`;
    return field.description ? `// ${field.description}\n${line}` : line;
}
function projectTypeSplit(name, type, value, registry, rules, names) {
    if (type?.kind !== "named") {
        return undefined;
    }
    const rule = rules.find((candidate) => candidate.type === type.fqn);
    if (!rule || !isRecord(value)) {
        return undefined;
    }
    const fields = structPropertyNames(rule.type, registry);
    if (!fields || fields.length === 0 || fields.length !== rule.descriptions.length) {
        return undefined;
    }
    const parts = [];
    const customizerFields = [];
    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const description = rule.descriptions[index];
        if (!field || !description) {
            return undefined;
        }
        const written = serializeStructProperty(value, field, rule.type, registry);
        if (!written.ok) {
            return undefined;
        }
        const fieldName = `${name}${index}`;
        if (!isIdentifier(fieldName) || names.has(fieldName) || parts.includes(fieldName)) {
            return undefined;
        }
        parts.push(fieldName);
        customizerFields.push({ name: fieldName, scad: written.scad, description, hint: rule.range });
    }
    const hiddenName = hiddenCustomizer(name);
    if (!isIdentifier(hiddenName) || names.has(hiddenName)) {
        return undefined;
    }
    return {
        fields: customizerFields,
        hiddenName,
        expression: `[${parts.join(", ")}]`,
        group: rule.group,
    };
}
function splitRuleOf(instance, registry) {
    const id = literalString(instance.id) ?? instance.typeFqn;
    const type = literalString(instance.memberValues.type);
    const group = literalString(instance.memberValues.group);
    const range = literalString(instance.memberValues.range);
    const labels = descriptionLines(literalString(instance.memberValues.descriptions));
    if (!type || !group || !range || labels.length === 0) {
        return { ok: false, message: `TypeSplit ${id} is missing a field.` };
    }
    if (group.includes("]") || group.includes("\n")) {
        return { ok: false, message: `TypeSplit ${id} group cannot contain a bracket or a newline.` };
    }
    const declared = structPropertyNames(type, registry);
    if (declared && declared.length !== labels.length) {
        return {
            ok: false,
            message: `TypeSplit ${id} has ${labels.length} descriptions and ${type} has ${declared.length} properties.`,
        };
    }
    return { ok: true, rule: { id, type, group, range, descriptions: labels } };
}
function descriptionLines(value) {
    if (!value) {
        return [];
    }
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
function projectAxis(name, value, alternatives, rules) {
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
function axisLiteral(value, fields) {
    if (typeof value === "number") {
        return `[${fields.map(() => String(value)).join(", ")}]`;
    }
    if (!isRecord(value)) {
        return undefined;
    }
    const parts = [];
    for (const field of fields) {
        const component = value[field];
        if (typeof component !== "number") {
            return undefined;
        }
        parts.push(String(component));
    }
    return `[${parts.join(", ")}]`;
}
function axisRuleOf(instance) {
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
function ruleOf(instance, registry) {
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
function sentinelScad(fqn, registry) {
    const block = registry.get(fqn)?.block;
    if (!block) {
        return undefined;
    }
    const property = resolveEffectiveMembers(block, registry).find((member) => member.kind === "property" && member.name === "value");
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
function namedPair(type) {
    if (type?.kind !== "union" || type.alternatives.length !== 2) {
        return undefined;
    }
    const named = type.alternatives.filter((alternative) => alternative.kind === "named");
    return named.length === 2 ? named : undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function serializedAs(value, alternative, registry) {
    const written = serializeTyped(value, {
        registry,
        typeFqn: alternative.fqn,
        type: { kind: "named", fqn: alternative.fqn },
    });
    return written.ok ? written.scad : undefined;
}
function scadLiteral(value) {
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
function literalString(value) {
    if (!value || value.kind !== "literal" || typeof value.value !== "string") {
        return undefined;
    }
    return value.value;
}
export function projectionsOf(block, rules, registry) {
    const names = new Set(block.members.flatMap((member) => (member.kind === "property" ? [member.name] : [])));
    const projections = new Map();
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
//# sourceMappingURL=customizer-rules.js.map