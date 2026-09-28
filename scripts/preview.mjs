import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "public");
const PORT = Number(process.env.PORT || 1600);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function safePath(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname === "/onboarding" ? "/onboarding.html" : pathname;
  const clean = normalize(requested).replace(/^[/\\]+/, "");
  if (clean.startsWith("..")) return null;
  return join(ROOT, clean);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/" && !url.searchParams.has("preview")) {
      res.writeHead(302, { location: "/?preview=1" });
      res.end();
      return;
    }

    const path = safePath(url.pathname);
    if (!path) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const info = await stat(path);
    if (!info.isFile()) throw new Error("not file");
    const body = await readFile(path);
    res.writeHead(200, {
      "content-type": MIME[extname(path)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Denglema preview: http://${HOST}:${PORT}/?preview=1`);
  console.log("No Feishu login or backend service is required.");
});
