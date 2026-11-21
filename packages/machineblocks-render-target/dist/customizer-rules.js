import { resolveEffectiveMembers } from "@blockml/framework";
import { compositionChildren } from "./composition.js";
import { hiddenCustomizer } from "./naming.js";
import { isIdentifier, serializeTyped } from "./serialize.js";
export const CUSTOMIZER_RULES_FQN = "com.machineblocks.bml.target.render.CustomizerRules";
export const SENTINEL_TOGGLE_FQN = "com.machineblocks.bml.target.render.SentinelToggle";
/** Value arms this interpreter can show as one customizer field. */
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
        return { ok: true, rules: [] };
    }
    const rules = [];
    for (const child of compositionChildren(document.block, "rules")) {
        if (child.kind !== "blockInstance" || child.instance.typeFqn !== SENTINEL_TOGGLE_FQN) {
            return { ok: false, message: "CustomizerRules.rules contains a value that is not a SentinelToggle." };
        }
        const rule = ruleOf(child.instance, registry);
        if (!rule.ok) {
            return rule;
        }
        rules.push(rule.rule);
    }
    return { ok: true, rules };
}
export function projectCustomizer(input) {
    const alternatives = namedPair(input.type);
    if (!alternatives) {
        return undefined;
    }
    for (const rule of input.rules) {
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
    const lines = projections.map((projection) => `${projection.hiddenName} = ${projection.expression};`);
    return lines.length === 0 ? configAssignment : `${configAssignment}\n${lines.join("\n")}`;
}
export function customizerText(name, scad, projection) {
    if (!projection) {
        return `${name} = ${scad};`;
    }
    return projection.fields.map((field) => `${field.name} = ${field.scad};`).join("\n");
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
    const named = type.alternatives.flatMap((alternative) => alternative.kind === "named" ? [{ fqn: alternative.fqn }] : []);
    return named.length === 2 ? named : undefined;
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