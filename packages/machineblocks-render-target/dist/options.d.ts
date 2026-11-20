export interface MachineBlocksTargetOptions {
    mbLibPath?: string;
    settingsFormat?: string;
    sourcePackage?: string;
    targetPackage?: string;
    /** Resolved ConfigSet FQN for a geometry block or a set. */
    configSet?: string;
}
export declare function readTargetOptions(targetOptions: unknown): MachineBlocksTargetOptions;
//# sourceMappingURL=options.d.ts.map