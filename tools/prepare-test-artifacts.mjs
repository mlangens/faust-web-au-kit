import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function runNodeScript(args) {
  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit"
  });
}

runNodeScript(["./tools/export-targets.mjs"]);
runNodeScript(["./tools/export-targets.mjs", "--project", "projects/pulse_pad.json"]);
