"use strict";

/**
 * Local development server for the static site plus the two Vercel functions.
 *
 * Run: npm run dev
 * Then open http://localhost:3000
 */

var http = require("node:http");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..");
var PORT = Number(process.env.PORT) || 3000;

function loadEnvFile() {
  var file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  var lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach(function (line) {
    var trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === "#") return;
    var index = trimmed.indexOf("=");
    if (index === -1) return;
    var key = trimmed.slice(0, index).trim();
    var value = trimmed.slice(index + 1).trim();
    if (
      (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
      (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

loadEnvFile();

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4"
};

function safePath(urlPath) {
  var decoded = decodeURIComponent(urlPath.split("?")[0]);
  var resolved = path.resolve(ROOT, "." + decoded);
  if (resolved !== ROOT && resolved.indexOf(ROOT + path.sep) !== 0) return null;
  return resolved;
}

function resolveStatic(urlPath) {
  var direct = safePath(urlPath);
  if (!direct) return null;
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

  if (!path.extname(direct)) {
    var html = direct + ".html";
    if (fs.existsSync(html) && fs.statSync(html).isFile()) return html;
    var index = path.join(direct, "index.html");
    if (fs.existsSync(index) && fs.statSync(index).isFile()) return index;
  }
  return null;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function attachVercelHelpers(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (body) {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
    return res;
  };
}

function serveFile(req, res, file) {
  var ext = path.extname(file).toLowerCase();
  var stat = fs.statSync(file);
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, pathname) {
  var modulePath =
    pathname === "/api/enquiry" ? path.join(ROOT, "api", "enquiry.js") : path.join(ROOT, "api", "places.js");
  if (!fs.existsSync(modulePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }

  var url = new URL(req.url, "http://localhost");
  req.query = {};
  url.searchParams.forEach(function (value, key) {
    req.query[key] = value;
  });

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    try {
      var raw = await readBody(req);
      req.body = raw;
      if ((req.headers["content-type"] || "").indexOf("application/json") !== -1) {
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch (error) {
          req.body = raw;
        }
      }
    } catch (error) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "payload_too_large" }));
      return;
    }
  }

  attachVercelHelpers(res);

  delete require.cache[require.resolve(modulePath)];
  var handler = require(modulePath);
  try {
    await handler(req, res);
  } catch (error) {
    console.error("API error:", error && error.stack ? error.stack : error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "internal_error" }));
    }
  }
}

var server = http.createServer(async function (req, res) {
  var url = new URL(req.url, "http://localhost");
  var pathname = url.pathname;

  if (pathname === "/api/enquiry" || pathname === "/api/places") {
    await handleApi(req, res, pathname);
    return;
  }

  if (pathname.indexOf("/api/") === 0) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }

  var file = resolveStatic(pathname);
  if (!file) {
    var notFound = path.join(ROOT, "404.html");
    if (fs.existsSync(notFound)) {
      res.statusCode = 404;
      serveFile(req, res, notFound);
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  serveFile(req, res, file);
});

server.on("error", function (error) {
  if (error.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use.");
    console.error("Stop the other process, or start on another port:");
    console.error("  PORT=3001 npm run dev");
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, function () {
  console.log("Urbania Cabs Bangalore local server");
  console.log("Site: http://localhost:" + PORT);
  console.log(
    "Telegram notifications: " +
      (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? "configured" : "not configured")
  );
  console.log(
    "Google Places: " +
      (process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY ? "configured" : "not configured")
  );
  console.log("Press Ctrl+C to stop.");
});
