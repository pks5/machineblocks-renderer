import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
import { type ManifestationMapping } from "./naming.js";
type Registry = RenderContext["session"]["typeRegistry"];
export declare function renderSetFile(block: BlockDefinition, outputRelativePath: string, outputBasePath: string, mbLibPath: string, mapping: ManifestationMapping, registry: Registry): RenderOutput;
export {};
//# sourceMappingURL=set-file.d.ts.map