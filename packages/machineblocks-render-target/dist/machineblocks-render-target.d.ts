import type { CompileRequest, CompileScopeKind, RenderContext, RenderOutput, RenderTarget } from "@blockml/compiler";
import type { BlockProcessor, RenderEngine } from "@blockml/block-render-engine";
import { type DispatchTarget } from "./dispatch.js";
export declare class MachineBlocksRenderTarget implements RenderTarget, DispatchTarget {
    readonly name = "machineblocks-v3-scad";
    readonly accepts: CompileScopeKind[];
    readonly engine: RenderEngine;
    readonly processors: BlockProcessor[];
    readonly delegates: DispatchTarget[];
    private readonly options;
    constructor(engine: RenderEngine);
    render(request: CompileRequest, ctx: RenderContext): RenderOutput;
}
//# sourceMappingURL=machineblocks-render-target.d.ts.map