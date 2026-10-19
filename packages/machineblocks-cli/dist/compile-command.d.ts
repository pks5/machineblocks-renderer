import { type CompileArgs } from "./args.js";
export interface HostResult {
    code: number;
    lines: string[];
}
export declare function runCompile(args: CompileArgs, rootDir: string): HostResult;
//# sourceMappingURL=compile-command.d.ts.map