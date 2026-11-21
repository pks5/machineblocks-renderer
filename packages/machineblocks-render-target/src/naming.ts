import {
  SOURCE_OUTSIDE_ROOT,
  SOURCE_PACKAGE_ALONE,
  SOURCE_PACKAGE_REQUIRED,
  TARGET_PACKAGE_AMBIGUOUS,
  TARGET_PACKAGE_UNDETERMINED,
} from "./diagnostics.js";

export type ManifestationRole = "selected" | "reference";

export type ManifestationMapping =
  | { kind: "automatic" }
  | { kind: "explicit"; sourcePackage: string; targetPackage: string };

export type ManifestationSuccess = { ok: true; fqn: string };

export type ManifestationFailure = { ok: false; code: string; message: string };

export type ManifestationResult = ManifestationSuccess | ManifestationFailure;

export const AUTOMATIC_MAPPING: ManifestationMapping = { kind: "automatic" };

/**
 * Prefix for SCAD locals the generator invents.
 * Property locals and customizer parameters stay unprefixed.
 * Hidden customizer variables use HIDDEN_CUSTOMIZER_PREFIX.
 * Change this constant and recompile to rewrite every generated file.
 */
export const GENERATED_LOCAL_PREFIX = "gen_";

export function generatedLocal(name: string): string {
  return `${GENERATED_LOCAL_PREFIX}${name}`;
}

/**
 * Prefix for every hidden customizer variable.
 * Visible customizer parameters stay unprefixed.
 * Change this constant and recompile to rewrite every generated file.
 */
export const HIDDEN_CUSTOMIZER_PREFIX = "hlp_";

export function hiddenCustomizer(name: string): string {
  return `${HIDDEN_CUSTOMIZER_PREFIX}${name}`;
}

export function mappingFromPackages(
  sourcePackage: string | undefined,
  targetPackage: string | undefined,
): ManifestationMapping | ManifestationFailure {
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

export function isMappingFailure(
  value: ManifestationMapping | ManifestationFailure,
): value is ManifestationFailure {
  return "ok" in value;
}

export function mapManifestation(
  definitionFqn: string,
  mapping: ManifestationMapping = AUTOMATIC_MAPPING,
  role: ManifestationRole = "selected",
): ManifestationResult {
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

export function moduleNameForManifestation(manifestationFqn: string): string {
  return `mb__${manifestationFqn.split(".").join("__")}`;
}

export function pathForManifestation(manifestationFqn: string, extension: "scad" | "json"): string {
  return `${manifestationFqn.split(".").join("/")}.${extension}`;
}

export function scadModuleName(
  definitionFqn: string,
  mapping: ManifestationMapping = AUTOMATIC_MAPPING,
): string {
  return moduleNameForManifestation(requireManifestation(definitionFqn, mapping));
}

/** Path relative to srcDir. The class name is the file, not an extra directory. */
export function scadOutputPath(
  definitionFqn: string,
  mapping: ManifestationMapping = AUTOMATIC_MAPPING,
): string {
  return pathForManifestation(requireManifestation(definitionFqn, mapping), "scad");
}

export function jsonOutputPath(
  definitionFqn: string,
  mapping: ManifestationMapping = AUTOMATIC_MAPPING,
): string {
  return pathForManifestation(requireManifestation(definitionFqn, mapping), "json");
}

function requireManifestation(definitionFqn: string, mapping: ManifestationMapping): string {
  const mapped = mapManifestation(definitionFqn, mapping, "selected");
  if (!mapped.ok) {
    throw new Error(`${mapped.code}: ${mapped.message}`);
  }
  return mapped.fqn;
}

function mapAutomatic(definitionFqn: string): ManifestationResult {
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

function relativeToPackage(fqn: string, sourcePackage: string): string | undefined {
  if (fqn === sourcePackage) {
    return "";
  }
  const prefix = `${sourcePackage}.`;
  if (fqn.startsWith(prefix)) {
    return fqn.slice(prefix.length);
  }
  return undefined;
}
