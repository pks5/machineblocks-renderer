import { COMPILE_HELP, INIT_HELP } from "./help.js";
export function parseArgs(argv) {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
        return { command: "help" };
    }
    const [command, ...rest] = argv;
    if (command === "validate") {
        return parseValidate(rest);
    }
    if (command === "compile") {
        return parseCompile(rest);
    }
    if (command === "init") {
        return parseInit(rest);
    }
    return { command: "usage", message: `Unknown command: ${command ?? ""}` };
}
function parseValidate(args) {
    let file;
    let all = false;
    for (const arg of args) {
        if (arg === "--help") {
            return { command: "help" };
        }
        if (arg === "--all") {
            all = true;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}` };
        }
        if (file !== undefined) {
            return { command: "usage", message: "validate accepts one file." };
        }
        file = arg;
    }
    if (file !== undefined && all) {
        return { command: "usage", message: "Specify either <file> or --all, not both." };
    }
    return file === undefined ? { command: "validate", all } : { command: "validate", all, file };
}
function parseCompile(args) {
    if (args.includes("--help")) {
        return { command: "help" };
    }
    let selector;
    let sourcePackage;
    let targetPackage;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined) {
            continue;
        }
        if (arg === "--source-package" || arg === "--target-package") {
            const value = args[index + 1];
            if (value === undefined || value.startsWith("--")) {
                return { command: "usage", message: `${arg} requires a package FQN.` };
            }
            if (arg === "--source-package") {
                sourcePackage = value;
            }
            else {
                targetPackage = value;
            }
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}` };
        }
        if (selector !== undefined) {
            return { command: "usage", message: "compile accepts one source selector." };
        }
        selector = arg;
    }
    if (selector === undefined) {
        return { command: "usage", message: `compile requires a source selector.\n\n${COMPILE_HELP}` };
    }
    const parsed = { command: "compile", selector };
    if (sourcePackage !== undefined) {
        parsed.sourcePackage = sourcePackage;
    }
    if (targetPackage !== undefined) {
        parsed.targetPackage = targetPackage;
    }
    return parsed;
}
function parseInit(args) {
    if (args.includes("--help")) {
        return { command: "help", topic: "init" };
    }
    let packageFqn;
    let srcDir;
    let install = false;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined) {
            continue;
        }
        if (arg === "--install") {
            install = true;
            continue;
        }
        if (arg === "--src") {
            const value = args[index + 1];
            if (value === undefined || value.startsWith("--")) {
                return { command: "usage", message: "--src requires a directory." };
            }
            srcDir = value;
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}` };
        }
        if (packageFqn !== undefined) {
            return { command: "usage", message: "init accepts one package FQN." };
        }
        packageFqn = arg;
    }
    if (packageFqn === undefined) {
        return { command: "usage", message: `init requires a package FQN.\n\n${INIT_HELP}` };
    }
    const parsed = { command: "init", packageFqn, install };
    if (srcDir !== undefined) {
        parsed.srcDir = srcDir;
    }
    return parsed;
}
/** A final .* or .** segment denotes a package. An exact type FQN does not. */
export function sourcePackageFromSelector(selector) {
    const parts = selector.split(".");
    const last = parts[parts.length - 1];
    if ((last !== "*" && last !== "**") || parts.length < 2) {
        return undefined;
    }
    return parts.slice(0, -1).join(".");
}
//# sourceMappingURL=args.js.map