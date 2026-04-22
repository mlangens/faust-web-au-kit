import path from "node:path";

import { runNodeTool } from "./lib/export-process-tools.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

runNodeTool(root, "tools/export-workspace.mjs", ["--export-profile", "preview"], {
  cwd: root,
  description: "Prepare exported test artifacts",
  stdio: "inherit"
});
