import type { PropertyDefinition, TypeExpression } from "@blockml/bom";
import { type TypeRegistry } from "@blockml/framework";
export interface PropertyType {
    typeFqn?: string | undefined;
    type?: TypeExpression | undefined;
}
export interface LowerScope {
    registry?: TypeRegistry | undefined;
    typeFqn?: string | undefined;
    type?: TypeExpression | undefined;
    properties: ReadonlyMap<string, PropertyType>;
    locals: ReadonlySet<string>;
}
export interface Lowered {
    ok: true;
    scad: string;
    constant: boolean;
}
export interface LowerError {
    ok: false;
    code: string;
    message: string;
}
export declare function lowerExpression(raw: string, scope: LowerScope): Lowered | LowerError;
export declare function lowerMember(kind: "literal" | "expression", literal: unknown, raw: string | undefined, scope: LowerScope): Lowered | LowerError;
export declare function propertyTypesOf(members: readonly {
    kind: string;
    name: string;
    typeFqn?: string;
    type?: TypeExpression;
}[]): Map<string, PropertyType>;
export declare function asProperty(member: {
    kind: string;
}): member is PropertyDefinition;
//# sourceMappingURL=lower.d.ts.map