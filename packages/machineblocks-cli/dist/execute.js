import { parseArgs } from "./args.js";
import { runCompile } from "./compile-command.js";
import { HELP } from "./help.js";
import { runValidate } from "./validate-command.js";
export function execute(argv, rootDir) {
    const parsed = parseArgs(argv);
    if (parsed.command === "help") {
        return { code: 0, lines: [HELP] };
    }
    if (parsed.command === "usage") {
        return { code: 2, lines: [parsed.message, "", HELP] };
    }
    if (parsed.command === "validate") {
        return runValidate(parsed, rootDir);
    }
    return runCompile(parsed, rootDir);
}
//# sourceMappingURL=execute.js.map