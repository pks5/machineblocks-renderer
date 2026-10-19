const EMPTY_SOURCE = { file: "", line: 1, column: 1 };
export const COMPILE_CALLBACK_MISSING = "BML_ENGINE_COMPILE_CALLBACK_MISSING";
export const STRATEGY_UNSUPPORTED = "BML_ENGINE_STRATEGY_UNSUPPORTED";
function sourceOf(block) {
    return block.source ?? EMPTY_SOURCE;
}
function errorOutput(code, message, source) {
    const diagnostic = {
        severity: "error",
        code,
        message,
        source,
    };
    return { files: [], diagnostics: [diagnostic] };
}
export function compileCallbackMissing(block) {
    return errorOutput(COMPILE_CALLBACK_MISSING, "BlockProcessor has no compile method.", sourceOf(block));
}
export function strategyUnsupported(method, source = EMPTY_SOURCE) {
    return errorOutput(STRATEGY_UNSUPPORTED, `${method} is not implemented in this engine slice.`, source);
}
export function blockSource(block) {
    return sourceOf(block);
}
//# sourceMappingURL=diagnostics.js.map