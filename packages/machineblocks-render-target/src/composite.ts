import type {
  BlockDefinition,
  BlockInstance,
  CompositionNode,
  DirectiveAttribute,
  EachDirective,
  PropertyDefinition,
} from "@blockml/bom";
import type { RenderContext, RenderOutput } from "@blockml/compiler";
import { parseExpression, resolveEffectiveMembers } from "@blockml/framework";
import { compositionChildren } from "./composition.js";
import { DIRECTIVE_DEFERRED, FUNCTION_NO_RUNTIME, LEAF_VALUE_UNSUPPORTED, errorOutput } from "./diagnostics.js";
import { lowerExpression, propertyTypesOf, type LowerScope, type PropertyType } from "./lower.js";
import { dirnamePosix, joinPosix, relativePosix } from "./paths.js";
import { mapManifestation, moduleNameForManifestation, type ManifestationMapping } from "./naming.js";
import { isIdentifier, serializeLiteral } from "./serialize.js";
import { withSourceMap } from "./source-map.js";
import { NATIVE_BLOCK_FQN, RENDER_TARGET_VERSION } from "./version.js";

type Registry = RenderContext["session"]["typeRegistry"];
type Source = { file: string; line: number; column: number };

interface ChildSetting {
  parameter: string;
  expression: string;
}

interface ReadyProperty {
  name: string;
  scad?: string;
  constant: boolean;
  native: boolean;
}

interface EmitScope {
  registry: Registry;
  block: BlockDefinition;
  properties: ReadonlyMap<string, PropertyType>;
  locals: ReadonlySet<string>;
  source: Source;
}

export function renderCompositeFile(
  block: BlockDefinition,
  outputRelativePath: string,
  outputBasePath: string,
  mbLibPath: string,
  registry: Registry,
  mapping: ManifestationMapping,
): RenderOutput {
  const source = block.source ?? { file: "", line: 1, column: 1 };
  const template = partsTemplate(block);
  const children = compositionChildren(block, "parts").flatMap((child) =>
    child.kind === "blockInstance" ? [child.instance] : [],
  );
  const nativeNames = nativePropertyNames(registry);
  const properties = block.members.filter((member): member is PropertyDefinition => member.kind === "property");
  const ready = readyProperties(block, properties, nativeNames, registry, source);
  if (isOutput(ready)) {
    return ready;
  }
  const root = mapManifestation(block.type, mapping, "selected");
  if (!root.ok) {
    return errorOutput(root.code, root.message, source);
  }
  const moduleName = moduleNameForManifestation(root.fqn);
  const filename = outputRelativePath.split("/").pop() ?? `${block.name}.scad`;
  const outputDir = dirnamePosix(joinPosix(outputBasePath, outputRelativePath));
  const blockImport = relativePosix(outputDir, joinPosix(mbLibPath, "lib/block.scad"));
  const configImport = relativePosix(outputDir, joinPosix(mbLibPath, "config/mb_config.scad"));
  const scope: EmitScope = {
    registry,
    block,
    properties: propertyTypesOf(properties),
    locals: new Set(),
    source,
  };
  const rendered = template
    ? renderWrapped(template.directives ?? [], template.children, scope, "        ")
    : "";
  if (isOutput(rendered)) {
    return rendered;
  }

  const partRows: string[] = [];
  let partsHaveSize = children.length > 0;
  for (const child of children) {
    const partId = literalText(child.id);
    const sizeLiteral = child.memberValues.size;
    if (partId && sizeLiteral?.kind === "literal" && serializeLiteral(sizeLiteral, { registry })) {
      const direction = literalText(child.memberValues.direction) ?? "west";
      const offset =
        child.memberValues.offset?.kind === "literal"
          ? serializeLiteral(child.memberValues.offset, { registry }) ?? "[0, 0, 0]"
          : "[0, 0, 0]";
      partRows.push(`    ["${partId}", ${serializeLiteral(sizeLiteral, { registry })}, "${direction}", ${offset}]`);
    } else {
      partsHaveSize = false;
    }
  }
  const declaresSize = properties.some((property) => property.name === "size");
  const partsLine =
    !declaresSize && partsHaveSize
      ? `    parts = [\n${partRows.join(",\n")}\n    ];\n    size = mb_parts_total_size(parts);\n`
      : "";
  const passed = ready.filter((property) => property.scad !== undefined);

  const content = `${header(block, filename)}

/* Imports */
use <${blockImport}>;
include <${configImport}>;

/* Customization */
${customizerLines(passed)}

/* Main Module Call */
${moduleName}(
    config = mb_config,
    settings = [${settingsBody(passed.map((property) => `        ["${property.name}", ${property.name}]`))}]
);

/* Main Module Definition */
module ${moduleName}(config = undef, settings = undef) {
${propertyGetters(ready)}
    blockId = mb_param_id(config, settings, "${block.type}");
${fixedGetters(properties)}
    assembly = mb_assembly(config, settings, size, direction);
    renderGroups = mb_param_renderGroups(config, settings);
${partsLine}    mb_block(
        config = config,
        settings = [
            ["id", blockId],
            ["base", false],
            ["studs", false],
            ["size", size],
            ["align", align],
            ["offset", offset],
            ["direction", direction]
        ]
    ) {
${rendered}
    }
}

/* Optional Sub Modules */
/* Optional Helper Modules */
/* Optional Global Functions */
`;

  return { files: [withSourceMap(block, { path: outputRelativePath, content })] };
}

