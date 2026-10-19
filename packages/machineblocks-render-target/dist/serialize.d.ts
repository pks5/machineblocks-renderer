import type { LiteralValue } from "@blockml/bom";
export declare function isIdentifier(raw: string): boolean;
export declare function scadString(value: string): string;
/** Customizer JSON stores every value as a string. Strings stay unquoted. */
export declare function presetParameterValue(value: LiteralValue): string | undefined;
export declare function serializeLiteral(value: LiteralValue): string | undefined;
//# sourceMappingURL=serialize.d.ts.map