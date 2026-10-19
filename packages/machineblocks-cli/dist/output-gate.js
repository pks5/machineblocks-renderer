import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { OUTPUT_ESCAPES_SRC, OUTPUT_OVERWRITES_BML } from "@machineblocks/render-target";
export function resolveOutputPath(srcDir, filePath) {
    const srcReal = realpathSync(srcDir);
    const portable = filePath.replaceAll("\\", "/");
    if (portable.length === 0 || isAbsolute(filePath) || portable.split("/").includes("..")) {
        return {
            ok: false,
            code: OUTPUT_ESCAPES_SRC,
            message: `${filePath} is outside ${srcReal}.`,
        };
    }
    const absolute = resolve(srcReal, portable);
    if (!isInside(srcReal, absolute)) {
        return {
            ok: false,
            code: OUTPUT_ESCAPES_SRC,
            message: `${filePath} is outside ${srcReal}.`,
        };
    }
    if (symlinkEscapes(srcReal, absolute)) {
        return {
            ok: false,
            code: OUTPUT_ESCAPES_SRC,
            message: `${filePath} resolves outside ${srcReal}.`,
        };
    }
    if (overwritesBml(absolute)) {
        return {
            ok: false,
            code: OUTPUT_OVERWRITES_BML,
            message: `${filePath} would overwrite a .bml file.`,
        };
    }
    return { ok: true, absolutePath: absolute };
}
function symlinkEscapes(srcReal, absolute) {
    let existing = absolute;
    while (!existsSync(existing)) {
        const parent = dirname(existing);
        if (parent === existing) {
            return true;
        }
        existing = parent;
    }
    const realExisting = realpathSync(existing);
    if (!isInside(srcReal, realExisting)) {
        return true;
    }
    if (existsSync(absolute)) {
        const stat = lstatSync(absolute);
        if (stat.isSymbolicLink() && !isInside(srcReal, realpathSync(absolute))) {
            return true;
        }
    }
    return false;
}
function overwritesBml(absolute) {
    if (!existsSync(absolute)) {
        return false;
    }
    if (absolute.endsWith(".bml")) {
        return true;
    }
    const stat = lstatSync(absolute);
    if (!stat.isSymbolicLink()) {
        return false;
    }
    return realpathSync(absolute).endsWith(".bml");
}
function isInside(root, candidate) {
    const fromRoot = relative(root, candidate);
    return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}
//# sourceMappingURL=output-gate.js.map