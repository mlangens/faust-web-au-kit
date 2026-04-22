import { runNodeTool, stripFlagWithValue } from "./lib/export-process-tools.mjs";
import { loadWorkspaceRuntime } from "./lib/project-tools.mjs";

const forwardedArgs = stripFlagWithValue(process.argv.slice(2), "--app");
const workspaceRuntime = loadWorkspaceRuntime(forwardedArgs);

for (const appEntry of workspaceRuntime.appEntries) {
  runNodeTool(workspaceRuntime.root, "tools/export-targets.mjs", [
    ...forwardedArgs,
    "--app",
    appEntry.key
  ], {
    cwd: workspaceRuntime.root,
    description: `Export ${appEntry.key}`,
    stdio: "inherit"
  });
}
