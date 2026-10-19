import type { RenderContext, RenderOutput } from "@blockml/compiler";
import type { BlockProcessor, CompileBlock, RenderEngine } from "@blockml/block-render-engine";
import type { ManifestationMapping } from "./naming.js";
import type { MachineBlocksTargetOptions } from "./options.js";
/** Reads options captured for the current render call. */
export interface OptionSlot {
    current: MachineBlocksTargetOptions;
    mapping: ManifestationMapping;
}
export declare class ScadSetProcessor implements BlockProcessor {
    private readonly options;
    readonly baseType = "com.machineblocks.bml.core.Set";
    constructor(options: OptionSlot);
    process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput;
    compile(block: CompileBlock, context: RenderContext): RenderOutput;
}
export declare class ScadBlockProcessor implements BlockProcessor {
    private readonly options;
    readonly baseType = "com.machineblocks.bml.core.Block";
    constructor(options: OptionSlot);
    process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput;
    compile(block: CompileBlock, context: RenderContext): RenderOutput;
}
//# sourceMappingURL=processors.d.ts.map