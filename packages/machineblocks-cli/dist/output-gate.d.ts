export interface OutputPath {
    ok: true;
    absolutePath: string;
}
export interface OutputPathFailure {
    ok: false;
    code: string;
    message: string;
}
export declare function resolveOutputPath(srcDir: string, filePath: string): OutputPath | OutputPathFailure;
//# sourceMappingURL=output-gate.d.ts.map