#!/usr/bin/env node
import { execute } from "./execute.js";
const result = execute(process.argv.slice(2), process.cwd());
const write = result.code === 0 ? console.log : console.error;
for (const line of result.lines) {
    write(line);
}
process.exit(result.code);
//# sourceMappingURL=cli.js.map