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