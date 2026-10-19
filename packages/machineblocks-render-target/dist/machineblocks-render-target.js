import { selectProcessor } from "./dispatch.js";
import { MB_LIB_PATH_MISSING, NO_TARGET, RENDER_DOCUMENT_NOT_FOUND, SETTINGS_FORMAT_UNSUPPORTED, errorOutput, } from "./diagnostics.js";
import { isMappingFailure, mapManifestation, mappingFromPackages, pathForManifestation } from "./naming.js";
import { readTargetOptions } from "./options.js";
import { ScadBlockProcessor, ScadSetProcessor } from "./processors.js";
import { TARGET_NAME } from "./version.js";
export class MachineBlocksRenderTarget {
    name = TARGET_NAME;
    accepts = ["document"];
    engine;
    processors;
    delegates = [];
    options = { current: {}, mapping: { kind: "automatic" } };
    constructor(engine) {
        this.engine = engine;
        this.processors = [new ScadSetProcessor(this.options), new ScadBlockProcessor(this.options)];
    }
    render(request, ctx) {
        const options = readTargetOptions(request.targetOptions);
        if (options.settingsFormat !== undefined && options.settingsFormat !== "pseudo-map") {
            return errorOutput(SETTINGS_FORMAT_UNSUPPORTED, `settingsFormat ${options.settingsFormat} is not emitted in this slice.`, sourceOf(ctx));
        }
        if (!options.mbLibPath) {
            return errorOutput(MB_LIB_PATH_MISSING, "targetOptions.machineblocks-v3-scad.mbLibPath is required.", sourceOf(ctx));
        }
        const document = findDocument(ctx.session.typeRegistry, ctx.session.sourceFilePath);
        if (!document) {
            return errorOutput(RENDER_DOCUMENT_NOT_FOUND, `No document for ${ctx.session.sourceFilePath}.`, sourceOf(ctx));
        }
        const processor = selectProcessor(document.block, ctx.session.typeRegistry, this);
        if (!processor) {
            return errorOutput(NO_TARGET, `No processor for ${document.block.type}.`, document.block.source ?? sourceOf(ctx));
        }
        const mapping = mappingFromPackages(options.sourcePackage, options.targetPackage);
        if (isMappingFailure(mapping)) {
            return errorOutput(mapping.code, mapping.message, document.block.source ?? sourceOf(ctx));
        }
        const manifested = mapManifestation(document.block.type, mapping, "selected");
        if (!manifested.ok) {
            return errorOutput(manifested.code, manifested.message, document.block.source ?? sourceOf(ctx));
        }
        this.options.current = options;
        this.options.mapping = mapping;
        const blockContext = ctx.child({
            blockFqn: document.block.type,
            outputRelativePath: pathForManifestation(manifested.fqn, "scad"),
        });
        return processor.process(document.block, this.engine, blockContext);
    }
}
function findDocument(registry, sourceFilePath) {
    for (const fqn of registry.keys()) {
        const document = registry.get(fqn);
        if (document?.source.filePath === sourceFilePath) {
            return document;
        }
    }
    return undefined;
}
function sourceOf(ctx) {
    return { file: ctx.session.sourceFilePath, line: 1, column: 1 };
}
//# sourceMappingURL=machineblocks-render-target.js.map