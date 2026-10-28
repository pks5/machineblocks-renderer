import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const CLI_PACKAGE = "@machineblocks/cli";
const MACHINEBLOCKS_CORE = "@machineblocks/core";
const BLOCKML_CLI = "@blockml/cli";
const BLOCKML_CORE = "@blockml/core";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
export function runUpdate(noInstall, rootDir) {
    const lines = [];
    const profile = profilePins();
    if (typeof profile === "string") {
        return { code: 2, lines: [profile] };
    }
    const pkgPath = join(rootDir, "package.json");
    if (!existsSync(pkgPath)) {
        return { code: 2, lines: ["Not a BlockML project. package.json is missing."] };
    }
    let raw;
    try {
        raw = readFileSync(pkgPath, "utf8");
    }
    catch {
        return { code: 2, lines: ["Could not parse package.json."] };
    }
    let pkg;
    try {
        pkg = JSON.parse(raw);
    }
    catch {
        return { code: 2, lines: ["Could not parse package.json."] };
    }
    if (!hasBlockmlKey(pkg)) {
        return { code: 2, lines: ["Not a BlockML project. package.json has no blockml key."] };
    }
    for (const field of DEP_FIELDS) {
        if (depRecord(pkg, field) === "invalid") {
            return { code: 2, lines: [`Could not update package.json ${field}.`] };
        }
    }
    const plans = [];
    for (const pin of profile) {
        const planned = planPin(pkg, pin.name, pin.range, pin.defaultField);
        if (planned.error) {
            return { code: 2, lines: [planned.error] };
        }
        plans.push({ name: pin.name, items: planned.plans });
    }
    let changed = false;
    for (const pin of plans) {
        for (const item of pin.items) {
            if (item.action === "set") {
                applyPin(pkg, item, pin.name);
                changed = true;
                lines.push(item.from === undefined
                    ? `Added ${item.field}.${pin.name} ${item.to}`
                    : `Updated ${item.field}.${pin.name} from ${item.from} to ${item.to}`);
            }
            else if (item.keptBecause !== "same") {
                const shown = item.from ?? "non-version specifier";
                lines.push(`Left ${item.field}.${pin.name} at ${shown}`);
            }
        }
    }
    if (!changed && plans.every((pin) => pin.items.every((item) => item.keptBecause === "same"))) {
        lines.push("package.json already matches this CLI.");
    }
    if (changed) {
        try {
            writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
        }
        catch {
            return { code: 1, lines: [...lines, "Could not write package.json."] };
        }
    }
    if (noInstall) {
        if (changed) {
            lines.push("Next: npm install");
        }
        return { code: 0, lines };
    }
    const installed = npmInstall(rootDir);
    if (installed.code !== 0) {
        return { code: installed.code, lines: [...lines, ...installed.lines] };
    }
    return { code: 0, lines };
}
function profilePins() {
    const pkg = ownPackageJson();
    const machineblocksCore = pkg.dependencies?.[MACHINEBLOCKS_CORE];
    const blockmlCli = pkg.dependencies?.[BLOCKML_CLI];
    const blockmlCore = pkg.dependencies?.[BLOCKML_CORE];
    if (machineblocksCore === undefined) {
        return `This host does not declare a dependency range for ${MACHINEBLOCKS_CORE}.`;
    }
    if (blockmlCli === undefined) {
        return `This host does not declare a dependency range for ${BLOCKML_CLI}.`;
    }
    if (blockmlCore === undefined) {
        return `This host does not declare a dependency range for ${BLOCKML_CORE}.`;
    }
    return [
        { name: CLI_PACKAGE, range: `^${pkg.version ?? "0.0.0"}`, defaultField: "devDependencies" },
        { name: MACHINEBLOCKS_CORE, range: machineblocksCore, defaultField: "dependencies" },
        { name: BLOCKML_CLI, range: blockmlCli, defaultField: "devDependencies" },
        { name: BLOCKML_CORE, range: blockmlCore, defaultField: "dependencies" },
    ];
}
function ownPackageJson() {
    const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
}
function hasBlockmlKey(pkg) {
    return Object.prototype.hasOwnProperty.call(pkg, "blockml");
}
function depRecord(pkg, field) {
    if (!Object.prototype.hasOwnProperty.call(pkg, field) || pkg[field] === undefined) {
        return "missing";
    }
    const value = pkg[field];
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return "invalid";
    }
    return value;
}
/** Registry ranges have no ":". workspace:, file:, npm:, git, and http specifiers do. */
function isRegistryRange(range) {
    return !range.includes(":");
}
function planPin(pkg, name, target, defaultField) {
    const hits = [];
    for (const field of DEP_FIELDS) {
        const rec = depRecord(pkg, field);
        if (rec === "missing" || rec === "invalid") {
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(rec, name)) {
            hits.push({ field, value: rec[name] });
        }
    }
    if (hits.length === 0) {
        const dest = depRecord(pkg, defaultField);
        if (dest === "invalid") {
            return { plans: [], error: `Could not update package.json ${defaultField}.` };
        }
        return {
            plans: [{ field: defaultField, from: undefined, to: target, action: "set", keptBecause: undefined }],
        };
    }
    const plans = [];
    for (const hit of hits) {
        if (typeof hit.value !== "string") {
            plans.push({ field: hit.field, from: undefined, to: target, action: "keep", keptBecause: "non-string" });
            continue;
        }
        if (!isRegistryRange(hit.value)) {
            plans.push({ field: hit.field, from: hit.value, to: target, action: "keep", keptBecause: "protocol" });
            continue;
        }
        if (hit.value === target) {
            plans.push({ field: hit.field, from: hit.value, to: target, action: "keep", keptBecause: "same" });
            continue;
        }
        plans.push({ field: hit.field, from: hit.value, to: target, action: "set", keptBecause: undefined });
    }
    return { plans };
}
function applyPin(pkg, plan, name) {
    const rec = depRecord(pkg, plan.field);
    if (rec === "missing") {
        pkg[plan.field] = { [name]: plan.to };
        return;
    }
    if (rec === "invalid") {
        return;
    }
    rec[name] = plan.to;
}
function npmInstall(rootDir) {
    const result = spawnSync("npm", ["install"], { cwd: rootDir, stdio: "inherit" });
    if (result.status !== 0) {
        return { code: 1, lines: ["npm install failed."] };
    }
    return { code: 0, lines: [] };
}
//# sourceMappingURL=update-command.js.map