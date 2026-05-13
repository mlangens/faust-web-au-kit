// @ts-check

import http from "node:http";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const maxRequestBytes = 64 * 1024;

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function writeScratchAssemblyRequest(payload) {
  const requestRoot = path.join(root, "generated", "workbench-requests");
  fs.mkdirSync(requestRoot, { recursive: true });
  const requestDirectory = fs.mkdtempSync(path.join(requestRoot, "assembly-"));
  const requestPath = path.join(requestDirectory, "scratch-assembly.json");
  fs.writeFileSync(requestPath, `${JSON.stringify(payload, null, 2)}\n`);
  return path.relative(root, requestPath);
}

/** @type {ReadonlyMap<string, string>} */
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {Record<string, unknown>} payload
 * @returns {void}
 */
function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @returns {void}
 */
function handleWorkbenchBuild(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "Use POST to build a workbench installer." });
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += String(chunk);
    if (body.length > maxRequestBytes) {
      request.destroy(new Error("Request body is too large."));
    }
  });
  request.on("error", (error) => {
    sendJson(response, 400, { ok: false, error: error.message });
  });
  request.on("end", () => {
    /** @type {Record<string, unknown>} */
    let payload = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      sendJson(response, 400, { ok: false, error: "Request body must be JSON." });
      return;
    }

    const recipe = typeof payload.recipe === "string" ? payload.recipe : "fet-76-rebuild";
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/u.test(recipe)) {
      sendJson(response, 400, { ok: false, error: "Recipe id must be a lowercase slug." });
      return;
    }

    const buildArgs = [path.join(root, "tools", "build-workbench-installer.mjs")];
    const scratchSlots = Array.isArray(payload.slots) ? payload.slots : [];
    let assemblyFile = "";
    if (scratchSlots.length) {
      try {
        assemblyFile = writeScratchAssemblyRequest({
          ...payload,
          recipe,
          targetRecipeId: typeof payload.targetRecipeId === "string" ? payload.targetRecipeId : recipe
        });
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Could not persist scratch assembly request."
        });
        return;
      }
      buildArgs.push("--assembly-file", assemblyFile);
    } else {
      buildArgs.push("--recipe", recipe);
    }

    execFile(
      process.execPath,
      buildArgs,
      {
        cwd: root,
        timeout: Number(process.env.FWAK_NATIVE_BUILD_TIMEOUT_MS || 30 * 60 * 1000),
        maxBuffer: 8 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          sendJson(response, 500, {
            ok: false,
            error: error.message,
            stdout,
            stderr
          });
          return;
        }

        const installerPath = String(stdout).match(/Built workbench installer at (.+)/u)?.[1]?.trim() || "";
        sendJson(response, 200, {
          ok: true,
          recipe,
          sourceMode: assemblyFile ? "scratch-assembly" : "recipe",
          assemblyFile,
          installerPath,
          stdout,
          stderr
        });
      }
    );
  });
}

/**
 * @param {string} requestPath
 * @returns {string | null}
 */
function resolveFile(requestPath) {
  const pathname = requestPath === "/" ? "/preview/index.html" : requestPath;
  const cleanPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(root, cleanPath);
  if (!absolutePath.startsWith(root)) {
    return null;
  }
  return absolutePath;
}

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @returns {void}
 */
function handleRequest(request, response) {
  const parsedUrl = new URL(request.url || "/", `http://${host}:${port}`);
  if (parsedUrl.pathname === "/api/workbench/build-installer") {
    handleWorkbenchBuild(request, response);
    return;
  }

  if (parsedUrl.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  const filePath = resolveFile(parsedUrl.pathname || "/");

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (parsedUrl.pathname.endsWith("/benchmark-results.json")) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ results: [] }));
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = mimeTypes.get(extension) || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(handleRequest);

server.listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}/`);
});
