import { parseArgs } from "./args.js";
import { runCompile, type HostResult } from "./compile-command.js";
import { HELP, INIT_HELP } from "./help.js";
import { runInit } from "./init-command.js";
import { runValidate } from "./validate-command.js";

export type { HostResult } from "./compile-command.js";

export function execute(argv: readonly string[], rootDir: string): HostResult {
  const parsed = parseArgs(argv);
  if (parsed.command === "help") {
    return { code: 0, lines: [parsed.topic === "init" ? INIT_HELP : HELP] };
  }
  if (parsed.command === "usage") {
    return { code: 2, lines: [parsed.message, "", HELP] };
  }
  if (parsed.command === "validate") {
    return runValidate(parsed, rootDir);
  }
  if (parsed.command === "init") {
    return runInit(parsed, rootDir);
  }
  return runCompile(parsed, rootDir);
}
