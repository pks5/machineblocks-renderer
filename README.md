# MachineBlocks Renderer

Monorepo for rendering MachineBlocks BML to OpenSCAD, and for the engine and host CLI that make that path usable.

This workspace authors three publishable BML libraries:

| Package | Role |
|---|---|
| **[@blockml/block-render-engine](packages/block-render-engine)** | CompilerEngine so one render target can mix compile, template, and copy strategies. Formerly maker-engine. |
| **[@machineblocks/render-target](packages/machineblocks-render-target)** | BlockML compiler target. Registry name `machineblocks-v3-scad`. Renders `.bml` to MachineBlocks V3 `.scad` against [@machineblocks/core](https://www.npmjs.com/package/@machineblocks/core). |
| **[@machineblocks/cli](packages/machineblocks-cli)** | Thin host over the BlockML compiler. MachineBlocks defaults and the SCAD target, for users who want BML rendered to SCAD without the universal CLI. |

BML is the source of truth. The domain library and the SCAD runtime stay in `@machineblocks/core`. The BlockML toolchain stays in `@blockml/*`.

## Documentation (SSOT)

| | |
|---|---|
| **Library** | [`blocks/com/machineblocks/bml/renderer/workspace/Library.bml`](blocks/com/machineblocks/bml/renderer/workspace/Library.bml) |
| **FQN** | `com.machineblocks.bml.renderer.workspace.Library` |

Read the library `README`, then `documentation.Introduction`. Package contracts live under `packages/*/blocks/`. This workspace library links workspace to packages only.

## Repository layout

```text
blocks/                              Workspace BML library (monorepo hub)
packages/block-render-engine        @blockml/block-render-engine
packages/machineblocks-render-target @machineblocks/render-target
packages/machineblocks-cli           @machineblocks/cli
```

## CLI

Requires Node.js ≥ 20.

```bash
npm install
npx blockml validate
```

| Script | Command |
|--------|---------|
| `npm run validate` | `blockml validate` |
| `npm run search:index` | `blockml search index` |

`npx blockml` is the toolchain CLI used to check these libraries. The MachineBlocks user commands are `machineblocks init <package-fqn>` and `machineblocks compile <source-selector>`. Compile writes selected blocks to SCAD under the configured `srcDir`. How to stand up that command in another Node project is the next section.

Toolchain: `@blockml/cli` ^0.9.14, with the other `@blockml/*` 0.9 packages at 0.9.14. `@blockml/core` ^1.4.5. Domain library: `@machineblocks/core` ^3.0.0-A4.

## Use the renderer in another project

Node.js 20 or newer. One command turns a Node project into a BlockML project that can render `.bml` to MachineBlocks V3 `.scad` with `machineblocks`.

`@machineblocks/cli`, `@machineblocks/render-target`, `@blockml/block-render-engine`, `@blockml/cli`, `@blockml/core`, and `@machineblocks/core` all come from npm.

### 1. Initialize with `machineblocks init`

From the project directory. The package FQN is a dotted identifier, and the last segment is a package name (`Library` is reserved). Put a `bml` segment after the domain, as in `com.example.bml`. Compile replaces that segment with `scad` when it chooses the output package. A package FQN without that segment still initializes and prints a warning.

```bash
npx @machineblocks/cli init com.example.bml
```

`init` calls the universal BlockML scaffold, then records the MachineBlocks profile. It writes or merges `package.json`: a `blockml.library` pointer, dependency `@blockml/core`, and devDependencies `@blockml/cli` and `@machineblocks/cli`. It writes `blocks/<package path>/Library.bml` depending on `org.blockml.bml.Library` and `com.machineblocks.bml.Library`, plus `README.bml`, and, when missing, `AGENTS.md` and `CLAUDE.md`. Existing files stay in place. A second run adds only what is missing. `--src <dir>` changes the source directory (default `blocks`).

Leave off `--install` unless the dependencies should be installed in the same step. Without it, the next step is `npm install`.

| Package | Role |
|---|---|
| `@blockml/core` | Language library. Recorded as a dependency. |
| `@blockml/cli` | The `blockml` command. Recorded as a devDependency. |
| `@machineblocks/cli` | The `machineblocks` command. Recorded as a devDependency. It registers target `machineblocks-v3-scad`. |
| `@machineblocks/core` | Domain types and the SCAD runtime. Default `mbLibPath`. Installed with the CLI. |
| `@blockml/block-render-engine` | Engine the SCAD target runs on. Installed with the CLI. |
| `@machineblocks/render-target` | Compiler target `machineblocks-v3-scad`. Installed with the CLI. |

`@machineblocks/cli` depends on `@machineblocks/render-target` ^0.1.0, `@blockml/block-render-engine` ^0.1.0, and `@machineblocks/core` ^3.0.0-A4. npm installs those with the CLI.

On a project that `blockml init` already created, `npx machineblocks init com.example.bml` adds the devDependency and the library dependency and does not replace existing files. If `@machineblocks/cli` is already listed under `dependencies`, it stays there.

Check the project:

```bash
npx blockml validate
npx machineblocks --help
```

### 2. Use `machineblocks`

`validate` checks the project. `compile` renders selected Block and Set types to `.scad` under `srcDir` (default `blocks`), plus preset JSON and a sibling `.map` when the target attaches a source map.

```bash
npx machineblocks validate
npx machineblocks validate blocks/com/example/bml/bricks/MyBrick.bml
npx machineblocks validate --all

npx machineblocks compile com.example.bml.bricks.MyBrick
npx machineblocks compile com.example.bml.*
npx machineblocks compile com.example.bml.**
```

The selector is one BlockML type selector: an exact FQN, a package selector ending in `.*`, or a recursive selector ending in `.**`. With a `bml` segment, compile writes the `scad` counterpart in the same tree. `com.example.bml.bricks.MyBrick` becomes `blocks/com/example/scad/bricks/MyBrick.scad`.

A source package with no single `bml` segment needs an explicit package root. A package selector supplies the source root. An exact block FQN needs `--source-package` as well. `--target-package` is a package FQN.

```bash
npx machineblocks compile com.example.models.** \
  --target-package com.example.scad

npx machineblocks compile com.example.models.bricks.MyBrick \
  --source-package com.example.models \
  --target-package com.example.scad
```

Exit 0 is success, 1 is diagnostics, 2 is usage or configuration. The message names the code (`MB_SELECTOR_EMPTY` when the selector matches no Block or Set, `MB_EMPTY_BLOCK` when a composite has nothing to render, `MB_SOURCE_PACKAGE_REQUIRED` when `--target-package` has no source root).

Search, inspect, graph, and `new` stay on `blockml`. A new block can use a MachineBlocks base type:

```bash
npx blockml new com.example.bml.bricks.MyBrick \
  --baseType com.machineblocks.bml.core.CompositeBlock \
  --is "Example brick"
```

`blockml.config.json` in the project root is optional. `srcDir` defaults to `blocks` and is the compile output root. `mbLibPath` defaults to the installed `@machineblocks/core` package. `openscadPath` is unused by `compile`.

## License

[Apache-2.0](LICENSE)
