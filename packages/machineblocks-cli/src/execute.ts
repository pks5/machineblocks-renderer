import { parseArgs } from "./args.js";
import { runCompile, type HostResult } from "./compile-command.js";
import { HELP } from "./help.js";
import { runValidate } from "./validate-command.js";

export type { HostResult } from "./compile-command.js";

export function execute(argv: readonly string[], rootDir: string): HostResult {
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
