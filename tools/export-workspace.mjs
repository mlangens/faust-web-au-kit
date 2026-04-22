import { execFileSync } from "node:child_process";
import path from "node:path";

import { loadWorkspaceRuntime } from "./lib/project-tools.mjs";

const forwardedArgs = process.argv.slice(2).filter((token, index, argv) => token !== "--app" && argv[index - 1] !== "--app");
const workspaceRuntime = loadWorkspaceRuntime(forwardedArgs);

for (const appEntry of workspaceRuntime.appEntries) {
  execFileSync(process.execPath, [
    path.join(workspaceRuntime.root, "tools", "export-targets.mjs"),
    ...forwardedArgs,
    "--app",
    appEntry.key
  ], {
    cwd: workspaceRuntime.root,
    stdio: "inherit"
  });
}
