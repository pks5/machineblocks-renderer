# BlockML Project Instructions

This repository contains a BlockML model. BML is the editable source of truth. The BOM is the canonical parsed representation.

The effective model includes local BML, workspace packages, and BlockML libraries from npm. Identify Blocks by FQN. Look up semantics in the model. Do not invent types, syntax, or capabilities.

A BlockML repository may contain anything besides BML — TypeScript, Java, OpenSCAD, tests, docs, a song, or any other files. There is no default companion language. Those files are not the model. Change BML first, then update companions to match the new BML: `blockml compile` when a target exists, or edit them directly (including by an LLM). Never invent model semantics only in companions, and never update companions first and retrofit BML.

BML libraries are packaged as npm packages by default. The BlockML toolchain is Node/npm. That is the *host* for models and tools — not the repository's product. Output, when a repo has one, is a companion artifact built from BML. It might be a Spring application, OpenSCAD, an npm package, or anything else; npm output is common, not required. An npm tree in the repo may be toolchain, BML libraries, product output, or several of these at once. Do not assume `package.json` is the product.

## Tools

Use the project-local CLI:

```bash
npx blockml <command>
```

Do not install or upgrade `@blockml/cli` unless asked. If the CLI is missing, run `npm ci` first. If `@blockml/cli` is not a project dependency, report that and stop.

Run `npx blockml --help` for commands, workflow, and flags. Run `npx blockml <command> --help` before first use of a command (search, scan, inspect, graph, new, validate, compile, transform).

Search answers where something is. Scan answers which packages or types match selectors. Inspect answers: give me this Block already resolved. Graph answers how it connects.

Generic grep, find, and file reads remain allowed. They are not the first way into the model.

## Scan

Use `blockml scan` to list every package or type in the corpus that matches Core selectors. It is set membership, not full-text search: complete unranked identifiers, no score, no `--limit`.

```bash
npx blockml scan --help
npx blockml scan type org.blockml.bml.core.Block
npx blockml scan type 'org.blockml.bml.core.**'
npx blockml scan package 'org.blockml.bml.*' --json
```

- `scan type` — TypeSelector tokens → type FQNs. `pkg.*` is types directly in that package. `pkg.**` is types in that package and all descendants. `pkg.**.Name` is `Name` only in child packages (not `pkg.Name`).
- `scan package` — PackageSelector tokens → package identifiers. `pkg.*` / `pkg.**` do not include `pkg` itself.
- Multiple selectors are OR. An exact PackageIdentifier or TypeIdentifier is the most specific selector.
- Quote tokens that contain `*` or `**` so the shell does not expand them.
- Corpus is the same as `validate --all` (live TypeRegistry). Invalid selector or missing `package|type` / selectors → exit 2.
- Then `inspect` a found FQN. Use `search` when you have words, not a selector.

## Workflow

```text
task → search or scan → FQNs → inspect (graph if structure) → targeted BML read → smallest BML edit → validate
     → update companions to match (compile and/or edit)
```

If syntax is unclear: inspect the type Block, then similar existing BML, then change. Do not guess.

Treat in-BML documentation as searchable knowledge. After dependency changes, rebuild `search index` if results look incomplete.

## Rules

- Change BML first. Then update companions from that BML (compile or direct edit). Companions are never SSOT.
- Prefer existing Blocks over new duplicates. Keep the change scoped.
- Do not edit `node_modules`.
- Do not commit, push, reset, or rewrite user git state unless asked.
- Report gaps instead of inventing unsupported solutions.
