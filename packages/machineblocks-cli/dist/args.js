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
    if (command === "update") {
        return parseUpdate(rest);
    }
    return { command: "usage", message: `Unknown command: ${command ?? ""}` };
}
function parseValidate(args) {
    if (args.includes("--help")) {
        return { command: "help", topic: "validate" };
    }
    let file;
    let all = false;
    for (const arg of args) {
        if (arg === "--all") {
            all = true;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}`, topic: "validate" };
        }
        if (file !== undefined) {
            return { command: "usage", message: "validate accepts one file.", topic: "validate" };
        }
        file = arg;
    }
    if (file !== undefined && all) {
        return { command: "usage", message: "Specify either <file> or --all, not both.", topic: "validate" };
    }
    return file === undefined ? { command: "validate", all } : { command: "validate", all, file };
}
function parseCompile(args) {
    if (args.includes("--help")) {
        return { command: "help", topic: "compile" };
    }
    let selector;
    let sourcePackage;
    let targetPackage;
    let configSet;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined) {
            continue;
        }
        if (arg === "--source-package" || arg === "--target-package" || arg === "--config-set") {
            const value = args[index + 1];
            if (value === undefined || value.startsWith("--")) {
                const noun = arg === "--config-set" ? "ConfigSet FQN" : "package FQN";
                return { command: "usage", message: `${arg} requires a ${noun}.`, topic: "compile" };
            }
            if (arg === "--source-package") {
                sourcePackage = value;
            }
            else if (arg === "--target-package") {
                targetPackage = value;
            }
            else {
                configSet = value;
            }
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}`, topic: "compile" };
        }
        if (selector !== undefined) {
            return { command: "usage", message: "compile accepts one source selector.", topic: "compile" };
        }
        selector = arg;
    }
    if (selector === undefined) {
        return { command: "usage", message: "compile requires a source selector.", topic: "compile" };
    }
    const parsed = { command: "compile", selector };
    if (sourcePackage !== undefined) {
        parsed.sourcePackage = sourcePackage;
    }
    if (targetPackage !== undefined) {
        parsed.targetPackage = targetPackage;
    }
    if (configSet !== undefined) {
        parsed.configSet = configSet;
    }
    return parsed;
}
function parseInit(args) {
    if (args.includes("--help")) {
        return { command: "help", topic: "init" };
    }
    let packageFqn;
    let srcDir;
    let noInstall = false;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined) {
            continue;
        }
        if (arg === "--no-install") {
            noInstall = true;
            continue;
        }
        if (arg === "--src") {
            const value = args[index + 1];
            if (value === undefined || value.startsWith("--")) {
                return { command: "usage", message: "--src requires a directory.", topic: "init" };
            }
            srcDir = value;
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}`, topic: "init" };
        }
        if (packageFqn !== undefined) {
            return { command: "usage", message: "init accepts one package FQN.", topic: "init" };
        }
        packageFqn = arg;
    }
    if (packageFqn === undefined) {
        return { command: "usage", message: "init requires a package FQN.", topic: "init" };
    }
    const parsed = { command: "init", packageFqn, noInstall };
    if (srcDir !== undefined) {
        parsed.srcDir = srcDir;
    }
    return parsed;
}
function parseUpdate(args) {
    if (args.includes("--help")) {
        return { command: "help", topic: "update" };
    }
    let noInstall = false;
    for (const arg of args) {
        if (arg === "--no-install") {
            noInstall = true;
            continue;
        }
        if (arg.startsWith("--")) {
            return { command: "usage", message: `Unknown option: ${arg}`, topic: "update" };
        }
        return { command: "usage", message: `Unexpected argument: ${arg}`, topic: "update" };
    }
    return { command: "update", noInstall };
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