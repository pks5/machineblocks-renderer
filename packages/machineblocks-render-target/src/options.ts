import { TARGET_NAME } from "./version.js";

export interface MachineBlocksTargetOptions {
  mbLibPath?: string;
  settingsFormat?: string;
  sourcePackage?: string;
  targetPackage?: string;
}

export function readTargetOptions(targetOptions: unknown): MachineBlocksTargetOptions {
  if (targetOptions === null || typeof targetOptions !== "object") {
    return {};
  }
  const nested = (targetOptions as Record<string, unknown>)[TARGET_NAME];
  if (nested === null || typeof nested !== "object") {
    return {};
  }
  const record = nested as Record<string, unknown>;
  const options: MachineBlocksTargetOptions = {};
  if (typeof record.mbLibPath === "string") {
    options.mbLibPath = record.mbLibPath;
  }
  if (typeof record.settingsFormat === "string") {
    options.settingsFormat = record.settingsFormat;
  }
  if (typeof record.sourcePackage === "string" && record.sourcePackage.length > 0) {
    options.sourcePackage = record.sourcePackage;
  }
  if (typeof record.targetPackage === "string" && record.targetPackage.length > 0) {
    options.targetPackage = record.targetPackage;
  }
  return options;
}
