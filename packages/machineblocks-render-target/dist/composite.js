import { compositionChildren } from "./composition.js";
import { LEAF_VALUE_UNSUPPORTED, errorOutput } from "./diagnostics.js";
import { dirnamePosix, joinPosix, relativePosix } from "./paths.js";
import { mapManifestation, moduleNameForManifestation } from "./naming.js";
import { isIdentifier, serializeLiteral } from "./serialize.js";
import { withSourceMap } from "./source-map.js";
import { NATIVE_BLOCK_FQN, RENDER_TARGET_VERSION } from "./version.js";
export function renderCompositeFile(block, outputRelativePath, outputBasePath, mbLibPath, registry, mapping) {
    const source = block.source ?? { file: "", line: 1, column: 1 };
    const children = compositionChildren(block, "parts").flatMap((child) => child.kind === "blockInstance" ? [child.instance] : []);
    const nativeNames = nativePropertyNames(registry);
    const properties = block.members.filter((member) => member.kind === "property");
    const root = mapManifestation(block.type, mapping, "selected");
    if (!root.ok) {
        return errorOutput(root.code, root.message, source);
    }
    const moduleName = moduleNameForManifestation(root.fqn);
    const filename = outputRelativePath.split("/").pop() ?? `${block.name}.scad`;
    const outputDir = dirnamePosix(joinPosix(outputBasePath, outputRelativePath));
    const blockImport = relativePosix(outputDir, joinPosix(mbLibPath, "lib/block.scad"));
    const configImport = relativePosix(outputDir, joinPosix(mbLibPath, "config/mb_config.scad"));
    const childBlocks = [];
    const partRows = [];
    let partsHaveSize = children.length > 0;
    for (const child of children) {
        const partId = literalText(child.id);
        if (!partId || !isIdentifier(`part_${partId}`)) {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, "A composite child needs an identifier id.", child.source ?? source);
        }
        const settings = [
            { parameter: "id", expression: `mb_block_id(blockId, part_${partId})` },
            { parameter: "render", expression: `mb_group_render(renderGroups, group_${partId})` },
        ];
        for (const [parameter, member] of Object.entries(child.memberValues)) {
            const expression = childExpression(block, partId, parameter, member, source);
            if (typeof expression !== "string") {
                return expression;
            }
            settings.push({ parameter, expression });
        }
        childBlocks.push(childRegion(partId, settings));
        const sizeLiteral = child.memberValues.size;
        if (sizeLiteral?.kind === "literal" && serializeLiteral(sizeLiteral)) {
            const direction = literalText(child.memberValues.direction) ?? "west";
            const offset = sizeLiteral && child.memberValues.offset?.kind === "literal"
                ? serializeLiteral(child.memberValues.offset) ?? "[0, 0, 0]"
                : "[0, 0, 0]";
            partRows.push(`    ["${partId}", ${serializeLiteral(sizeLiteral)}, "${direction}", ${offset}]`);
        }
        else {
            partsHaveSize = false;
        }
    }
    const declaresSize = properties.some((property) => property.name === "size");
    const partsLine = !declaresSize && partsHaveSize
        ? `    parts = [\n${partRows.join(",\n")}\n    ];\n    size = mb_parts_total_size(parts);\n`
        : "";
    const content = `${header(block, filename)}
/* Imports */
use <${blockImport}>;
include <${configImport}>;

/* Customization */
${customizerLines(properties)}

/* Main Module Call */
${moduleName}(
    config = mb_config,
    settings = [${settingsBody(properties.map((property) => `        ["${property.name}", ${property.name}]`))}]
);

/* Main Module Definition */
module ${moduleName}(config = undef, settings = undef) {
${propertyGetters(properties, nativeNames)}
    blockId = mb_param_id(config, settings, "${block.type}");
${fixedGetters(properties)}
    assembly = mb_assembly(config, settings, size, direction);
    renderGroups = mb_param_renderGroups(config, settings);
${partsLine}    mb_block(
        config = config,
        settings = [
            ["id", blockId],
            ["base", false],
            ["studs", false],
            ["size", size],
            ["align", align],
            ["offset", offset],
            ["direction", direction]
        ]
    ) {
${childBlocks.join("\n")}
    }
}

/* Optional Sub Modules */
/* Optional Helper Modules */
/* Optional Global Functions */
`;
    return { files: [withSourceMap(block, { path: outputRelativePath, content })] };
}
function childExpression(block, partId, parameter, member, source) {
    const group = `group_${partId}`;
    const namespace = `ns_${partId}`;
    if (member.kind === "expression") {
        if (!isIdentifier(member.raw)) {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, `Parameter ${parameter} must be a property reference or a literal.`, member.source ?? source);
        }
        const variable = member.raw.trim();
        if (parameter === "offset") {
            return `mb_assembly_offset(${variable}, assembly, renderGroups, ${group})`;
        }
        if (parameter === "baseAdjustment") {
            return `mb_params_filter(${variable}, ${namespace})`;
        }
        if (parameter === "baseCutoutType" && propertyDefaultText(block, variable) === "groove") {
            return `mb_assembly_groove(assembly, renderGroups, ${group})`;
        }
        if (parameter === "tongue" && propertyDefaultText(block, variable) === "true") {
            return `mb_assembly_tongue(assembly, renderGroups, ${group})`;
        }
        return variable;
    }
    if (member.kind !== "literal") {
        return errorOutput(LEAF_VALUE_UNSUPPORTED, `Parameter ${parameter} is not a literal.`, source);
    }
    if (parameter === "baseCutoutType" && member.value === "groove") {
        return `mb_assembly_groove(assembly, renderGroups, ${group})`;
    }
    if (parameter === "tongue" && member.value === true) {
        return `mb_assembly_tongue(assembly, renderGroups, ${group})`;
    }
    if (parameter === "offset") {
        const literal = serializeLiteral(member);
        if (!literal) {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, "offset cannot be serialized.", source);
        }
        return `mb_assembly_offset(${literal}, assembly, renderGroups, ${group})`;
    }
    if (parameter === "baseAdjustment") {
        const literal = serializeLiteral(member);
        if (!literal) {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, "baseAdjustment cannot be serialized.", source);
        }
        return literal;
    }
    const literal = serializeLiteral(member);
    if (!literal) {
        return errorOutput(LEAF_VALUE_UNSUPPORTED, `Parameter ${parameter} cannot be serialized.`, source);
    }
    return literal;
}
function childRegion(partId, settings) {
    const body = settings
        .map((setting) => `                ["${setting.parameter}", ${setting.expression}]`)
        .join(",\n");
    return `        part_${partId} = "${partId}";
        group_${partId} = part_${partId};
        ns_${partId} = part_${partId};
        mb_block(
            config = config,
            settings = [
${body}
            ]
        );`;
}
function propertyGetters(properties, nativeNames) {
    return properties
        .map((property) => {
        const fallback = property.value?.kind === "literal" ? serializeLiteral(property.value) : undefined;
        const suffix = fallback === undefined ? "" : `, ${fallback}`;
        if (nativeNames.has(property.name)) {
            return `    ${property.name} = mb_param_${property.name}(config, settings${suffix});`;
        }
        return `    ${property.name} = mb_param(config, settings, "${property.name}"${suffix});`;
    })
        .join("\n");
}
function fixedGetters(properties) {
    const declared = new Set(properties.map((property) => property.name));
    return ["size", "align", "offset", "direction"]
        .filter((name) => !declared.has(name))
        .map((name) => `    ${name} = mb_param_${name}(config, settings);`)
        .join("\n");
}
function customizerLines(properties) {
    return properties
        .map((property) => {
        const value = property.value?.kind === "literal" ? serializeLiteral(property.value) : undefined;
        return value === undefined ? undefined : `${property.name} = ${value};`;
    })
        .filter((line) => line !== undefined)
        .join("\n");
}
function settingsBody(lines) {
    if (lines.length === 0) {
        return "";
    }
    return `\n${lines.join(",\n")}\n    `;
}
function propertyDefaultText(block, name) {
    const property = block.members.find((member) => member.kind === "property" && member.name === name);
    if (!property?.value || property.value.kind !== "literal") {
        return undefined;
    }
    return String(property.value.value);
}
function literalText(value) {
    if (!value || value.kind !== "literal" || typeof value.value !== "string") {
        return undefined;
    }
    return value.value;
}
export function nativePropertyNames(registry) {
    const names = new Set();
    for (const member of registry.get(NATIVE_BLOCK_FQN)?.block.members ?? []) {
        if (member.kind === "property") {
            names.add(member.name);
        }
    }
    return names;
}
function header(block, filename) {
    return `/**
 * MachineBlocks.com Block File
 *
 * Name: ${block.name}
 * Filename: ${filename}
 * Package: ${block.type}
 * Generated by: machineblocks-render-target (${RENDER_TARGET_VERSION})
 */`;
}
//# sourceMappingURL=composite.js.map