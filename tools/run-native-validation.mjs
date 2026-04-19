import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

execFileSync(path.join(root, "scripts", "validate-au.sh"), process.argv.slice(2), {
  cwd: root,
  stdio: "inherit"
});
