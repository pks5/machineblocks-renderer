import type { BlockDefinition, TypeExpression } from "@blockml/bom";
import { type TypeRegistry } from "@blockml/framework";
export declare const CUSTOMIZER_RULES_FQN = "com.machineblocks.bml.target.render.CustomizerRules";
export declare const SENTINEL_TOGGLE_FQN = "com.machineblocks.bml.target.render.SentinelToggle";
export declare const AXIS_VECTOR_FQN = "com.machineblocks.bml.target.render.AxisVector";
export declare const AXIS_COMPONENTS_FQN = "com.machineblocks.bml.target.render.AxisComponents";
export declare const TYPE_SPLIT_FQN = "com.machineblocks.bml.target.render.TypeSplit";
export interface CustomizerField {
    name: string;
    scad: string;
    /** Comment above the assignment. The customizer shows it as the parameter description. */
    description?: string;
    /** Trailing customizer hint, such as a range comment. */
    hint?: string;
}
export interface CustomizerProjection {
    fields: CustomizerField[];
    /** Set when the property value is a hidden recombination. An axis vector keeps the property name. */
    hiddenName?: string;
    expression?: string;
    /** Customizer tab. Grouped fields are emitted after the ungrouped parameters. */
    group?: string;
}
export interface CustomizerRuleSet {
    splits: SplitRule[];
    axes: AxisRule[];
    components: AxisRule[];
    sentinels: SentinelRule[];
}
interface SplitRule {
    id: string;
    type: string;
    group: string;
    range: string;
    descriptions: string[];
}
interface AxisRule {
    id: string;
    valueType: string;
    axis: string;
    fields: readonly string[];
}
interface SentinelRule {
    id: string;
    sentinel: string;
    valueType: string;
    checkboxSelects: "sentinel" | "value";
    checkboxSuffix: string;
    inactiveDefault: string;
    sentinelLiteral: string;
}
type Registry = TypeRegistry;
export declare function readCustomizerRules(registry: Registry): {
    ok: true;
    rules: CustomizerRuleSet;
} | {
    ok: false;
    message: string;
};
export declare function projectCustomizer(input: {
    name: string;
    type: TypeExpression | undefined;
    value: unknown;
    registry: Registry;
    rules: CustomizerRuleSet;
    names: ReadonlySet<string>;
}): CustomizerProjection | undefined;
export declare function formatHidden(configAssignment: string, projections: readonly CustomizerProjection[]): string;
export declare function customizerText(name: string, scad: string, projection: CustomizerProjection | undefined): string;
export interface CustomizerEntry {
    name: string;
    scad: string;
    projection?: CustomizerProjection | undefined;
}
/** Ungrouped parameters stay in order. Grouped projections follow, each in its own tab. */
export declare function formatCustomizer(entries: readonly CustomizerEntry[]): string;
export declare function projectionsOf(block: BlockDefinition, rules: CustomizerRuleSet, registry: Registry): Map<string, CustomizerProjection>;
export {};
//# sourceMappingURL=customizer-rules.d.ts.map