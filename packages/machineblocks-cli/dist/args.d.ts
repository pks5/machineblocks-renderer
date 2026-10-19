export interface ValidateArgs {
    command: "validate";
    file?: string;
    all: boolean;
}
export interface CompileArgs {
    command: "compile";
    selector: string;
    sourcePackage?: string;
    targetPackage?: string;
}
export type HostCommand = {
    command: "help";
} | ValidateArgs | CompileArgs | {
    command: "usage";
    message: string;
};
export declare function parseArgs(argv: readonly string[]): HostCommand;
/** A final .* or .** segment denotes a package. An exact type FQN does not. */
export declare function sourcePackageFromSelector(selector: string): string | undefined;
//# sourceMappingURL=args.d.ts.map