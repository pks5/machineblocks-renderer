import { artifactExtension, compositionChildren } from "./composition.js";
import { CONFIG_PROFILE_INCOMPLETE, CONFIG_SET_MISSING, CONFIG_SET_UNKNOWN, errorOutput, } from "./diagnostics.js";
import { isConfigSet, isRenderBlock } from "./dispatch.js";
import { mapManifestation, moduleNameForManifestation, pathForManifestation } from "./naming.js";
import { dirnamePosix, joinPosix, relativePosix } from "./paths.js";
import { isIdentifier, serializeLiteral } from "./serialize.js";
import { withSourceMap } from "./source-map.js";
import { CONFIG_SET_FQN, RENDER_TARGET_VERSION } from "./version.js";
const CONFIG_SET_FILE = "com/machineblocks/bml/core/ConfigSet.bml";
export function needsConfigSet(block, registry) {
    if (!isRenderBlock(block, registry) || isConfigSet(block, registry)) {
        return false;
    }
    return artifactExtension(block, registry) !== "json";
}
export function resolveConfigSet(registry, projectRoot) {
    const project = firstConcrete(registry, projectRoot);
    if (project) {
        return { ok: true, fqn: project };
    }
    const coreRoot = coreBlocksRoot(registry);
    const core = coreRoot === undefined ? undefined : firstConcrete(registry, coreRoot);
    if (core) {
        return { ok: true, fqn: core };
    }
    return {
        ok: false,
        code: CONFIG_SET_MISSING,
        message: "No concrete ConfigSet in the project or in @machineblocks/core.",
    };
}
export function requireConfigSet(registry, fqn) {
    const document = registry.get(fqn);
    if (!document || !isConfigSet(document.block, registry) || document.block.abstract === true) {
        return {
            ok: false,
            code: CONFIG_SET_UNKNOWN,
            message: `${fqn} is not a concrete ConfigSet.`,
        };
    }
    return { ok: true, fqn };
}
export function renderConfigSetFile(block, outputRelativePath, registry, mapping) {
    const source = block.source ?? { file: "", line: 1, column: 1 };
    const profiles = readProfiles(block, registry);
    if (!profiles.ok) {
        return errorOutput(profiles.code, profiles.message, profiles.source);
    }
    const manifested = mapManifestation(block.type, mapping, "selected");
    if (!manifested.ok) {
        return errorOutput(manifested.code, manifested.message, source);
    }
    const filename = outputRelativePath.split("/").pop() ?? `${block.name}.scad`;
    const moduleBase = moduleNameForManifestation(manifested.fqn);
    const functions = [
        configFunction(moduleBase, profiles.profiles),
        ...profiles.profiles.map((profile) => profileFunction(moduleBase, profile)),
    ];
    const content = `${header(block, filename)}

/* Optional Global Functions */
${functions.join("\n\n")}
`;
    return { files: [withSourceMap(block, { path: outputRelativePath, content })] };
}
export function loadConfigPrelude(registry, configSetFqn, outputRelativePath, outputBasePath, mbLibPath, mapping) {
    if (!configSetFqn) {
        return { ok: false, output: errorOutput(CONFIG_SET_MISSING, "No ConfigSet was selected for this compile.") };
    }
    const named = requireConfigSet(registry, configSetFqn);
    if (!named.ok) {
        return { ok: false, output: errorOutput(named.code, named.message) };
    }
    const document = registry.get(named.fqn);
    if (!document) {
        return { ok: false, output: errorOutput(CONFIG_SET_UNKNOWN, `${named.fqn} is not a concrete ConfigSet.`) };
    }
    const profiles = readProfiles(document.block, registry);
    if (!profiles.ok) {
        return { ok: false, output: errorOutput(profiles.code, profiles.message, profiles.source) };
    }
    const manifested = manifestConfigSet(document, outputBasePath, mapping);
    if (!manifested.ok) {
        return { ok: false, output: errorOutput(manifested.code, manifested.message, document.block.source) };
    }
    const outputDir = dirnamePosix(joinPosix(outputBasePath, outputRelativePath));
    const target = configSetScadPath(document, outputBasePath, mbLibPath, manifested.fqn, registry);
    const options = profiles.profiles.map((profile) => `${profile.id}:${profile.name}`).join(", ");
    const first = profiles.profiles[0];
    if (!first) {
        return {
            ok: false,
            output: errorOutput(CONFIG_PROFILE_INCOMPLETE, "A ConfigSet needs at least one profile.", document.block.source),
        };
    }
    const functionName = `${moduleNameForManifestation(manifested.fqn)}__func__config`;
    return {
        ok: true,
        prelude: {
            useLine: `use <${relativePosix(outputDir, target)}>;`,
            dropdown: `/* [Config] */
// Config profile
configProfile = "${first.id}"; // [${options}]`,
            hidden: `mb_config = ${functionName}(configProfile);`,
        },
    };
}
function manifestConfigSet(document, outputBasePath, mapping) {
    if (!isInside(document.source.filePath, outputBasePath)) {
        return mapManifestation(document.block.type, { kind: "automatic" }, "reference");
    }
    return mapManifestation(document.block.type, mapping, "reference");
}
function configSetScadPath(document, outputBasePath, mbLibPath, manifestationFqn, registry) {
    const relative = pathForManifestation(manifestationFqn, "scad");
    const file = normalize(document.source.filePath);
    if (isInside(file, outputBasePath)) {
        return joinPosix(outputBasePath, relative);
    }
    const coreRoot = coreBlocksRoot(registry);
    if (coreRoot !== undefined && isInside(file, coreRoot)) {
        return joinPosix(mbLibPath, joinPosix("blocks", relative));
    }
    const blocksRoot = blocksRootFromFile(file, document.block.type);
    return joinPosix(blocksRoot ?? outputBasePath, relative);
}
function readProfiles(block, registry) {
    const source = block.source ?? { file: "", line: 1, column: 1 };
    const profiles = [];
    const seen = new Set();
    for (const child of compositionChildren(block, "profiles")) {
        if (child.kind !== "blockInstance") {
            continue;
        }
        const profile = profileOf(child.instance, registry, source);
        if (!profile.ok) {
            return profile;
        }
        if (seen.has(profile.profile.id)) {
            return {
                ok: false,
                code: CONFIG_PROFILE_INCOMPLETE,
                message: `${profile.profile.id} is used by more than one profile.`,
                source: profile.profile.source,
            };
        }
        seen.add(profile.profile.id);
        profiles.push(profile.profile);
    }
    if (profiles.length === 0) {
        return {
            ok: false,
            code: CONFIG_PROFILE_INCOMPLETE,
            message: "A ConfigSet needs at least one profile.",
            source,
        };
    }
    return { ok: true, profiles };
}
function profileOf(instance, registry, fallback) {
    const source = instance.source ?? fallback;
    const id = literalString(instance.id);
    if (!id || !isIdentifier(id)) {
        return {
            ok: false,
            code: CONFIG_PROFILE_INCOMPLETE,
            message: id ? `${id} is not a SCAD identifier.` : "A profile needs a bml:id.",
            source,
        };
    }
    const name = literalString(instance.memberValues.name);
    if (!name) {
        return {
            ok: false,
            code: CONFIG_PROFILE_INCOMPLETE,
            message: `Profile ${id} needs a name.`,
            source,
        };
    }
    const entries = [];
    for (const [key, value] of Object.entries(instance.memberValues)) {
        if (key === "name") {
            continue;
        }
        if (!value || value.kind !== "literal") {
            return {
                ok: false,
                code: CONFIG_PROFILE_INCOMPLETE,
                message: `Profile ${id} property ${key} cannot be serialized.`,
                source,
            };
        }
        const scad = serializeLiteral(value, { registry });
        if (scad === undefined) {
            return {
                ok: false,
                code: CONFIG_PROFILE_INCOMPLETE,
                message: `Profile ${id} property ${key} cannot be serialized.`,
                source,
            };
        }
        entries.push({ key, scad });
    }
    return { ok: true, profile: { id, name, entries, source } };
}
function literalString(value) {
    if (!value || value.kind !== "literal" || typeof value.value !== "string") {
        return undefined;
    }
    return value.value;
}
function configFunction(moduleBase, profiles) {
    const lines = [`function ${moduleBase}__func__config(profile) =`];
    profiles.forEach((profile, index) => {
        const call = `${moduleBase}__func__${profile.id}()`;
        if (index === 0) {
            lines.push("    // if");
            lines.push(`    profile == "${profile.id}" ? ${call}`);
            return;
        }
        lines.push("    // else if");
        lines.push(`    : profile == "${profile.id}" ? ${call}`);
    });
    const first = profiles[0];
    lines.push("    // else");
    lines.push(`    : ${moduleBase}__func__${first?.id ?? ""}();`);
    return lines.join("\n");
}
function profileFunction(moduleBase, profile) {
    if (profile.entries.length === 0) {
        return `function ${moduleBase}__func__${profile.id}() = [];`;
    }
    const rows = profile.entries.map((entry) => `    ["${entry.key}", ${entry.scad}]`).join(",\n");
    return `function ${moduleBase}__func__${profile.id}() = [\n${rows}\n];`;
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
function firstConcrete(registry, root) {
    const hits = [];
    for (const fqn of registry.keys()) {
        const document = registry.get(fqn);
        if (!document || document.block.abstract === true || !isConfigSet(document.block, registry)) {
            continue;
        }
        if (!isInside(document.source.filePath, root)) {
            continue;
        }
        hits.push({ fqn, path: relativeTo(document.source.filePath, root) });
    }
    hits.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    return hits[0]?.fqn;
}
function coreBlocksRoot(registry) {
    const file = normalize(registry.get(CONFIG_SET_FQN)?.source.filePath ?? "");
    const marker = `/${CONFIG_SET_FILE}`;
    const index = file.lastIndexOf(marker);
    if (index <= 0) {
        return undefined;
    }
    return file.slice(0, index);
}
function blocksRootFromFile(file, fqn) {
    const suffix = `/${fqn.split(".").join("/")}.bml`;
    const normalized = normalize(file);
    if (!normalized.endsWith(suffix)) {
        return undefined;
    }
    return normalized.slice(0, normalized.length - suffix.length);
}
function isInside(file, root) {
    const normalizedFile = normalize(file);
    const normalizedRoot = normalize(root);
    return normalizedRoot.length > 0 && normalizedFile.startsWith(`${normalizedRoot}/`);
}
function relativeTo(file, root) {
    return normalize(file).slice(normalize(root).length + 1);
}
function normalize(file) {
    return file.replace(/\\/g, "/").replace(/\/+$/, "");
}
//# sourceMappingURL=config-set.js.map