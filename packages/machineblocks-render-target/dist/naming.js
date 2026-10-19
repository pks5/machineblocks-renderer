import { SOURCE_OUTSIDE_ROOT, SOURCE_PACKAGE_ALONE, SOURCE_PACKAGE_REQUIRED, TARGET_PACKAGE_AMBIGUOUS, TARGET_PACKAGE_UNDETERMINED, } from "./diagnostics.js";
export const AUTOMATIC_MAPPING = { kind: "automatic" };
export function mappingFromPackages(sourcePackage, targetPackage) {
    if (sourcePackage !== undefined && targetPackage !== undefined) {
        return { kind: "explicit", sourcePackage, targetPackage };
    }
    if (sourcePackage !== undefined) {
        return {
            ok: false,
            code: SOURCE_PACKAGE_ALONE,
            message: "--source-package requires --target-package.",
        };
    }
    if (targetPackage !== undefined) {
        return {
            ok: false,
            code: SOURCE_PACKAGE_REQUIRED,
            message: "--target-package needs --source-package. The source root is not determined.",
        };
    }
    return AUTOMATIC_MAPPING;
}
export function isMappingFailure(value) {
    return "ok" in value;
}
export function mapManifestation(definitionFqn, mapping = AUTOMATIC_MAPPING, role = "selected") {
    if (mapping.kind === "explicit") {
        const relative = relativeToPackage(definitionFqn, mapping.sourcePackage);
        if (relative !== undefined) {
            const fqn = relative.length === 0 ? mapping.targetPackage : `${mapping.targetPackage}.${relative}`;
            return { ok: true, fqn };
        }
        if (role === "selected") {
            return {
                ok: false,
                code: SOURCE_OUTSIDE_ROOT,
                message: `${definitionFqn} is outside source package ${mapping.sourcePackage}.`,
            };
        }
    }
    return mapAutomatic(definitionFqn);
}
export function moduleNameForManifestation(manifestationFqn) {
    return `mb__${manifestationFqn.split(".").join("__")}`;
}
export function pathForManifestation(manifestationFqn, extension) {
    return `${manifestationFqn.split(".").join("/")}.${extension}`;
}
export function scadModuleName(definitionFqn, mapping = AUTOMATIC_MAPPING) {
    return moduleNameForManifestation(requireManifestation(definitionFqn, mapping));
}
/** Path relative to srcDir. The class name is the file, not an extra directory. */
export function scadOutputPath(definitionFqn, mapping = AUTOMATIC_MAPPING) {
    return pathForManifestation(requireManifestation(definitionFqn, mapping), "scad");
}
export function jsonOutputPath(definitionFqn, mapping = AUTOMATIC_MAPPING) {
    return pathForManifestation(requireManifestation(definitionFqn, mapping), "json");
}
function requireManifestation(definitionFqn, mapping) {
    const mapped = mapManifestation(definitionFqn, mapping, "selected");
    if (!mapped.ok) {
        throw new Error(`${mapped.code}: ${mapped.message}`);
    }
    return mapped.fqn;
}
function mapAutomatic(definitionFqn) {
    const parts = definitionFqn.split(".");
    const indexes = parts.flatMap((part, index) => (part === "bml" ? [index] : []));
    if (indexes.length === 0) {
        return {
            ok: false,
            code: TARGET_PACKAGE_UNDETERMINED,
            message: [
                "Cannot determine target package for:",
                definitionFqn,
                "",
                "No 'bml' package segment was found.",
                "",
                "Specify --target-package and, if necessary,",
                "--source-package.",
            ].join("\n"),
        };
    }
    if (indexes.length > 1) {
        return {
            ok: false,
            code: TARGET_PACKAGE_AMBIGUOUS,
            message: [
                "Cannot determine target package for:",
                definitionFqn,
                "",
                "The package contains more than one 'bml' segment.",
                "",
                "Specify --source-package and --target-package.",
            ].join("\n"),
        };
    }
    const index = indexes[0];
    if (index === undefined) {
        return {
            ok: false,
            code: TARGET_PACKAGE_UNDETERMINED,
            message: `Cannot determine target package for:\n${definitionFqn}`,
        };
    }
    const mapped = [...parts];
    mapped[index] = "scad";
    return { ok: true, fqn: mapped.join(".") };
}
function relativeToPackage(fqn, sourcePackage) {
    if (fqn === sourcePackage) {
        return "";
    }
    const prefix = `${sourcePackage}.`;
    if (fqn.startsWith(prefix)) {
        return fqn.slice(prefix.length);
    }
    return undefined;
}
//# sourceMappingURL=naming.js.map