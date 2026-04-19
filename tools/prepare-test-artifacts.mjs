import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

execFileSync(process.execPath, ["./tools/export-workspace.mjs"], {
  cwd: root,
  stdio: "inherit"
});
