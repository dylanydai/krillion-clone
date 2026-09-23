import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const destination = ".test-build";
mkdirSync(destination, { recursive: true });
writeFileSync(join(destination, "package.json"), '{"type":"module"}\n');
const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", "tsconfig.test.json"], { stdio: "inherit", timeout: 30000 });
if (compile.error) throw compile.error;
if (compile.status !== 0) throw new Error(`Test compilation failed with status ${compile.status}`);
const tests = readdirSync(join(destination, "tests")).filter((name) => name.endsWith(".test.js")).map((name) => join(destination, "tests", name));
const result = spawnSync(process.execPath, ["--test", "--test-timeout=30000", ...tests], { stdio: "inherit", timeout: 45000 });
if (result.error) throw result.error;
if (result.status === null) throw new Error(`Test process terminated by ${result.signal}`);
process.exitCode = result.status;
