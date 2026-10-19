import type { BlockDefinition, BlockInstance } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
/** Document type or composition instance. The engine does not inspect it. */
export type CompileBlock = BlockDefinition | BlockInstance;
/** Processor registered on a RenderTarget. It chooses the engine strategy. */
export interface BlockProcessor {
    baseType: string;
    process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput;
    /** Algorithm for the compile strategy. Absent processors cannot use compile. */
    compile?(block: CompileBlock, context: RenderContext): RenderOutput;
}
/** CompilerEngine contract. The processor picks the method inside process. */
export interface RenderEngine {
    compile(block: CompileBlock, processor: BlockProcessor, context: RenderContext): RenderOutput;
    renderTemplate(block: CompileBlock, templatePath: string): RenderOutput;
    renderTemplates(block: CompileBlock, templatePaths: string[]): RenderOutput;
    copyTemplate(sourcePath: string, targetPath: string): RenderOutput;
    callLLM(block: CompileBlock, prompt: string, context: RenderContext): RenderOutput;
}
//# sourceMappingURL=types.d.ts.map