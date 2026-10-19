import type { SourceLocation } from "@blockml/bom";
import type { RenderOutput } from "@blockml/compiler";
import type { CompileBlock } from "./types.js";
export declare const COMPILE_CALLBACK_MISSING = "BML_ENGINE_COMPILE_CALLBACK_MISSING";
export declare const STRATEGY_UNSUPPORTED = "BML_ENGINE_STRATEGY_UNSUPPORTED";
export declare function compileCallbackMissing(block: CompileBlock): RenderOutput;
export declare function strategyUnsupported(method: string, source?: SourceLocation): RenderOutput;
export declare function blockSource(block: CompileBlock): SourceLocation;
//# sourceMappingURL=diagnostics.d.ts.map