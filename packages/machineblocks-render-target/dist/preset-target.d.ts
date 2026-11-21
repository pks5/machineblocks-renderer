import type { BlockDefinition } from "@blockml/bom";
import { type ManifestationMapping } from "./naming.js";
interface BlockLookup {
    get(fqn: string): {
        block: BlockDefinition;
    } | undefined;
}
export type PresetTarget = {
    kind: "none";
} | {
    kind: "closed";
    fqn: string;
} | {
    kind: "open";
};
/** Closed T on BlockPresets, walking a catalog that binds T through an intermediate generic. */
export declare function presetTarget(block: BlockDefinition, registry: BlockLookup): PresetTarget;
export declare function plannedOutputPath(block: BlockDefinition, registry: BlockLookup, mapping: ManifestationMapping): {
    ok: true;
    path: string;
} | {
    ok: false;
    code: string;
    message: string;
};
export {};
//# sourceMappingURL=preset-target.d.ts.map