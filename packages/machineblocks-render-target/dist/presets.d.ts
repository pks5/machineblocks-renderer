import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
type Registry = RenderContext["session"]["typeRegistry"];
export declare function renderPresetFile(block: BlockDefinition, registry: Registry, outputRelativePath: string): RenderOutput;
export {};
//# sourceMappingURL=presets.d.ts.map