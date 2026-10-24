export const HELP = `Usage: machineblocks validate [file] [--all]
       machineblocks compile <source-selector> [--source-package <FQN>] [--target-package <FQN>]
       machineblocks init <package-fqn> [--src dir] [--install]
       machineblocks --help

validate
  Same project check as blockml validate. Does not write SCAD.

compile
  Renders selected Block and Set types to SCAD with machineblocks-v3-scad.
  The selector is a BlockML type selector: an exact FQN, pkg.*, or pkg.**.
  Output is written under the configured srcDir (default blocks).
  --target-package names a package root, not a directory.
  A package selector supplies the source root when --source-package is omitted.
  An exact block FQN does not.

init
  Scaffolds a BlockML project and records the MachineBlocks profile.
  Adds devDependency @machineblocks/cli and library com.machineblocks.bml.Library.
  Does not run npm install unless --install is passed.

Exit 0 success, 1 diagnostics, 2 usage or config.
Search, inspect, graph, and new stay on blockml.
`;

export const COMPILE_HELP = `Usage: machineblocks compile <source-selector> [--source-package <FQN>] [--target-package <FQN>]
       machineblocks compile --help

<source-selector>  Block FQN, or a package selector ending in .* or .**
--source-package   Source package root for an explicit mapping
--target-package   Target package root. Not a directory and not one output file.
`;

export const INIT_HELP = `Usage: machineblocks init <package-fqn> [--src dir] [--install]
       machineblocks init --help

<package-fqn>  Dotted package identifier. A bml segment is recommended.
--src          Source directory. Default blocks.
--install      Run npm install after the MachineBlocks profile is recorded.
`;
