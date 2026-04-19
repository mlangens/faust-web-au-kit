import { execFileSync } from "node:child_process";
import path from "node:path";

import { loadWorkspaceRuntime } from "./lib/project-tools.mjs";

const workspaceRuntime = loadWorkspaceRuntime();

for (const appEntry of workspaceRuntime.appEntries) {
  execFileSync(process.execPath, [path.join(workspaceRuntime.root, "tools", "export-targets.mjs"), "--app", appEntry.key], {
    cwd: workspaceRuntime.root,
    stdio: "inherit"
  });
}