function renderWrapped(
  directives: readonly DirectiveAttribute[],
  nodes: readonly CompositionNode[],
  scope: EmitScope,
  indent: string,
): string | RenderOutput {
  return applyDirectives(directives, scope, indent, (inner, innerIndent) => renderNodes(nodes, inner, innerIndent));
}

function renderNodes(nodes: readonly CompositionNode[], scope: EmitScope, indent: string): string | RenderOutput {
  const parts: string[] = [];
  for (const node of nodes) {
    const rendered = renderNode(node, scope, indent);
    if (isOutput(rendered)) {
      return rendered;
    }
    parts.push(rendered);
  }
  return parts.join("\n");
}

function renderNode(node: CompositionNode, scope: EmitScope, indent: string): string | RenderOutput {
  return applyDirectives(node.directives ?? [], scope, indent, (inner, innerIndent) => {
    if (node.kind === "virtualContainer") {
      return renderNodes(node.children, inner, innerIndent);
    }
    return renderInstance(node.instance, inner, innerIndent);
  });
}

function applyDirectives(
  directives: readonly DirectiveAttribute[],
  scope: EmitScope,
  indent: string,
  body: (scope: EmitScope, indent: string) => string | RenderOutput,
): string | RenderOutput {
  const each = directives.find((directive): directive is EachDirective => directive.type === "each");
  const guard = directives.find((directive) => directive.type === "if" || directive.type === "unless");
  const withs = directives.flatMap((directive) => (directive.type === "with" ? directive.bindings : []));
  if (each && (each.variables.length !== 1 || !each.variables[0] || !isIdentifier(each.variables[0]))) {
    return errorOutput(DIRECTIVE_DEFERRED, "bml:each needs one identifier variable.", scope.source);
  }
  const layers = (each ? 1 : 0) + (guard ? 1 : 0);
  const innerIndent = `${indent}${"    ".repeat(layers)}`;
  const locals = new Set(scope.locals);
  if (each?.variables[0]) {
    locals.add(each.variables[0]);
  }
  let cursor: EmitScope = { ...scope, locals };
  const assignments: string[] = [];
  for (const binding of withs) {
    if (!isIdentifier(binding.name) || binding.value.raw.trim().length === 0) {
      return errorOutput(DIRECTIVE_DEFERRED, "bml:with binding cannot be lowered.", scope.source);
    }
    const lowered = lowerExpression(binding.value.raw, lowerScope(cursor));
    if (!lowered.ok) {
      return errorOutput(lowered.code, lowered.message, binding.value.source ?? scope.source);
    }
    assignments.push(`${innerIndent}${binding.name} = ${lowered.scad};`);
    locals.add(binding.name);
    cursor = { ...cursor, locals: new Set(locals) };
  }
  const rendered = body(cursor, innerIndent);
  if (isOutput(rendered)) {
    return rendered;
  }
  let text = `${assignments.join("\n")}${assignments.length > 0 && rendered ? "\n" : ""}${rendered}`;
  if (guard) {
    const lowered = lowerExpression(guard.condition.raw, lowerScope(scope));
    if (!lowered.ok) {
      return errorOutput(lowered.code, lowered.message, guard.condition.source ?? scope.source);
    }
    const test = guard.type === "unless" ? `!(${lowered.scad})` : lowered.scad;
    const guardIndent = `${indent}${"    ".repeat(each ? 1 : 0)}`;
    text = `${guardIndent}if (${test}) {\n${text}\n${guardIndent}}`;
  }
  if (each?.variables[0]) {
    const collection = eachCollection(each, scope);
    if (isOutput(collection)) {
      return collection;
    }
    text = `${indent}${collection}\n${text}\n${indent}}`;
  }
  return text;
}

