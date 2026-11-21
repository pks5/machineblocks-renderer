export type ManifestationRole = "selected" | "reference";
export type ManifestationMapping = {
    kind: "automatic";
} | {
    kind: "explicit";
    sourcePackage: string;
    targetPackage: string;
};
export type ManifestationSuccess = {
    ok: true;
    fqn: string;
};
export type ManifestationFailure = {
    ok: false;
    code: string;
    message: string;
};
export type ManifestationResult = ManifestationSuccess | ManifestationFailure;
export declare const AUTOMATIC_MAPPING: ManifestationMapping;
/**
 * Prefix for SCAD locals the generator invents.
 * Property locals and customizer parameters stay unprefixed.
 * Hidden customizer variables use HIDDEN_CUSTOMIZER_PREFIX.
 * Change this constant and recompile to rewrite every generated file.
 */
export declare const GENERATED_LOCAL_PREFIX = "gen_";
export declare function generatedLocal(name: string): string;
/**
 * Prefix for every hidden customizer variable.
 * Visible customizer parameters stay unprefixed.
 * Change this constant and recompile to rewrite every generated file.
 */
export declare const HIDDEN_CUSTOMIZER_PREFIX = "hlp_";
export declare function hiddenCustomizer(name: string): string;
export declare function mappingFromPackages(sourcePackage: string | undefined, targetPackage: string | undefined): ManifestationMapping | ManifestationFailure;
export declare function isMappingFailure(value: ManifestationMapping | ManifestationFailure): value is ManifestationFailure;
export declare function mapManifestation(definitionFqn: string, mapping?: ManifestationMapping, role?: ManifestationRole): ManifestationResult;
export declare function moduleNameForManifestation(manifestationFqn: string): string;
export declare function pathForManifestation(manifestationFqn: string, extension: "scad" | "json"): string;
export declare function scadModuleName(definitionFqn: string, mapping?: ManifestationMapping): string;
/** Path relative to srcDir. The class name is the file, not an extra directory. */
export declare function scadOutputPath(definitionFqn: string, mapping?: ManifestationMapping): string;
export declare function jsonOutputPath(definitionFqn: string, mapping?: ManifestationMapping): string;
//# sourceMappingURL=naming.d.ts.map