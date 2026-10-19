import { TARGET_NAME } from "./version.js";
export function readTargetOptions(targetOptions) {
    if (targetOptions === null || typeof targetOptions !== "object") {
        return {};
    }
    const nested = targetOptions[TARGET_NAME];
    if (nested === null || typeof nested !== "object") {
        return {};
    }
    const record = nested;
    const options = {};
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
//# sourceMappingURL=options.js.map