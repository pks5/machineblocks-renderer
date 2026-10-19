const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function encodeVlq(value) {
    let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
    let encoded = "";
    do {
        let digit = vlq & 31;
        vlq >>>= 5;
        if (vlq > 0) {
            digit |= 32;
        }
        const char = CHARSET[digit];
        if (char === undefined) {
            break;
        }
        encoded += char;
    } while (vlq > 0);
    return encoded;
}
/** One mappings group per generated line, all pointing at the block definition. */
export function sourceMapFor(content, filename, block) {
    const lines = content.endsWith("\n") ? content.slice(0, -1).split("\n") : content.split("\n");
    const source = block.source;
    const sourceFile = source?.file && source.file.length > 0 ? source.file : filename;
    const line = Math.max((source?.line ?? 1) - 1, 0);
    const column = Math.max((source?.column ?? 1) - 1, 0);
    const first = `${encodeVlq(0)}${encodeVlq(0)}${encodeVlq(line)}${encodeVlq(column)}`;
    const rest = `${encodeVlq(0)}${encodeVlq(0)}${encodeVlq(0)}${encodeVlq(0)}`;
    const mappings = lines.map((_, index) => (index === 0 ? first : rest)).join(";");
    return JSON.stringify({
        version: 3,
        file: filename,
        sources: [sourceFile],
        names: [],
        mappings,
    }, null, 2);
}
export function withSourceMap(block, file) {
    const filename = file.path.split("/").pop() ?? file.path;
    return { ...file, sourceMap: sourceMapFor(file.content, filename, block) };
}
//# sourceMappingURL=source-map.js.map