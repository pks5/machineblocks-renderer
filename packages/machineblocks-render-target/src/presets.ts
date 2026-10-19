import type { BlockDefinition, BlockInstance, LiteralValue } from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
import { compositionChildren } from "./composition.js";
import { PRESET_CYCLE, errorOutput } from "./diagnostics.js";
import { presetParameterValue } from "./serialize.js";

type Registry = RenderContext["session"]["typeRegistry"];

export function renderPresetFile(block: BlockDefinition, registry: Registry, outputRelativePath: string): RenderOutput {
  const instances = compositionChildren(block, "presets").flatMap((child) =>
    child.kind === "blockInstance" ? [child.instance] : [],
  );
  const byId = new Map<string, BlockInstance>();
  for (const instance of instances) {
    const id = literalString(instance.id);
    if (id) {
      byId.set(id, instance);
    }
  }
  const parameterSets: Record<string, Record<string, string>> = {};
  for (const instance of instances) {
    const merged = mergePreset(instance, byId, []);
    if (isFailure(merged)) {
      return merged;
    }
    const name = literalString(instance.memberValues.name) ?? literalString(instance.id) ?? "preset";
    const defaults = defaultsFor(instance.typeFqn, registry);
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(merged)) {
      if (key === "name" || key === "basePresets") {
        continue;
      }
      if (defaults.get(key) === value) {
        continue;
      }
      values[key] = value;
    }
    parameterSets[name] = values;
  }
  const content = `${JSON.stringify({ fileFormatVersion: "1", parameterSets }, null, 2)}\n`;
  return {
    files: [{ path: outputRelativePath.replace(/\.scad$/, ".json"), content }],
  };
}

function mergePreset(
  instance: BlockInstance,
  byId: ReadonlyMap<string, BlockInstance>,
  stack: readonly string[],
): Record<string, string> | RenderOutput {
  const id = literalString(instance.id) ?? "";
  if (id && stack.includes(id)) {
    return errorOutput(PRESET_CYCLE, `Preset cycle at ${id}.`, instance.source ?? { file: "", line: 1, column: 1 });
  }
  const nextStack = id ? [...stack, id] : stack;
  const merged: Record<string, string> = {};
  for (const baseId of presetIds(instance.memberValues.basePresets)) {
    const base = byId.get(baseId);
    if (!base) {
      continue;
    }
    const resolved = mergePreset(base, byId, nextStack);
    if (isFailure(resolved)) {
      return resolved;
    }
    Object.assign(merged, resolved);
  }
  for (const [key, member] of Object.entries(instance.memberValues)) {
    if (key === "basePresets" || member.kind !== "literal") {
      continue;
    }
    const text = presetParameterValue(member);
    if (text !== undefined) {
      merged[key] = text;
    }
  }
  return merged;
}

function defaultsFor(typeFqn: string, registry: Registry): Map<string, string> {
  const defaults = new Map<string, string>();
  const definition = registry.get(typeFqn)?.block;
  if (!definition) {
    return defaults;
  }
  for (const member of definition.members) {
    if (member.kind !== "property" || !member.value || member.value.kind !== "literal") {
      continue;
    }
    const text = presetParameterValue(member.value);
    if (text !== undefined) {
      defaults.set(member.name, text);
    }
  }
  return defaults;
}

function presetIds(value: BlockInstance["memberValues"][string] | undefined): string[] {
  if (!value || value.kind !== "literal") {
    return [];
  }
  if (typeof value.value === "string") {
    return [value.value];
  }
  if (Array.isArray(value.value) && value.value.every((item) => typeof item === "string")) {
    return value.value;
  }
  return [];
}

function literalString(value: LiteralValue | BlockInstance["id"] | undefined): string | undefined {
  if (!value || value.kind !== "literal" || typeof value.value !== "string") {
    return undefined;
  }
  return value.value;
}

function isFailure(value: Record<string, string> | RenderOutput): value is RenderOutput {
  return "files" in value;
}
