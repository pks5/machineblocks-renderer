import { resolveEffectiveMembers } from "@blockml/framework";
import { compositionChildren } from "./composition.js";
import { LEAF_VALUE_UNSUPPORTED, errorOutput } from "./diagnostics.js";
import { lowerExpression, propertyTypesOf } from "./lower.js";
import { joinPosix, relativePosix, dirnamePosix } from "./paths.js";
import { mapManifestation, moduleNameForManifestation } from "./naming.js";
import { isIdentifier, serializeLiteral } from "./serialize.js";
import { withSourceMap } from "./source-map.js";
import { NATIVE_BLOCK_FQN, RENDER_TARGET_VERSION } from "./version.js";
const FIXED = ["size", "align", "offset", "direction"];
export function renderLeafFile(block, outputRelativePath, outputBasePath, mbLibPath, registry, mapping) {
    const source = block.source ?? { file: "", line: 1, column: 1 };
    const child = singleNativeBlock(block);
    if (!child) {
        return errorOutput(LEAF_VALUE_UNSUPPORTED, "A leaf block needs exactly one NativeBlock child.", source);
    }
    const root = mapManifestation(block.type, mapping, "selected");
    if (!root.ok) {
        return errorOutput(root.code, root.message, source);
    }
    const properties = block.members.filter((member) => member.kind === "property");
    const nativeNames = nativeNamesOf(registry);
    const scope = { registry, properties: propertyTypesOf(properties), locals: new Set() };
    const slots = new Map();
    for (const property of properties) {
        if (!property.value) {
            continue;
        }
        if (property.value.kind !== "literal" && property.value.kind !== "expression") {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, `Property ${property.name} cannot be serialized.`, property.source ?? source);
        }
        const lowered = lowerValue(property.value, { typeFqn: property.typeFqn || undefined, type: property.type }, scope);
        if (!lowered.ok) {
            return errorOutput(lowered.code, lowered.message, ("source" in property.value ? property.value.source : undefined) ?? source);
        }
        slots.set(property.name, {
            name: property.name,
            scad: lowered.scad,
            constant: lowered.constant,
            native: nativeNames.has(property.name),
        });
    }
    const childScad = new Map();
    for (const [parameter, member] of Object.entries(child.memberValues)) {
        const parameterType = propertyOn(child.typeFqn, parameter, registry);
        const lowered = lowerValue(member, parameterType, scope);
        if (!lowered.ok) {
            return errorOutput(lowered.code, lowered.message, ("source" in member ? member.source : undefined) ?? source);
        }
        childScad.set(parameter, lowered.scad);
        if (!slots.has(parameter) && lowered.constant) {
            slots.set(parameter, {
                name: parameter,
                scad: lowered.scad,
                constant: true,
                native: nativeNames.has(parameter),
            });
        }
    }
    const outputDir = dirnamePosix(joinPosix(outputBasePath, outputRelativePath));
    const blockImport = relativePosix(outputDir, joinPosix(mbLibPath, "lib/block.scad"));
    const configImport = relativePosix(outputDir, joinPosix(mbLibPath, "config/mb_config.scad"));
    const filename = outputRelativePath.split("/").pop() ?? `${block.name}.scad`;
    const moduleName = moduleNameForManifestation(root.fqn);
    const ordered = [...slots.values()];
    return {
        files: [
            withSourceMap(block, {
                path: outputRelativePath,
                content: fileText(block, filename, moduleName, blockImport, configImport, ordered, childScad),
            }),
        ],
    };
}
function lowerValue(member, parameterType, scope) {
    if (!member) {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Missing value." };
    }
    if (member.kind === "expression") {
        return lowerExpression(member.raw, { ...scope, typeFqn: parameterType.typeFqn, type: parameterType.type });
    }
    if (member.kind !== "literal") {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Value cannot be lowered." };
    }
    const scad = serializeLiteral(member, { registry: scope.registry, typeFqn: parameterType.typeFqn ?? member.typeFqn, type: parameterType.type });
    if (scad === undefined) {
        return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Parameter cannot be serialized." };
    }
    return { ok: true, scad, constant: true };
}
function singleNativeBlock(block) {
    const children = compositionChildren(block, "parts");
    const only = children.length === 1 ? children[0] : undefined;
    if (!only || only.kind !== "blockInstance" || only.instance.typeFqn !== NATIVE_BLOCK_FQN) {
        return undefined;
    }
    return only.instance;
}
function propertyOn(typeFqn, name, registry) {
    const definition = registry.get(typeFqn)?.block;
    if (!definition) {
        return {};
    }
    const property = resolveEffectiveMembers(definition, registry).find((member) => member.kind === "property" && member.name === name);
    if (!property || property.kind !== "property") {
        return {};
    }
    return { typeFqn: property.typeFqn || undefined, type: property.type };
}
function nativeNamesOf(registry) {
    const names = new Set();
    for (const member of registry.get(NATIVE_BLOCK_FQN)?.block.members ?? []) {
        if (member.kind === "property") {
            names.add(member.name);
        }
    }
    return names;
}
function fileText(block, filename, moduleName, blockImport, configImport, slots, childScad) {
    const customizer = slots.map((slot) => `${slot.name} = ${slot.scad};`).join("\n");
    const passed = slots.map((slot) => `        ["${slot.name}", ${slot.name}]`).join(",\n");
    const settingsBody = slots.length === 0 ? "" : `\n${passed}\n    `;
    const getterNames = new Set(slots.map((slot) => slot.name));
    const getters = [
        ...slots.map((slot) => getterLine(slot)),
        ...FIXED.filter((name) => !getterNames.has(name)).map((name) => `    ${name} = mb_param_${name}(config, settings);`),
    ].join("\n");
    const blockNames = [...childScad.keys()];
    for (const name of FIXED) {
        if (!blockNames.includes(name)) {
            blockNames.push(name);
        }
    }
    const blockSettings = blockNames
        .map((name) => `            ["${name}", ${blockExpression(name, childScad.get(name), slots)}]`)
        .join(",\n");
    return `/**
 * MachineBlocks.com Block File
 *
 * Name: ${block.name}
 * Filename: ${filename}
 * Package: ${block.type}
 * Generated by: machineblocks-render-target (${RENDER_TARGET_VERSION})
 */

/* Imports */
use <${blockImport}>;
include <${configImport}>;

/* Customization */
${customizer}

/* Main Module Call */
${moduleName}(
    config = mb_config,
    settings = [${settingsBody}]
);

/* Main Module Definition */
module ${moduleName}(config = undef, settings = undef) {
${getters}
    mb_block(
        config = config,
        settings = [
${blockSettings}
        ]
    );
}

/* Optional Sub Modules */
/* Optional Helper Modules */
/* Optional Global Functions */
`;
}
function blockExpression(name, child, slots) {
    if (child === undefined) {
        return name;
    }
    const slot = slots.find((entry) => entry.name === name);
    if (slot && (child === name || slot.scad === child)) {
        return name;
    }
    return child;
}
function getterLine(slot) {
    const fallback = slot.constant ? `, ${slot.scad}` : "";
    if (slot.native) {
        return `    ${slot.name} = mb_param_${slot.name}(config, settings${fallback});`;
    }
    return `    ${slot.name} = mb_param(config, settings, "${slot.name}"${fallback});`;
}
//# sourceMappingURL=leaf.js.map