function eachCollection(each: EachDirective, scope: EmitScope): string | RenderOutput {
  const lowered = lowerExpression(each.collection.raw, lowerScope(scope));
  if (!lowered.ok) {
    return errorOutput(lowered.code, lowered.message, each.collection.source ?? scope.source);
  }
  const parsed = parseExpression(each.collection.raw);
  const list = parsed.ok && parsed.result.ast.kind === "array";
  const variable = each.variables[0];
  if (list) {
    return `for (${variable} = ${lowered.scad}) {`;
  }
  return `for (${variable} = [0 : ${lowered.scad} - 1]) {`;
}

function renderInstance(instance: BlockInstance, scope: EmitScope, indent: string): string | RenderOutput {
  const partId = literalText(instance.id);
  if (!partId || !isIdentifier(`part_${partId}`)) {
    return errorOutput(LEAF_VALUE_UNSUPPORTED, "A composite child needs an identifier id.", instance.source ?? scope.source);
  }
  const group = `group_${partId}`;
  const settings: ChildSetting[] = [
    { parameter: "id", expression: `mb_block_id(blockId, part_${partId})` },
    { parameter: "render", expression: `mb_group_render(renderGroups, group_${partId})` },
  ];
  for (const [parameter, member] of Object.entries(instance.memberValues)) {
    const expression = childExpression(scope, instance, partId, parameter, member);
    if (isOutput(expression)) {
      return expression;
    }
    settings.push({ parameter, expression });
  }
  const body = settings
    .map((setting) => `${indent}        ["${setting.parameter}", ${setting.expression}]`)
    .join(",\n");
  return `${indent}part_${partId} = "${partId}";
${indent}group_${partId} = part_${partId};
${indent}ns_${partId} = part_${partId};
${indent}mb_block(
${indent}    config = config,
${indent}    settings = [
${body}
${indent}    ]
${indent});`;
}

