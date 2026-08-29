import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

await cp(join(root, "index.html"), join(client, "index.html"));
await cp(join(root, "src"), join(client, "src"), { recursive: true });
await cp(join(root, "public"), client, { recursive: true });
await cp(join(root, "worker", "index.js"), join(server, "index.js"));

console.log("Sites build completed: dist/client + dist/server");
