import { loadSuiteRuntime } from "./lib/project-tools.mjs";

const suiteRuntime = loadSuiteRuntime();
const format = String(suiteRuntime.args.format ?? "tsv").toLowerCase();

const payload = {
  id: suiteRuntime.suiteId,
  name: suiteRuntime.suiteName,
  catalogFile: suiteRuntime.suiteFile,
  workspaceVersion: suiteRuntime.workspace.version,
  apps: suiteRuntime.apps.map((runtime) => ({
    key: runtime.appKey,
    name: runtime.project.productName,
    artifactStem: runtime.project.artifactStem,
    buildDir: runtime.buildDir,
    distDir: runtime.distDir,
    generatedDir: runtime.outputDir,
    version: runtime.project.version,
    bundleId: runtime.project.bundleId,
    category: runtime.suiteProduct?.category ?? null,
    variant: runtime.suiteProduct?.variant ?? null,
    implementationOrder: runtime.implementationOrder
  }))
};

if (format === "json") {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

if (format === "name") {
  process.stdout.write(`${payload.name}\n`);
  process.exit(0);
}

if (format === "summary") {
  process.stdout.write([payload.id, payload.name, payload.workspaceVersion].join("\t"));
  process.stdout.write("\n");
  process.exit(0);
}

if (format === "keys") {
  for (const app of payload.apps) {
    process.stdout.write(`${app.key}\n`);
  }
  process.exit(0);
}

if (format !== "tsv") {
  throw new Error(`Unsupported format "${format}". Use json, name, summary, keys, or tsv.`);
}

for (const app of payload.apps) {
  process.stdout.write(
    [
      app.key,
      app.name,
      app.artifactStem,
      app.buildDir,
      app.distDir,
      app.generatedDir,
      app.version,
      app.bundleId,
      app.category ?? "",
      app.variant ?? "",
      String(app.implementationOrder ?? "")
    ].join("\t")
  );
  process.stdout.write("\n");
}
