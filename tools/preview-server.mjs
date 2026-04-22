// @ts-check

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

/** @type {ReadonlyMap<string, string>} */
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

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
  const filePath = resolveFile(parsedUrl.pathname || "/");

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
