import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function resolveFile(requestPath) {
  const pathname = requestPath === "/" ? "/preview/index.html" : requestPath;
  const cleanPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(root, cleanPath);
  if (!absolutePath.startsWith(root)) {
    return null;
  }
  return absolutePath;
}

const server = http.createServer((request, response) => {
  const parsedUrl = url.parse(request.url || "/");
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
});

server.listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}/`);
});
