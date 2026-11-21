export { MachineBlocksRenderTarget } from "./machineblocks-render-target.js";
export type { MachineBlocksTargetOptions } from "./options.js";
export { artifactExtension } from "./composition.js";
export { plannedOutputPath } from "./preset-target.js";
export { needsConfigSet, requireConfigSet, resolveConfigSet } from "./config-set.js";
export { isConfigSet, isRenderBlock } from "./dispatch.js";
export {
  AUTOMATIC_MAPPING,
  isMappingFailure,
  jsonOutputPath,
  GENERATED_LOCAL_PREFIX,
  generatedLocal,
  HIDDEN_CUSTOMIZER_PREFIX,
  hiddenCustomizer,
  mapManifestation,
  mappingFromPackages,
  moduleNameForManifestation,
  pathForManifestation,
  scadModuleName,
  scadOutputPath,
} from "./naming.js";
export type { ManifestationMapping, ManifestationResult } from "./naming.js";
export {
  OUTPUT_ESCAPES_SRC,
  OUTPUT_OVERWRITES_BML,
  CONFIG_PROFILE_INCOMPLETE,
  CONFIG_SET_MISSING,
  CONFIG_SET_UNEXPECTED,
  CONFIG_SET_UNKNOWN,
  SELECTOR_EMPTY,
  SOURCE_OUTSIDE_ROOT,
  SOURCE_PACKAGE_ALONE,
  SOURCE_PACKAGE_REQUIRED,
  TARGET_COLLISION,
  TARGET_PACKAGE_AMBIGUOUS,
  TARGET_PACKAGE_UNDETERMINED,
} from "./diagnostics.js";
export { serializeLiteral } from "./serialize.js";
export { RENDER_TARGET_VERSION } from "./version.js";
