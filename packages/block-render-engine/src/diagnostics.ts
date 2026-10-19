import type { Diagnostic, SourceLocation } from "@blockml/bom";
import type { RenderOutput } from "@blockml/compiler";
import type { CompileBlock } from "./types.js";

const EMPTY_SOURCE: SourceLocation = { file: "", line: 1, column: 1 };

export const COMPILE_CALLBACK_MISSING = "BML_ENGINE_COMPILE_CALLBACK_MISSING";
export const STRATEGY_UNSUPPORTED = "BML_ENGINE_STRATEGY_UNSUPPORTED";

function sourceOf(block: CompileBlock): SourceLocation {
  return block.source ?? EMPTY_SOURCE;
}

function errorOutput(code: string, message: string, source: SourceLocation): RenderOutput {
  const diagnostic: Diagnostic = {
    severity: "error",
    code,
    message,
    source,
  };
  return { files: [], diagnostics: [diagnostic] };
}

export function compileCallbackMissing(block: CompileBlock): RenderOutput {
  return errorOutput(
    COMPILE_CALLBACK_MISSING,
    "BlockProcessor has no compile method.",
    sourceOf(block),
  );
}

export function strategyUnsupported(method: string, source: SourceLocation = EMPTY_SOURCE): RenderOutput {
  return errorOutput(
    STRATEGY_UNSUPPORTED,
    `${method} is not implemented in this engine slice.`,
    source,
  );
}

export function blockSource(block: CompileBlock): SourceLocation {
  return sourceOf(block);
}
