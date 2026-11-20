import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
import { type ManifestationMapping } from "./naming.js";
type Registry = RenderContext["session"]["typeRegistry"];
export interface ConfigPrelude {
    useLine: string;
    /** [Config] tab and the configProfile assignment. */
    dropdown: string;
    /** Assignment of mb_config from the selected set. */
    hidden: string;
}
export declare function needsConfigSet(block: BlockDefinition, registry: Registry): boolean;
export declare function resolveConfigSet(registry: Registry, projectRoot: string): {
    ok: true;
    fqn: string;
} | {
    ok: false;
    code: string;
    message: string;
};
export declare function requireConfigSet(registry: Registry, fqn: string): {
    ok: true;
    fqn: string;
} | {
    ok: false;
    code: string;
    message: string;
};
export declare function renderConfigSetFile(block: BlockDefinition, outputRelativePath: string, registry: Registry, mapping: ManifestationMapping): RenderOutput;
export declare function loadConfigPrelude(registry: Registry, configSetFqn: string | undefined, outputRelativePath: string, outputBasePath: string, mbLibPath: string, mapping: ManifestationMapping): {
    ok: true;
    prelude: ConfigPrelude;
} | {
    ok: false;
    output: RenderOutput;
};
export {};
//# sourceMappingURL=config-set.d.ts.map