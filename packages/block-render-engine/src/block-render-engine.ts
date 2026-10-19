import type { RenderContext, RenderOutput } from "@blockml/compiler";
import { blockSource, compileCallbackMissing, strategyUnsupported } from "./diagnostics.js";
import type { BlockProcessor, CompileBlock, RenderEngine } from "./types.js";

/** First CompilerEngine. Domain-free. This slice runs compile only. */
export class BlockRenderEngine implements RenderEngine {
  compile(block: CompileBlock, processor: BlockProcessor, context: RenderContext): RenderOutput {
    if (typeof processor.compile !== "function") {
      return compileCallbackMissing(block);
    }
    return processor.compile(block, context);
  }

  renderTemplate(block: CompileBlock, _templatePath: string): RenderOutput {
    return strategyUnsupported("renderTemplate", blockSource(block));
  }

  renderTemplates(block: CompileBlock, _templatePaths: string[]): RenderOutput {
    return strategyUnsupported("renderTemplates", blockSource(block));
  }

  copyTemplate(_sourcePath: string, _targetPath: string): RenderOutput {
    return strategyUnsupported("copyTemplate");
  }

  callLLM(block: CompileBlock, _prompt: string, _context: RenderContext): RenderOutput {
    return strategyUnsupported("callLLM", blockSource(block));
  }
}
