import type { BlockDefinition } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
import type { BlockProcessor, CompileBlock, RenderEngine } from "@blockml/block-render-engine";
import { compositionChildren, hasDirectives } from "./composition.js";
import { renderConfigSetFile } from "./config-set.js";
import { renderCompositeFile } from "./composite.js";
import {
  DIRECTIVE_DEFERRED,
  EMPTY_BLOCK,
  LEAF_VALUE_UNSUPPORTED,
  MB_LIB_PATH_MISSING,
  PRESET_TARGET_OPEN,
  errorOutput,
} from "./diagnostics.js";
import { renderLeafFile } from "./leaf.js";
import type { ManifestationMapping } from "./naming.js";
import type { MachineBlocksTargetOptions } from "./options.js";
import { plannedOutputPath, presetTarget } from "./preset-target.js";
import { renderPresetFile } from "./presets.js";
import { renderSetFile } from "./set-file.js";
import { BLOCK_FQN, BLOCK_PRESETS_FQN, CONFIG_SET_FQN, NATIVE_BLOCK_FQN, SET_FQN } from "./version.js";

/** Reads options captured for the current render call. */
export interface OptionSlot {
  current: MachineBlocksTargetOptions;
  mapping: ManifestationMapping;
}

export class ScadSetProcessor implements BlockProcessor {
  readonly baseType = SET_FQN;

  constructor(private readonly options: OptionSlot) {}

  process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput {
    return engine.compile(block, this, context);
  }

  compile(block: CompileBlock, context: RenderContext): RenderOutput {
    if (!isDefinition(block)) {
      return errorOutput(LEAF_VALUE_UNSUPPORTED, "ScadSetProcessor compiles a block definition.", blockSource(block));
    }
    const mbLibPath = this.options.current.mbLibPath;
    if (!mbLibPath) {
      return errorOutput(MB_LIB_PATH_MISSING, "targetOptions.machineblocks-v3-scad.mbLibPath is required.", blockSource(block));
    }
    if (hasDirectives(block)) {
      return errorOutput(DIRECTIVE_DEFERRED, "bml:each, bml:if, and bml:with are not expanded for a Set.", blockSource(block));
    }
    return renderSetFile(
      block,
      context.outputRelativePath,
      context.session.outputBasePath,
      mbLibPath,
      this.options.mapping,
      context.session.typeRegistry,
      this.options.current.configSet,
    );
  }
}

export class ScadConfigSetProcessor implements BlockProcessor {
  readonly baseType = CONFIG_SET_FQN;

  constructor(private readonly options: OptionSlot) {}

  process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput {
    return engine.compile(block, this, context);
  }

  compile(block: CompileBlock, context: RenderContext): RenderOutput {
    if (!isDefinition(block)) {
      return errorOutput(LEAF_VALUE_UNSUPPORTED, "ScadConfigSetProcessor compiles a block definition.", blockSource(block));
    }
    return renderConfigSetFile(block, context.outputRelativePath, context.session.typeRegistry, this.options.mapping);
  }
}

export class ScadBlockPresetsProcessor implements BlockProcessor {
  readonly baseType = BLOCK_PRESETS_FQN;

  constructor(private readonly options: OptionSlot) {}

  process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput {
    return engine.compile(block, this, context);
  }

  compile(block: CompileBlock, context: RenderContext): RenderOutput {
    if (!isDefinition(block)) {
      return errorOutput(LEAF_VALUE_UNSUPPORTED, "ScadBlockPresetsProcessor compiles a block definition.", blockSource(block));
    }
    const registry = context.session.typeRegistry;
    const target = presetTarget(block, registry);
    if (target.kind !== "closed") {
      return errorOutput(PRESET_TARGET_OPEN, `${block.type} leaves BlockPresets parameter T open.`, blockSource(block));
    }
    const output = plannedOutputPath(block, registry, this.options.mapping);
    if (!output.ok) {
      return errorOutput(output.code, output.message, blockSource(block));
    }
    return renderPresetFile(block, registry, output.path, target.fqn);
  }
}

export class ScadBlockProcessor implements BlockProcessor {
  readonly baseType = BLOCK_FQN;

  constructor(private readonly options: OptionSlot) {}

  process(block: CompileBlock, engine: RenderEngine, context: RenderContext): RenderOutput {
    return engine.compile(block, this, context);
  }

  compile(block: CompileBlock, context: RenderContext): RenderOutput {
    if (!isDefinition(block)) {
      return errorOutput(LEAF_VALUE_UNSUPPORTED, "ScadBlockProcessor compiles a block definition.", blockSource(block));
    }
    const mbLibPath = this.options.current.mbLibPath;
    if (!mbLibPath) {
      return errorOutput(MB_LIB_PATH_MISSING, "targetOptions.machineblocks-v3-scad.mbLibPath is required.", blockSource(block));
    }
    const parts = compositionChildren(block, "parts");
    if (parts.length === 0) {
      return errorOutput(EMPTY_BLOCK, "A block with no children has nothing to render.", blockSource(block));
    }
    const only = parts.length === 1 ? parts[0] : undefined;
    if (!hasDirectives(block) && only?.kind === "blockInstance" && only.instance.typeFqn === NATIVE_BLOCK_FQN) {
      return renderLeafFile(
        block,
        context.outputRelativePath,
        context.session.outputBasePath,
        mbLibPath,
        context.session.typeRegistry,
        this.options.mapping,
        this.options.current.configSet,
      );
    }
    return renderCompositeFile(
      block,
      context.outputRelativePath,
      context.session.outputBasePath,
      mbLibPath,
      context.session.typeRegistry,
      this.options.mapping,
      this.options.current.configSet,
    );
  }
}

function isDefinition(block: CompileBlock): block is BlockDefinition {
  return "members" in block;
}

function blockSource(block: CompileBlock): { file: string; line: number; column: number } {
  return block.source ?? { file: "", line: 1, column: 1 };
}
