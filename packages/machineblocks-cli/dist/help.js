/** Short syntax printed on usage errors. Not the --help page. */
export const USAGE = `Usage: machineblocks validate [--all] [<file>]
       machineblocks compile <source-selector> [--source-package <FQN>] [--target-package <FQN>]
       machineblocks init <package-fqn> [--src dir] [--no-install]
       machineblocks --help`;
export const VALIDATE_USAGE = `Usage: machineblocks validate [--all] [<file>]
       machineblocks validate --help`;
export const COMPILE_USAGE = `Usage: machineblocks compile <source-selector> [--source-package <FQN>] [--target-package <FQN>]
       machineblocks compile --help`;
export const INIT_USAGE = `Usage: machineblocks init <package-fqn> [--src dir] [--no-install]
       machineblocks init --help`;
/** Root help page. SSOT: com.machineblocks.bml.cli.documentation.Help */
export const HELP = `Usage: machineblocks <command> [options]
       machineblocks --help

machineblocks is the MachineBlocks host CLI.

It renders BML to OpenSCAD that matches the V3 SCAD library.
BML is the editable source of truth. Change BML first, then compile.
This host registers target machineblocks-v3-scad. It does not reimplement parse, validate, or emit.

Invocation: npx machineblocks <command>
Requires Node.js 20 or newer.
A new project starts with npx @machineblocks/cli init <package-fqn>.

Commands:
  validate    Parser + semantic check. Same project check as blockml validate.
              Does not write SCAD.
              machineblocks validate [--all] [<file>]
  compile     Render selected Block and Set types to SCAD under srcDir.
              machineblocks compile <source-selector> [--source-package <FQN>] [--target-package <FQN>]
  init        Scaffold a BlockML project and record the MachineBlocks profile.
              machineblocks init <package-fqn> [--src dir] [--no-install]

Search, scan, inspect, graph, new, agents-md, and transform stay on blockml.
Exit codes: 0 success, 1 diagnostic errors, 2 usage or configuration error.

Run \`machineblocks <command> --help\` for flags, defaults, output, and constraints.`;
/** Printed help. SSOT: com.machineblocks.bml.cli.documentation.ValidateCommand */
export const VALIDATE_HELP = `Usage: machineblocks validate [--all] [<file>]
       machineblocks validate --help

When: check the model after edits. Ordinary project work.

Default (no file, no --all): semantic-validate project sources only (this package srcDir plus local packages/*). npm libraries stay on the registry for resolve.
--all: semantic-validate every document in the registry, including npm. Do not use --all as the default after every edit.
Single file: parse + compileBmlToBom against the full project registry.
file and --all together exit 2.

Does not register machineblocks-v3-scad. No output files written.
This host does not accept --src, --libraries, or --verbose.

Flags:
  --all         entire reachable corpus, including npm

Exit 0 on success; 1 on diagnostic errors; 2 on config or usage errors.
After diagnostics: Validated N block(s). or Validated N block(s) with errors.

Related: compile. Search, scan, inspect, and graph stay on blockml.`;
/** Printed help. SSOT: com.machineblocks.bml.cli.documentation.CompileCommand */
export const COMPILE_HELP = `Usage: machineblocks compile <source-selector> [--source-package <FQN>] [--target-package <FQN>]
       machineblocks compile --help

When: render selected Block and Set types to OpenSCAD. Change BML first, then recompile.

Target is machineblocks-v3-scad. The command does not take a target name.
The selector is one BlockML type selector: an exact FQN, pkg.*, or pkg.**.
Quote tokens that contain * or ** so the shell does not expand them.
Resolution is scanTypes. This host does not define a second selector language.
Types whose baseType chain is neither com.machineblocks.bml.core.Block nor
com.machineblocks.bml.core.Set are skipped.

Output is written under the configured srcDir (default blocks). There is no --out and no --all.
A package selector (a final .* or .** segment) supplies the source root when
--target-package is set and --source-package is omitted. An exact block FQN does not.
Automatic mapping replaces the one bml segment with scad.
com.example.bml.bricks.MyBrick becomes blocks/com/example/scad/bricks/MyBrick.scad.
Explicit mapping swaps --source-package for --target-package and does not apply that replacement again.

Flags:
  --source-package <FQN>   source package root for an explicit mapping
  --target-package <FQN>   target package root. Not a directory and not one output file.

--source-package without --target-package exits 2 (MB_SOURCE_PACKAGE_ALONE).
--target-package without a derivable source root exits 2 (MB_SOURCE_PACKAGE_REQUIRED).
A missing selector, an unknown flag, or a selector scanTypes rejects exits 2.
If no Block or Set remains, exit 1 (MB_SELECTOR_EMPTY) and the message names the selector.

Exit 0 writes the SCAD or preset JSON files and a sibling .map when the target attached a source map.
The status line is Wrote N file(s) to <srcDir>. N counts every written file, including a sibling .map.
One failure writes nothing. Mapping failures, collisions, and illegal paths exit 1:
  MB_TARGET_COLLISION — two selected blocks share a target FQN or output path.
  MB_OUTPUT_ESCAPES_SRC — a resolved path is outside srcDir.
  MB_OUTPUT_OVERWRITES_BML — a resolved path is an existing .bml file.
  MB_TARGET_PACKAGE_UNDETERMINED — the source FQN has no bml segment.
  MB_TARGET_PACKAGE_AMBIGUOUS — the source FQN has more than one bml segment.
  MB_SOURCE_OUTSIDE_ROOT — a selected block is outside --source-package.
  MB_EMPTY_BLOCK — a composite has nothing to render.

blockml.config.json srcDir is the output root. mbLibPath defaults to the installed
@machineblocks/core package. openscadPath is unused by compile.
A missing mbLibPath and a missing @machineblocks/core install exit 2.

Related: validate. Search, inspect, graph, and new stay on blockml.`;
/** Printed help. SSOT: com.machineblocks.bml.cli.documentation.InitCommand */
export const INIT_HELP = `Usage: machineblocks init <package-fqn> [--src dir] [--no-install]
       machineblocks init --help

When: turn a directory into a MachineBlocks project. Scaffolds a BlockML project,
then records the MachineBlocks profile.

PACKAGE-FQN is a dotted package identifier (not …Library). A bml segment after
the domain is recommended. Compile maps a bml segment to scad.
A package FQN without a bml segment still exits 0 and warns.
Does not spawn blockml init. Calls initProject from @blockml/cli with noInstall
true, then records the profile before npm install.

Preflight runs before any write and checks conditions. --no-install does not skip it.
A project is BlockML when package.json has a blockml key. Then AGENTS.md
stays, and agents-md generate overwrites it after npm install.
Otherwise an existing AGENTS.md is renamed to AGENTS.md.pre-blockml.
Does not overwrite existing BML files or CLAUDE.md.

The profile adds @machineblocks/cli to devDependencies when that package is
absent from dependencies and devDependencies. The range is the caret range of
this host. An existing dependencies entry stays put.
The project Library.bml gains com.machineblocks.bml.Library.
CLAUDE.md (@AGENTS.md) is written when missing.

Runs npm install, then generates AGENTS.md, unless --no-install is passed.
--no-install skips npm install and AGENTS.md generation. It does not skip preflight.
AGENTS.md is overwritten when at least one section or rule is found.
When no AgentInstructions content is found, AGENTS.md is left unwritten.
The next-step line from the earlier initProject pass is dropped when install runs.
With --no-install and no AGENTS.md, that next step remains:
npm install && npx blockml agents-md generate.

Flags:
  --src dir       source directory (default blocks)
  --no-install    skip npm install and AGENTS.md generation

Exit codes match initProject: 0 success, 1 write, rename, or install failure,
2 usage, an invalid package FQN, or a failed preflight.

Related: validate, compile. agents-md and new stay on blockml.`;
export function helpFor(topic) {
    switch (topic) {
        case "validate":
            return VALIDATE_HELP;
        case "compile":
            return COMPILE_HELP;
        case "init":
            return INIT_HELP;
        default:
            return HELP;
    }
}
export function usageFor(topic) {
    switch (topic) {
        case "validate":
            return VALIDATE_USAGE;
        case "compile":
            return COMPILE_USAGE;
        case "init":
            return INIT_USAGE;
        default:
            return USAGE;
    }
}
//# sourceMappingURL=help.js.map