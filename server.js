import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4173);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const requestedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(ROOT, requestedPath === "/" ? "index.html" : requestedPath);
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
    if (!filePath.startsWith(ROOT)) throw new Error("Invalid path");

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`DICE HAND is running at http://localhost:${PORT}`);
});
