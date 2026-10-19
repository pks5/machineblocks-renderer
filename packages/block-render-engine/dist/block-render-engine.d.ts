import type { RenderContext, RenderOutput } from "@blockml/compiler";
import type { BlockProcessor, CompileBlock, RenderEngine } from "./types.js";
/** First CompilerEngine. Domain-free. This slice runs compile only. */
export declare class BlockRenderEngine implements RenderEngine {
    compile(block: CompileBlock, processor: BlockProcessor, context: RenderContext): RenderOutput;
    renderTemplate(block: CompileBlock, _templatePath: string): RenderOutput;
    renderTemplates(block: CompileBlock, _templatePaths: string[]): RenderOutput;
    copyTemplate(_sourcePath: string, _targetPath: string): RenderOutput;
    callLLM(block: CompileBlock, _prompt: string, _context: RenderContext): RenderOutput;
}
//# sourceMappingURL=block-render-engine.d.ts.map