function childExpression(
  scope: EmitScope,
  instance: BlockInstance,
  partId: string,
  parameter: string,
  member: BlockInstance["memberValues"][string],
): string | RenderOutput {
  const group = `group_${partId}`;
  const namespace = `ns_${partId}`;
  const parameterType = propertyOn(instance.typeFqn, parameter, scope.registry);
  const lowered =
    member.kind === "expression"
      ? lowerExpression(member.raw, {
          ...lowerScope(scope),
          typeFqn: parameterType.typeFqn,
          type: parameterType.type,
        })
      : member.kind === "literal"
        ? lowerExpressionLiteral(member.value, parameterType, scope)
        : { ok: false as const, code: LEAF_VALUE_UNSUPPORTED, message: `Parameter ${parameter} is not a literal.` };
  if (!lowered.ok) {
    return errorOutput(lowered.code, lowered.message, ("source" in member ? member.source : undefined) ?? instance.source ?? scope.source);
  }
  if (parameter === "offset") {
    return `mb_assembly_offset(${lowered.scad}, assembly, renderGroups, ${group})`;
  }
  if (parameter === "baseAdjustment" && isIdentifier(lowered.scad)) {
    return `mb_params_filter(${lowered.scad}, ${namespace})`;
  }
  if (parameter === "baseCutoutType" && cutoutToken(lowered.scad, scope.block, member) === "groove") {
    return `mb_assembly_groove(assembly, renderGroups, ${group})`;
  }
  if (parameter === "tongue" && tongueEnabled(lowered.scad, scope.block, member)) {
    return `mb_assembly_tongue(assembly, renderGroups, ${group})`;
  }
  return lowered.scad;
}

function lowerExpressionLiteral(
  value: unknown,
  parameterType: PropertyType,
  scope: EmitScope,
): { ok: true; scad: string; constant: boolean } | { ok: false; code: string; message: string } {
  const outcome = serializeLiteralValue(value, parameterType, scope.registry);
  if (!outcome) {
    return { ok: false, code: LEAF_VALUE_UNSUPPORTED, message: "Parameter cannot be serialized." };
  }
  return { ok: true, scad: outcome, constant: true };
}

function serializeLiteralValue(value: unknown, parameterType: PropertyType, registry: Registry): string | undefined {
  const outcome = serializeLiteral(
    { kind: "literal", value, typeFqn: parameterType.typeFqn ?? "" },
    { registry, typeFqn: parameterType.typeFqn, type: parameterType.type },
  );
  return outcome;
}

function cutoutToken(
  scad: string,
  block: BlockDefinition,
  member: BlockInstance["memberValues"][string],
): string | undefined {
  const direct = unquote(scad);
  if (direct) {
    return direct;
  }
  if (member.kind === "expression" && isIdentifier(member.raw)) {
    return unquote(propertyScad(block, member.raw.trim()));
  }
  return undefined;
}

function tongueEnabled(
  scad: string,
  block: BlockDefinition,
  member: BlockInstance["memberValues"][string],
): boolean {
  if (scad === "true") {
    return true;
  }
  return member.kind === "expression" && isIdentifier(member.raw) && propertyScad(block, member.raw.trim()) === "true";
}

function propertyScad(block: BlockDefinition, name: string): string | undefined {
  const property = block.members.find(
    (member): member is PropertyDefinition => member.kind === "property" && member.name === name,
  );
  if (!property?.value || property.value.kind !== "literal") {
    return undefined;
  }
  return serializeLiteral(property.value, { typeFqn: property.typeFqn, type: property.type });
}

function readyProperties(
  block: BlockDefinition,
  properties: readonly PropertyDefinition[],
  nativeNames: ReadonlySet<string>,
  registry: Registry,
  source: Source,
): ReadyProperty[] | RenderOutput {
  const scope: LowerScope = {
    registry,
    properties: propertyTypesOf(properties),
    locals: new Set(),
  };
  const ready: ReadyProperty[] = [];
  for (const property of properties) {
    const native = nativeNames.has(property.name);
    if (!property.value) {
      ready.push({ name: property.name, constant: false, native });
      continue;
    }
    if (property.value.kind !== "literal" && property.value.kind !== "expression") {
      return errorOutput(LEAF_VALUE_UNSUPPORTED, `Property ${property.name} cannot be serialized.`, property.source ?? source);
    }
    const lowered =
      property.value.kind === "expression"
        ? lowerExpression(property.value.raw, { ...scope, typeFqn: property.typeFqn || undefined, type: property.type })
        : lowerExpressionLiteral(property.value.value, { typeFqn: property.typeFqn || undefined, type: property.type }, {
            registry,
            block,
            properties: scope.properties,
            locals: new Set(),
            source,
          });
    if (!lowered.ok) {
      return errorOutput(
        lowered.code === FUNCTION_NO_RUNTIME ? FUNCTION_NO_RUNTIME : LEAF_VALUE_UNSUPPORTED,
        lowered.message,
        ("source" in property.value ? property.value.source : undefined) ?? property.source ?? source,
      );
    }
    ready.push({ name: property.name, scad: lowered.scad, constant: lowered.constant, native });
  }
  return ready;
}

