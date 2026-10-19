import { blockSource, compileCallbackMissing, strategyUnsupported } from "./diagnostics.js";
/** First CompilerEngine. Domain-free. This slice runs compile only. */
export class BlockRenderEngine {
    compile(block, processor, context) {
        if (typeof processor.compile !== "function") {
            return compileCallbackMissing(block);
        }
        return processor.compile(block, context);
    }
    renderTemplate(block, _templatePath) {
        return strategyUnsupported("renderTemplate", blockSource(block));
    }
    renderTemplates(block, _templatePaths) {
        return strategyUnsupported("renderTemplates", blockSource(block));
    }
    copyTemplate(_sourcePath, _targetPath) {
        return strategyUnsupported("copyTemplate");
    }
    callLLM(block, _prompt, _context) {
        return strategyUnsupported("callLLM", blockSource(block));
    }
}
//# sourceMappingURL=block-render-engine.js.map