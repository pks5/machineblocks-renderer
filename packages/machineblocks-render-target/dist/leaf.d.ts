import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
import { type ManifestationMapping } from "./naming.js";
type Registry = RenderContext["session"]["typeRegistry"];
export declare function renderLeafFile(block: BlockDefinition, outputRelativePath: string, outputBasePath: string, mbLibPath: string, registry: Registry, mapping: ManifestationMapping): RenderOutput;
export {};
//# sourceMappingURL=leaf.d.ts.map