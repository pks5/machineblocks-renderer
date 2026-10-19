import type { Diagnostic, SourceLocation } from "@blockml/bom";
import type { RenderOutput } from "@blockml/compiler";

const EMPTY_SOURCE: SourceLocation = { file: "", line: 1, column: 1 };

export const NO_TARGET = "BML_NO_TARGET";
export const SETTINGS_FORMAT_UNSUPPORTED = "BML_SETTINGS_FORMAT_UNSUPPORTED";
export const MB_LIB_PATH_MISSING = "BML_MB_LIB_PATH_MISSING";
export const RENDER_DOCUMENT_NOT_FOUND = "BML_RENDER_DOCUMENT_NOT_FOUND";
export const LEAF_VALUE_UNSUPPORTED = "BML_LEAF_VALUE_UNSUPPORTED";
export const EMPTY_BLOCK = "MB_EMPTY_BLOCK";
export const DIRECTIVE_DEFERRED = "BML_DIRECTIVE_DEFERRED";
export const SET_PART_INCOMPLETE = "BML_SET_PART_INCOMPLETE";
export const PRESET_CYCLE = "BML_PRESET_CYCLE";
export const TARGET_PACKAGE_UNDETERMINED = "MB_TARGET_PACKAGE_UNDETERMINED";
export const TARGET_PACKAGE_AMBIGUOUS = "MB_TARGET_PACKAGE_AMBIGUOUS";
export const SOURCE_PACKAGE_ALONE = "MB_SOURCE_PACKAGE_ALONE";
export const SOURCE_PACKAGE_REQUIRED = "MB_SOURCE_PACKAGE_REQUIRED";
export const SOURCE_OUTSIDE_ROOT = "MB_SOURCE_OUTSIDE_ROOT";
export const TARGET_COLLISION = "MB_TARGET_COLLISION";
export const OUTPUT_ESCAPES_SRC = "MB_OUTPUT_ESCAPES_SRC";
export const OUTPUT_OVERWRITES_BML = "MB_OUTPUT_OVERWRITES_BML";
export const SELECTOR_EMPTY = "MB_SELECTOR_EMPTY";

export function errorOutput(
  code: string,
  message: string,
  source: SourceLocation = EMPTY_SOURCE,
): RenderOutput {
  const diagnostic: Diagnostic = {
    severity: "error",
    code,
    message,
    source,
  };
  return { files: [], diagnostics: [diagnostic] };
}
