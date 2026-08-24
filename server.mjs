// server.mjs — local/preview dev server ONLY.
//
// Vercel does NOT use this in production: it serves `public/` statically and
// `api/*.js` as serverless functions on its own. This zero-dependency server
// reproduces that behaviour so local preview matches production.
//
// DELIBERATE DIFFERENCE FROM LEGAL-LEAF: this file READS vercel.json rather
// than keeping its own hardcoded copy of the routes. Legal-Leaf's CLAUDE.md
// documents a real outage caused by those two lists drifting apart — a page
// was renamed, vercel.json was updated, server.mjs was not, and production
// worked while the preview 404'd. Parsing the real config makes that class of
// bug impossible. If you add a route, add it to vercel.json ONLY.
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { join, extname, normalize } from "node:path"

const ROOT = process.cwd()
const PUBLIC = join(ROOT, "public")
const PORT = Number(process.env.PORT) || 3000

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
}

// ---- routing, read from the single source of truth --------------------------
// Rewrites are compiled to regexes rather than looked up by string, because
// a source may carry a :param segment (Vercel's own syntax) — "/store/:key"
// has to match "/store/nicokick". Still parsing the real vercel.json, not
// keeping a second list: what is compiled here is whatever that file says.
const REWRITES = []
const REDIRECTS = new Map()
function compileSource(src) {
  const body = src.split("/").map(seg =>
    seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("/")
  return new RegExp("^" + body + "/?$")
}
try {
  const cfg = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"))
  for (const r of cfg.rewrites || [])
    REWRITES.push({ re: compileSource(r.source), destination: r.destination })
  for (const r of cfg.redirects || []) {
    // vercel.json allows a capture group like "/(index.html)"; local preview
    // only needs the literal form, so strip the parens.
    REDIRECTS.set(r.source.replace(/[()]/g, ""), r.destination)
  }
} catch (err) {
  console.log("[dev] could not read vercel.json:", err.message)
}

// serverless functions — mirrors Vercel mapping api/foo.js -> /api/foo
const API = {
  "/api/products": "./api/products.js",
  "/api/subscribe": "./api/subscribe.js",
  "/api/track": "./api/track.js",
}
// NOTE: modules are cached. Restart the server after editing anything in api/,
// or you will test stale code. (Legal-Leaf lost an afternoon to this once.)
const apiCache = new Map()
async function loadApi(path) {
  if (!apiCache.has(path)) apiCache.set(path, await import(API[path]))
  return apiCache.get(path)
}

// Give Node's ServerResponse the small Vercel helper surface the handlers use.
function enhanceRes(res) {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify(obj))
    return res
  }
  res.send = (data) => { res.end(data); return res }
  return res
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return undefined
  const raw = Buffer.concat(chunks).toString("utf8")
  try { return JSON.parse(raw) } catch { return raw }
}

async function serveStatic(res, urlPath) {
  // Normalise + prevent path traversal, then resolve clean URLs to .html.
  let rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "")
  if (rel === "/" || rel === "" || rel === "\\") rel = "/index.html"
  const file = join(PUBLIC, rel)
  if (!file.startsWith(PUBLIC)) {
    res.statusCode = 403
    return res.end("Forbidden")
  }
  const tryFiles = extname(file) ? [file] : [file + ".html", join(file, "index.html")]
  for (const candidate of tryFiles) {
    try {
      const s = await stat(candidate)
      if (!s.isFile()) continue
      const buf = await readFile(candidate)
      res.setHeader("Content-Type", MIME[extname(candidate)] || "application/octet-stream")
      res.setHeader("X-Content-Type-Options", "nosniff")
      res.statusCode = 200
      return res.end(buf)
    } catch { /* try next candidate */ }
  }
  res.statusCode = 404
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.end("<!doctype html><meta charset=utf-8><title>404</title><h1>404 — Not Found</h1>")
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
    let path = url.pathname

    // 1) API functions
    if (API[path]) {
      req.query = Object.fromEntries(url.searchParams.entries())
      if (req.method === "POST") req.body = await readBody(req)
      enhanceRes(res)
      const mod = await loadApi(path)
      await mod.default(req, res)
      if (!res.writableEnded) res.end()
      return
    }
    if (path.startsWith("/api/")) {
      res.statusCode = 404
      res.setHeader("Content-Type", "application/json")
      return res.end(JSON.stringify({ error: "Not found" }))
    }

    // 2) redirects
    if (REDIRECTS.has(path)) {
      res.statusCode = 308
      res.setHeader("Location", REDIRECTS.get(path))
      return res.end()
    }

    // 3) rewrites (clean URL -> file)
    const hit = REWRITES.find(r => r.re.test(path))
    if (hit) path = hit.destination

    // 4) static
    await serveStatic(res, path)
  } catch (err) {
    console.log("[dev] server error:", err && err.message ? err.message : err)
    if (!res.writableEnded) {
      res.statusCode = 500
      res.end("Server error")
    }
  }
})

server.listen(PORT, () => {
  console.log(`[dev] Nicotia Market dev server -> http://localhost:${PORT}`)
  console.log(`[dev] routes from vercel.json: ${REWRITES.length} rewrites, ${REDIRECTS.size} redirects`)
})
