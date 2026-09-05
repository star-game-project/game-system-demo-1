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

const server = createServer(async (request, response) => {
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
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DICE HAND is running at http://localhost:${PORT}`);
  console.log("Ctrl+C で終了します。");
});

let shuttingDown = false;

function shutdown(signal) {
  // 2度目の Ctrl+C は即座に終了する。
  if (shuttingDown) process.exit(0);
  shuttingDown = true;

  console.log(`\n${signal} を受信しました。サーバーを終了します…`);
  server.close(() => process.exit(0));

  // keep-alive 接続が残っていると close() が完了しないため、明示的に切断する。
  server.closeAllConnections?.();

  // 何らかの理由で閉じきれない場合の保険。
  setTimeout(() => process.exit(1), 3000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}
