import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = process.cwd();
// 静的ホスティング（GitHub Pages など）には worker がいないため、
// index.html の __SITE_ORIGIN__ をビルド時に埋める。未指定なら worker が実行時に置換する。
const siteOrigin = process.env.SITE_ORIGIN?.replace(/\/+$/, "");
// OS が作る不可視ファイルは配信物に含めない。
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);
const copyOptions = {
  recursive: true,
  filter: (source) => !IGNORED_FILES.has(basename(source)),
};

const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

const indexHtml = await readFile(join(root, "index.html"), "utf8");
await writeFile(
  join(client, "index.html"),
  siteOrigin ? indexHtml.replaceAll("__SITE_ORIGIN__", siteOrigin) : indexHtml,
);
await cp(join(root, "src"), join(client, "src"), copyOptions);
await cp(join(root, "docs"), join(client, "docs"), copyOptions);
await cp(join(root, "public"), client, copyOptions);
await cp(join(root, "worker", "index.js"), join(server, "index.js"));

console.log(
  `Sites build completed: dist/client + dist/server${siteOrigin ? ` (origin: ${siteOrigin})` : ""}`,
);
