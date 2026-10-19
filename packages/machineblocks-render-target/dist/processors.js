import { compositionChildren, hasDirectives } from "./composition.js";
import { renderCompositeFile } from "./composite.js";
import { DIRECTIVE_DEFERRED, EMPTY_BLOCK, LEAF_VALUE_UNSUPPORTED, MB_LIB_PATH_MISSING, errorOutput, } from "./diagnostics.js";
import { renderLeafFile } from "./leaf.js";
import { renderPresetFile } from "./presets.js";
import { renderSetFile } from "./set-file.js";
import { BLOCK_FQN, NATIVE_BLOCK_FQN, SET_FQN } from "./version.js";
export class ScadSetProcessor {
    options;
    baseType = SET_FQN;
    constructor(options) {
        this.options = options;
    }
    process(block, engine, context) {
        return engine.compile(block, this, context);
    }
    compile(block, context) {
        if (!isDefinition(block)) {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, "ScadSetProcessor compiles a block definition.", blockSource(block));
        }
        const mbLibPath = this.options.current.mbLibPath;
        if (!mbLibPath) {
            return errorOutput(MB_LIB_PATH_MISSING, "targetOptions.machineblocks-v3-scad.mbLibPath is required.", blockSource(block));
        }
        if (hasDirectives(block)) {
            return errorOutput(DIRECTIVE_DEFERRED, "bml:each, bml:if, and bml:with are not expanded in this implementation.", blockSource(block));
        }
        return renderSetFile(block, context.outputRelativePath, context.session.outputBasePath, mbLibPath, this.options.mapping);
    }
}
export class ScadBlockProcessor {
    options;
    baseType = BLOCK_FQN;
    constructor(options) {
        this.options = options;
    }
    process(block, engine, context) {
        return engine.compile(block, this, context);
    }
    compile(block, context) {
        if (!isDefinition(block)) {
            return errorOutput(LEAF_VALUE_UNSUPPORTED, "ScadBlockProcessor compiles a block definition.", blockSource(block));
        }
        const mbLibPath = this.options.current.mbLibPath;
        if (!mbLibPath) {
            return errorOutput(MB_LIB_PATH_MISSING, "targetOptions.machineblocks-v3-scad.mbLibPath is required.", blockSource(block));
        }
        if (hasDirectives(block)) {
            return errorOutput(DIRECTIVE_DEFERRED, "bml:each, bml:if, and bml:with are not expanded in this implementation.", blockSource(block));
        }
        const parts = compositionChildren(block, "parts");
        const presets = compositionChildren(block, "presets");
        if (presets.length > 0 && parts.length === 0) {
            return renderPresetFile(block, context.session.typeRegistry, context.outputRelativePath);
        }
        if (parts.length === 0) {
            return errorOutput(EMPTY_BLOCK, "A block with no children has nothing to render.", blockSource(block));
        }
        const only = parts.length === 1 ? parts[0] : undefined;
        if (only?.kind === "blockInstance" && only.instance.typeFqn === NATIVE_BLOCK_FQN) {
            return renderLeafFile(block, context.outputRelativePath, context.session.outputBasePath, mbLibPath);
        }
        return renderCompositeFile(block, context.outputRelativePath, context.session.outputBasePath, mbLibPath, context.session.typeRegistry, this.options.mapping);
    }
}
function isDefinition(block) {
    return "members" in block;
}
function blockSource(block) {
    return block.source ?? { file: "", line: 1, column: 1 };
}
//# sourceMappingURL=processors.js.map