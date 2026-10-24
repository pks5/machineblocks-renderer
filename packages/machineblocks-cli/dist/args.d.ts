export type HelpTopic = "validate" | "compile" | "init";
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
export interface InitArgs {
    command: "init";
    packageFqn: string;
    srcDir?: string;
    install: boolean;
}
export type HostCommand = {
    command: "help";
    topic?: HelpTopic;
} | ValidateArgs | CompileArgs | InitArgs | {
    command: "usage";
    message: string;
    topic?: HelpTopic;
};
export declare function parseArgs(argv: readonly string[]): HostCommand;
/** A final .* or .** segment denotes a package. An exact type FQN does not. */
export declare function sourcePackageFromSelector(selector: string): string | undefined;
//# sourceMappingURL=args.d.ts.map