import type { BlockDefinition, TypeExpression } from "@blockml/bom";
import { PRESET_TARGET_OPEN } from "./diagnostics.js";
import { mapManifestation, pathForManifestation, type ManifestationMapping } from "./naming.js";
import { BLOCK_PRESETS_FQN } from "./version.js";

interface BlockLookup {
  get(fqn: string): { block: BlockDefinition } | undefined;
}

export type PresetTarget = { kind: "none" } | { kind: "closed"; fqn: string } | { kind: "open" };

/** Closed T on BlockPresets, walking a catalog that binds T through an intermediate generic. */
export function presetTarget(block: BlockDefinition, registry: BlockLookup): PresetTarget {
  const env = new Map<string, string>();
  const seen = new Set<string>();
  let current: BlockDefinition | undefined = block;
  while (current && !seen.has(current.type)) {
    seen.add(current.type);
    const applied = presetApplication(current);
    if (applied !== undefined) {
      const fqn = applied === "missing" ? undefined : resolveTypeArgument(applied, env);
      return fqn ? { kind: "closed", fqn } : { kind: "open" };
    }
    if (current.type === BLOCK_PRESETS_FQN) {
      return { kind: "open" };
    }
    const parentFqn: string | undefined = current.baseType;
    if (!parentFqn) {
      return { kind: "none" };
    }
    const parent: BlockDefinition | undefined = registry.get(parentFqn)?.block;
    bindGenericApplication(current, parent, env);
    if (!parent && parentFqn === BLOCK_PRESETS_FQN) {
      return { kind: "open" };
    }
    current = parent;
  }
  return { kind: "none" };
}

export function plannedOutputPath(
  block: BlockDefinition,
  registry: BlockLookup,
  mapping: ManifestationMapping,
): { ok: true; path: string } | { ok: false; code: string; message: string } {
  const target = presetTarget(block, registry);
  if (target.kind === "open") {
    return {
      ok: false,
      code: PRESET_TARGET_OPEN,
      message: `${block.type} leaves BlockPresets parameter T open.`,
    };
  }
  const fqn = target.kind === "closed" ? target.fqn : block.type;
  const manifested = mapManifestation(fqn, mapping, target.kind === "closed" ? "reference" : "selected");
  if (!manifested.ok) {
    return manifested;
  }
  return { ok: true, path: pathForManifestation(manifested.fqn, target.kind === "closed" ? "json" : "scad") };
}

function presetApplication(block: BlockDefinition): TypeExpression | "missing" | undefined {
  const expr = block.baseTypeExpression;
  if (expr?.kind === "named" && expr.fqn === BLOCK_PRESETS_FQN) {
    return expr.typeArguments?.[0] ?? "missing";
  }
  if (block.baseType === BLOCK_PRESETS_FQN && block.type !== BLOCK_PRESETS_FQN) {
    return "missing";
  }
  return undefined;
}

function bindGenericApplication(child: BlockDefinition, parent: BlockDefinition | undefined, env: Map<string, string>): void {
  const parameters = parent?.genericTypes;
  if (!parameters || parameters.length === 0) {
    return;
  }
  const expr = child.baseTypeExpression;
  if (!expr || expr.kind !== "named" || expr.fqn !== parent.type) {
    return;
  }
  const args = expr.typeArguments ?? [];
  parameters.forEach((parameter, index) => {
    const arg = args[index];
    const resolved = arg ? resolveTypeArgument(arg, env) : resolveDefault(parameter.defaultType, env);
    if (resolved) {
      env.set(parameter.name, resolved);
    }
  });
}

function resolveDefault(defaultType: string | undefined, env: ReadonlyMap<string, string>): string | undefined {
  if (!defaultType) {
    return undefined;
  }
  return env.get(defaultType) ?? (defaultType.includes(".") ? defaultType : undefined);
}

function resolveTypeArgument(expr: TypeExpression, env: ReadonlyMap<string, string>): string | undefined {
  if (expr.kind === "named") {
    return expr.fqn;
  }
  if (expr.kind === "genericParam") {
    return env.get(expr.name);
  }
  if (expr.kind === "grouped") {
    return resolveTypeArgument(expr.expression, env);
  }
  return undefined;
}
