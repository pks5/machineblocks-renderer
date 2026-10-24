import { parseArgs } from "./args.js";
import { runCompile } from "./compile-command.js";
import { helpFor, usageFor } from "./help.js";
import { runInit } from "./init-command.js";
import { runValidate } from "./validate-command.js";
export function execute(argv, rootDir) {
    const parsed = parseArgs(argv);
    if (parsed.command === "help") {
        return { code: 0, lines: [helpFor(parsed.topic)] };
    }
    if (parsed.command === "usage") {
        return { code: 2, lines: [parsed.message, "", usageFor(parsed.topic)] };
    }
    if (parsed.command === "validate") {
        return runValidate(parsed, rootDir);
    }
    if (parsed.command === "init") {
        return runInit(parsed, rootDir);
    }
    return runCompile(parsed, rootDir);
}
//# sourceMappingURL=execute.js.map