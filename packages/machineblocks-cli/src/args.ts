export type HelpTopic = "validate" | "compile" | "init";

export interface ValidateArgs {
  command: "validate";
  file?: string;
  all: boolean;
}

export interface CompileArgs {
  command: "compile";
  selector: string;
  sourcePackage?: string;
  targetPackage?: string;
}

export interface InitArgs {
  command: "init";
  packageFqn: string;
  srcDir?: string;
  noInstall: boolean;
}

export type HostCommand =
  | { command: "help"; topic?: HelpTopic }
  | ValidateArgs
  | CompileArgs
  | InitArgs
  | { command: "usage"; message: string; topic?: HelpTopic };

export function parseArgs(argv: readonly string[]): HostCommand {
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

function parseValidate(args: readonly string[]): HostCommand {
  if (args.includes("--help")) {
    return { command: "help", topic: "validate" };
  }
  let file: string | undefined;
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

function parseCompile(args: readonly string[]): HostCommand {
  if (args.includes("--help")) {
    return { command: "help", topic: "compile" };
  }
  let selector: string | undefined;
  let sourcePackage: string | undefined;
  let targetPackage: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--source-package" || arg === "--target-package") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { command: "usage", message: `${arg} requires a package FQN.`, topic: "compile" };
      }
      if (arg === "--source-package") {
        sourcePackage = value;
      } else {
        targetPackage = value;
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
  const parsed: CompileArgs = { command: "compile", selector };
  if (sourcePackage !== undefined) {
    parsed.sourcePackage = sourcePackage;
  }
  if (targetPackage !== undefined) {
    parsed.targetPackage = targetPackage;
  }
  return parsed;
}

function parseInit(args: readonly string[]): HostCommand {
  if (args.includes("--help")) {
    return { command: "help", topic: "init" };
  }
  let packageFqn: string | undefined;
  let srcDir: string | undefined;
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
  const parsed: InitArgs = { command: "init", packageFqn, noInstall };
  if (srcDir !== undefined) {
    parsed.srcDir = srcDir;
  }
  return parsed;
}

/** A final .* or .** segment denotes a package. An exact type FQN does not. */
export function sourcePackageFromSelector(selector: string): string | undefined {
  const parts = selector.split(".");
  const last = parts[parts.length - 1];
  if ((last !== "*" && last !== "**") || parts.length < 2) {
    return undefined;
  }
  return parts.slice(0, -1).join(".");
}
