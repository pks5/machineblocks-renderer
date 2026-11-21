import type { LiteralValue, TypeExpression } from "@blockml/bom";
import { type TypeRegistry } from "@blockml/framework";
export interface SerializeOptions {
    registry?: TypeRegistry | undefined;
    typeFqn?: string | undefined;
    type?: TypeExpression | undefined;
}
export interface SerializeSuccess {
    ok: true;
    scad: string;
}
export interface SerializeFailure {
    ok: false;
    message: string;
}
export declare function isIdentifier(raw: string): boolean;
export declare function scadString(value: string): string;
/** Customizer JSON stores every value as a string. Strings stay unquoted. */
export declare function presetParameterValue(value: LiteralValue, options?: SerializeOptions): string | undefined;
export declare function serializeLiteral(value: LiteralValue, options?: SerializeOptions): string | undefined;
export declare function serializeTyped(value: unknown, options?: SerializeOptions): SerializeSuccess | SerializeFailure;
/** Property names of a struct, in declaration order. Undefined when the type is absent. */
export declare function structPropertyNames(fqn: string, registry: TypeRegistry): string[] | undefined;
/** Serialize one struct property the same way the struct writer does. */
export declare function serializeStructProperty(value: Record<string, unknown>, field: string, ownerFqn: string, registry: TypeRegistry): SerializeSuccess | SerializeFailure;
//# sourceMappingURL=serialize.d.ts.map