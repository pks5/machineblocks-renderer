import type { BlockDefinition } from "@blockml/bom";
export declare function encodeVlq(value: number): string;
/** One mappings group per generated line, all pointing at the block definition. */
export declare function sourceMapFor(content: string, filename: string, block: BlockDefinition): string;
export declare function withSourceMap(block: BlockDefinition, file: {
    path: string;
    content: string;
}): {
    path: string;
    content: string;
    sourceMap: string;
};
//# sourceMappingURL=source-map.d.ts.map