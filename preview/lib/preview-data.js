// @ts-check

/**
 * @typedef {import("../../types/framework").BenchmarkReport} BenchmarkReport
 * @typedef {import("../../types/framework").GeneratedUiSchema} GeneratedUiSchema
 * @typedef {import("../../types/framework").GeneratedWorkspaceManifest} GeneratedWorkspaceManifest
 */

/**
 * @param {{ search?: string } | null | undefined} location
 * @returns {string | null}
 */
function activeAppKeyFromLocation(location = globalThis.window?.location) {
  const params = new URLSearchParams(location?.search ?? "");
  const appKey = params.get("app");
  if (appKey) {
    return appKey;
  }

  const legacyProjectKey = params.get("project");
  return legacyProjectKey ? legacyProjectKey.replaceAll("_", "-") : null;
}

/**
 * @param {typeof fetch} [fetchImpl=globalThis.fetch]
 * @returns {Promise<GeneratedWorkspaceManifest | null>}
 */
async function loadWorkspaceManifest(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl("/generated/workspace_manifest.json");
  if (!response.ok) {
    return null;
  }
  return /** @type {Promise<GeneratedWorkspaceManifest>} */ (response.json());
}

/**
 * @param {GeneratedWorkspaceManifest | null | undefined} workspace
 * @param {string} appKey
 * @returns {string}
 */
function schemaPathForApp(workspace, appKey) {
  const workspaceEntry = workspace?.apps?.find((app) => app.key === appKey);
  return workspaceEntry?.schemaPath || `/generated/apps/${appKey}/ui_schema.json`;
}

/**
 * @param {GeneratedWorkspaceManifest | null | undefined} workspace
 * @param {{ search?: string } | null | undefined} [location=globalThis.window?.location]
 * @param {typeof fetch} [fetchImpl=globalThis.fetch]
 * @returns {Promise<GeneratedUiSchema>}
 */
async function loadPreviewSchema(workspace, location = globalThis.window?.location, fetchImpl = globalThis.fetch) {
  const appKey = activeAppKeyFromLocation(location) ?? workspace?.defaultApp;
  if (!appKey) {
    throw new Error("No workspace default app is available for preview.");
  }

  const schemaResponse = await fetchImpl(schemaPathForApp(workspace, appKey));
  if (!schemaResponse.ok) {
    throw new Error(`Preview schema for "${appKey}" is unavailable (HTTP ${schemaResponse.status}).`);
  }

  return /** @type {Promise<GeneratedUiSchema>} */ (schemaResponse.json());
}

/**
 * @param {GeneratedUiSchema | null | undefined} schema
 * @param {GeneratedWorkspaceManifest | null | undefined} workspace
 * @returns {string}
 */
function benchmarkPathForSchema(schema, workspace) {
  if (schema?.benchmarkPath) {
    return schema.benchmarkPath;
  }
  if (workspace?.defaultApp) {
    return `/generated/apps/${workspace.defaultApp}/benchmark-results.json`;
  }
  return "/generated/apps/limiter-lab/benchmark-results.json";
}

/**
 * @param {GeneratedUiSchema | null | undefined} schema
 * @param {GeneratedWorkspaceManifest | null | undefined} workspace
 * @param {typeof fetch} [fetchImpl=globalThis.fetch]
 * @returns {Promise<BenchmarkReport | null>}
 */
async function loadBenchmarkReport(schema, workspace, fetchImpl = globalThis.fetch) {
  const benchmarkResponse = await fetchImpl(benchmarkPathForSchema(schema, workspace));
  return benchmarkResponse.ok ? /** @type {Promise<BenchmarkReport>} */ (benchmarkResponse.json()) : null;
}

export { activeAppKeyFromLocation, benchmarkPathForSchema, loadBenchmarkReport, loadPreviewSchema, loadWorkspaceManifest };
