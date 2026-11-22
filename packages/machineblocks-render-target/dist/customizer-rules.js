import { resolveEffectiveMembers } from "@blockml/framework";
import { compositionChildren } from "./composition.js";
import { hiddenCustomizer } from "./naming.js";
import { enumDropdown, enumOptions, isIdentifier, scadString, serializeStructProperty, serializeTyped, structPropertyNames } from "./serialize.js";
export const CUSTOMIZER_RULES_FQN = "com.machineblocks.bml.target.render.CustomizerRules";
export const SENTINEL_TOGGLE_FQN = "com.machineblocks.bml.target.render.SentinelToggle";
export const AXIS_VECTOR_FQN = "com.machineblocks.bml.target.render.AxisVector";
export const AXIS_COMPONENTS_FQN = "com.machineblocks.bml.target.render.AxisComponents";
export const TYPE_SPLIT_FQN = "com.machineblocks.bml.target.render.TypeSplit";
const BOOLEAN_TYPE = "org.blockml.bml.type.Boolean";
const ENUM_MARKER = "enum";
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
        return { ok: true, rules: { splits: [], axes: [], components: [], sentinels: [] } };
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
    const components = [];
    for (const child of compositionChildren(document.block, "components")) {
        if (child.kind !== "blockInstance" || child.instance.typeFqn !== AXIS_COMPONENTS_FQN) {
            return { ok: false, message: "CustomizerRules.components contains a value that is not an AxisComponents." };
        }
        const rule = componentRuleOf(child.instance);
        if (!rule.ok) {
            return rule;
        }
        components.push(rule.rule);
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
    return { ok: true, rules: { splits, axes, components, sentinels } };
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
    const components = projectComponents(input.name, input.value, alternatives, input.rules.components, input.names, input.registry);
    if (components !== undefined) {
        return components;
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
export function customizerText(name, scad, projection, type, registry) {
    if (!projection) {
        return assignment(name, scad, enumDropdown(type, scad, registry));
    }
    return projection.fields.map((field) => fieldText(field, type, registry)).join("\n");
}
/** Ungrouped parameters stay in order. Grouped projections follow, each in its own tab. */
export function formatCustomizer(entries, registry) {
    const plain = [];
    const groups = [];
    for (const entry of entries) {
        const text = customizerText(entry.name, entry.scad, entry.projection, entry.type, registry);
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
function fieldText(field, type, registry) {
    const hint = field.hint ?? enumDropdown(type, field.scad, registry);
    const suffix = hint ? ` // ${hint}` : "";
    const line = `${field.name} = ${field.scad};${suffix}`;
    return field.description ? `// ${field.description}\n${line}` : line;
}
function assignment(name, scad, hint) {
    return hint ? `${name} = ${scad}; // ${hint}` : `${name} = ${scad};`;
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
function projectComponents(name, value, alternatives, rules, names, registry) {
    for (const rule of rules) {
        const valueFqn = componentType(alternatives, rule, registry);
        if (!valueFqn) {
            continue;
        }
        const literals = rule.valueType === ENUM_MARKER
            ? enumComponents(value, rule.fields, valueFqn, registry)
            : booleanComponents(value, rule.fields);
        if (!literals) {
            return undefined;
        }
        const fieldNames = [];
        const fields = [];
        for (let index = 0; index < rule.fields.length; index += 1) {
            const axis = rule.fields[index];
            const literal = literals[index];
            if (!axis || literal === undefined) {
                return undefined;
            }
            const fieldName = `${name}${axisSuffix(axis)}`;
            if (!isIdentifier(fieldName) || names.has(fieldName) || fieldNames.includes(fieldName)) {
                return undefined;
            }
            fieldNames.push(fieldName);
            fields.push({ name: fieldName, scad: literal });
        }
        const hiddenName = hiddenCustomizer(name);
        if (!isIdentifier(hiddenName) || names.has(hiddenName)) {
            return undefined;
        }
        return {
            fields,
            hiddenName,
            expression: `[${fieldNames.join(", ")}]`,
        };
    }
    return undefined;
}
function componentType(alternatives, rule, registry) {
    const axis = alternatives.find((alternative) => alternative.fqn === rule.axis);
    const argument = axis?.typeArguments?.[0];
    if (!axis || argument?.kind !== "named") {
        return undefined;
    }
    const valueFqn = rule.valueType === ENUM_MARKER ? argument.fqn : rule.valueType;
    const scalar = alternatives.find((alternative) => alternative !== axis && alternative.fqn === valueFqn);
    if (!scalar || argument.fqn !== valueFqn) {
        return undefined;
    }
    if (rule.valueType === ENUM_MARKER && !enumOptions(valueFqn, registry)?.length) {
        return undefined;
    }
    return valueFqn;
}
function enumComponents(value, fields, fqn, registry) {
    if (typeof value === "string") {
        const literal = enumLiteral(fqn, value, registry);
        return literal === undefined ? undefined : fields.map(() => literal);
    }
    if (!isRecord(value)) {
        return undefined;
    }
    const parts = [];
    for (const field of fields) {
        const component = value[field];
        if (typeof component !== "string") {
            return undefined;
        }
        const literal = enumLiteral(fqn, component, registry);
        if (literal === undefined) {
            return undefined;
        }
        parts.push(literal);
    }
    return parts;
}
function enumLiteral(fqn, member, registry) {
    const option = enumOptions(fqn, registry)?.find((candidate) => candidate.id === member || candidate.token === member);
    return option ? scadString(option.token) : undefined;
}
function axisShape(alternatives, rule) {
    const scalar = alternatives.find((alternative) => alternative.fqn === rule.valueType);
    const axis = alternatives.find((alternative) => alternative.fqn === rule.axis);
    if (!scalar || !axis || scalar === axis) {
        return false;
    }
    const argument = axis.typeArguments?.[0];
    return argument?.kind === "named" && argument.fqn === rule.valueType;
}
function booleanComponents(value, fields) {
    if (typeof value === "boolean") {
        const literal = value ? "true" : "false";
        return fields.map(() => literal);
    }
    if (!isRecord(value)) {
        return undefined;
    }
    const parts = [];
    for (const field of fields) {
        const component = value[field];
        if (typeof component !== "boolean") {
            return undefined;
        }
        parts.push(component ? "true" : "false");
    }
    return parts;
}
function axisSuffix(field) {
    return field.length === 0 ? field : `${field[0]?.toUpperCase() ?? ""}${field.slice(1)}`;
}
function componentRuleOf(instance) {
    const id = literalString(instance.id) ?? instance.typeFqn;
    const valueType = literalString(instance.memberValues.valueType);
    const axis = literalString(instance.memberValues.axis);
    const fields = axis ? AXIS_FIELDS[axis] : undefined;
    if (!valueType || !axis) {
        return { ok: false, message: `AxisComponents ${id} is missing a field.` };
    }
    if (valueType !== BOOLEAN_TYPE && valueType !== ENUM_MARKER) {
        return { ok: false, message: `AxisComponents ${id} value type ${valueType} is not Boolean or enum.` };
    }
    if (!fields) {
        return { ok: false, message: `AxisComponents ${id} axis ${axis} is not AxisXY or AxisXYZ.` };
    }
    return { ok: true, rule: { id, valueType, axis, fields } };
}
function projectAxis(name, value, alternatives, rules) {
    for (const rule of rules) {
        if (!axisShape(alternatives, rule)) {
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