function propertyGetters(properties: readonly ReadyProperty[]): string {
  return properties
    .map((property) => {
      const fallback = property.constant && property.scad !== undefined ? `, ${property.scad}` : "";
      if (property.native) {
        return `    ${property.name} = mb_param_${property.name}(config, settings${fallback});`;
      }
      return `    ${property.name} = mb_param(config, settings, "${property.name}"${fallback});`;
    })
    .join("\n");
}

function fixedGetters(properties: readonly PropertyDefinition[]): string {
  const declared = new Set(properties.map((property) => property.name));
  return ["size", "align", "offset", "direction"]
    .filter((name) => !declared.has(name))
    .map((name) => `    ${name} = mb_param_${name}(config, settings);`)
    .join("\n");
}

function customizerLines(properties: readonly ReadyProperty[]): string {
  return properties
    .flatMap((property) => (property.scad === undefined ? [] : [`${property.name} = ${property.scad};`]))
    .join("\n");
}

function settingsBody(lines: readonly string[]): string {
  if (lines.length === 0) {
    return "";
  }
  return `\n${lines.join(",\n")}\n    `;
}

function partsTemplate(block: BlockDefinition) {
  for (const composition of block.compositions) {
    if (composition.aggregationName === "parts") {
      return composition;
    }
  }
  for (const member of block.members) {
    if (member.kind === "aggregation" && member.name === "parts" && member.composition) {
      return member.composition;
    }
  }
  return undefined;
}

function propertyOn(typeFqn: string, name: string, registry: Registry): PropertyType {
  const definition = registry.get(typeFqn)?.block;
  if (!definition) {
    return {};
  }
  const property = resolveEffectiveMembers(definition, registry).find(
    (member) => member.kind === "property" && member.name === name,
  );
  if (!property || property.kind !== "property") {
    return {};
  }
  return { typeFqn: property.typeFqn || undefined, type: property.type };
}

function lowerScope(scope: EmitScope): LowerScope {
  return {
    registry: scope.registry,
    properties: scope.properties,
    locals: scope.locals,
  };
}

function literalText(value: BlockInstance["id"] | BlockInstance["memberValues"][string] | undefined): string | undefined {
  if (!value || value.kind !== "literal" || typeof value.value !== "string") {
    return undefined;
  }
  return value.value;
}

function unquote(value: string | undefined): string | undefined {
  if (!value || !value.startsWith('"') || !value.endsWith('"')) {
    return undefined;
  }
  return value.slice(1, -1);
}

function isOutput(value: unknown): value is RenderOutput {
  return typeof value === "object" && value !== null && "files" in value;
}

export function nativePropertyNames(registry: Registry): Set<string> {
  const names = new Set<string>();
  for (const member of registry.get(NATIVE_BLOCK_FQN)?.block.members ?? []) {
    if (member.kind === "property") {
      names.add(member.name);
    }
  }
  return names;
}

function header(block: BlockDefinition, filename: string): string {
  return `/**
 * MachineBlocks.com Block File
 *
 * Name: ${block.name}
 * Filename: ${filename}
 * Package: ${block.type}
 * Generated by: machineblocks-render-target (${RENDER_TARGET_VERSION})
 */`;
}
