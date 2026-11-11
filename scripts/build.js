"use strict";

/**
 * Production checks and static export.
 *
 * npm run build
 *   - verifies required files, local links, JSON-LD, inline script/style rules
 *   - syntax-checks the JavaScript
 *   - writes a deployable static copy to dist/ for cPanel, Netlify or similar
 *
 * Vercel serves the repository root and deploys api/ as serverless functions,
 * so it does not need the dist/ folder.
 */

var fs = require("node:fs");
var path = require("node:path");
var spawnSync = require("node:child_process").spawnSync;

var ROOT = path.resolve(__dirname, "..");
var DIST = path.join(ROOT, "dist");
var errors = [];
var warnings = [];

var HTML_FILES = ["index.html", "privacy.html", "terms.html", "404.html"];

var REQUIRED = [
  "index.html",
  "privacy.html",
  "terms.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon-32.png",
  "favicon-512.png",
  "apple-touch-icon.png",
  "assets/css/styles.css",
  "assets/js/main.js",
  "assets/fonts/manrope-latin.woff2",
  "assets/fonts/fraunces-latin.woff2",
  "assets/img/hero-poster.webp",
  "assets/img/og-image.jpg",
  "images/hero.jpg",
  "images/logo.png",
  "api/enquiry.js",
  "api/places.js",
  "lib/enquiry.js",
  "lib/rate-limit.js",
  "package.json",
  "vercel.json",
  ".env.example",
  "README.md"
];

var COPY_FILES = [
  "index.html",
  "privacy.html",
  "terms.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon-32.png",
  "favicon-512.png",
  "apple-touch-icon.png"
];

var COPY_DIRS = ["assets", "images"];

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function exists(file) {
  return fs.existsSync(file);
}

function checkRequired() {
  REQUIRED.forEach(function (file) {
    if (!exists(path.join(ROOT, file))) {
      errors.push("Missing required file: " + file);
    }
  });
}

function cleanUrlToFile(ref) {
  var withoutHash = ref.split("#")[0].split("?")[0];
  if (!withoutHash) return null;
  var decoded;
  try {
    decoded = decodeURIComponent(withoutHash);
  } catch (error) {
    return null;
  }
  var candidate;
  if (decoded.charAt(0) === "/") {
    candidate = path.join(ROOT, decoded);
  } else {
    candidate = path.resolve(ROOT, decoded);
  }
  if (exists(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (!path.extname(candidate)) {
    var html = candidate + ".html";
    if (exists(html) && fs.statSync(html).isFile()) return html;
    var index = path.join(candidate, "index.html");
    if (exists(index) && fs.statSync(index).isFile()) return index;
  }
  return candidate;
}

function isExternal(ref) {
  return (
    !ref ||
    ref.charAt(0) === "#" ||
    ref.indexOf("http://") === 0 ||
    ref.indexOf("https://") === 0 ||
    ref.indexOf("//") === 0 ||
    ref.indexOf("mailto:") === 0 ||
    ref.indexOf("tel:") === 0 ||
    ref.indexOf("data:") === 0 ||
    ref.indexOf("javascript:") === 0
  );
}

function checkLinks() {
  HTML_FILES.forEach(function (name) {
    var file = path.join(ROOT, name);
    if (!exists(file)) return;
    var html = fs.readFileSync(file, "utf8");

    var refs = [];
    var hrefRegex = /(?:href|src)="([^"]+)"/g;
    var match;
    while ((match = hrefRegex.exec(html))) refs.push(match[1]);

    var srcsetRegex = /srcset="([^"]+)"/g;
    while ((match = srcsetRegex.exec(html))) {
      match[1].split(",").forEach(function (entry) {
        var url = entry.trim().split(/\s+/)[0];
        if (url) refs.push(url);
      });
    }

    refs.forEach(function (ref) {
      if (isExternal(ref)) return;
      var resolved = cleanUrlToFile(ref);
      if (!resolved) return;
      if (!exists(resolved)) {
        if (ref.indexOf("urbania-hero.mp4") !== -1) {
          warnings.push(
            name +
              " references " +
              ref +
              ", which is not present. The hero poster will be used until the video is added."
          );
          return;
        }
        errors.push(name + " has a broken local reference: " + ref);
      }
    });

    var inlineStyle = /\sstyle\s*=/i.exec(html);
    if (inlineStyle) errors.push(name + " contains an inline style attribute.");

    var inlineHandler = /\son[a-z]{3,}\s*=/i.exec(html);
    if (inlineHandler) errors.push(name + " contains an inline event handler: " + inlineHandler[0].trim());

    var inlineScript = /<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/gi.exec(html);
    if (inlineScript) errors.push(name + " contains an executable inline script.");
  });
}

function checkJsonLd() {
  HTML_FILES.forEach(function (name) {
    var file = path.join(ROOT, name);
    if (!exists(file)) return;
    var html = fs.readFileSync(file, "utf8");
    var regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    var match;
    var count = 0;
    while ((match = regex.exec(html))) {
      count += 1;
      try {
        JSON.parse(match[1]);
      } catch (error) {
        errors.push(name + " has invalid JSON-LD in block " + count + ": " + error.message);
      }
    }
  });
}

function checkSyntax() {
  var files = [
    "assets/js/main.js",
    "api/enquiry.js",
    "api/places.js",
    "lib/enquiry.js",
    "lib/rate-limit.js",
    "scripts/dev-server.js",
    "scripts/build.js"
  ];
  files.forEach(function (file) {
    var full = path.join(ROOT, file);
    if (!exists(full)) return;
    var result = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
    if (result.status !== 0) {
      errors.push("Syntax error in " + file + ": " + (result.stderr || "").trim());
    }
  });
}

function checkContentRules() {
  var index = path.join(ROOT, "index.html");
  if (!exists(index)) return;
  var html = fs.readFileSync(index, "utf8");
  var requiredIds = [
    "enquiryForm",
    "tripType",
    "formStartedAt",
    "formStatus",
    "formErrorSummary",
    "formErrorList",
    "placesNotice",
    "submitBtn",
    "consent",
    "website",
    "quickForm",
    "booking",
    "hero-title"
  ];
  requiredIds.forEach(function (id) {
    if (html.indexOf('id="' + id + '"') === -1) {
      errors.push("index.html is missing required element id: " + id);
    }
  });

  if (html.indexOf("assets/urbania-hero.mp4") === -1) {
    errors.push("index.html does not reference the configured hero video path.");
  }
  if (html.indexOf("919632345415") === -1) {
    errors.push("index.html does not contain the WhatsApp number.");
  }
  if (html.indexOf("skycabsbangalore@gmail.com") === -1) {
    errors.push("index.html does not contain the contact email.");
  }
  if (html.indexOf("www.urbaniacabsbanglore.com") === -1) {
    errors.push("index.html does not contain the canonical domain.");
  }

  var suspicious = [
    /₹\s*\d/,
    /\bper km\b/i,
    /\bstarting (at|from)\b/i,
    /\b\d+(\.\d+)?\s*\/\s*km\b/i
  ];
  suspicious.forEach(function (pattern) {
    if (pattern.test(html)) {
      warnings.push("index.html contains price-like text that should be reviewed: " + pattern);
    }
  });
}

function buildDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  COPY_FILES.forEach(function (file) {
    var from = path.join(ROOT, file);
    if (!exists(from)) return;
    fs.copyFileSync(from, path.join(DIST, file));
  });

  COPY_DIRS.forEach(function (dir) {
    var from = path.join(ROOT, dir);
    if (!exists(from)) return;
    fs.cpSync(from, path.join(DIST, dir), { recursive: true });
  });

  var note = [
    "Urbania Cabs Bangalore - static export",
    "",
    "Upload this folder to a static host such as Netlify, cPanel or GitHub Pages.",
    "The enquiry form's Telegram notification and Google Places lookup need the",
    "serverless functions in api/ and lib/ plus the environment variables listed",
    "in .env.example. Deploy the repository root to Vercel for the full setup.",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(DIST, "DEPLOY.txt"), note);
}

function main() {
  checkRequired();
  checkLinks();
  checkJsonLd();
  checkSyntax();
  checkContentRules();

  if (warnings.length) {
    console.log("\nWarnings:");
    warnings.forEach(function (warning) {
      console.log("  - " + warning);
    });
  }

  if (errors.length) {
    console.error("\nBuild failed:");
    errors.forEach(function (error) {
      console.error("  - " + error);
    });
    process.exit(1);
  }

  buildDist();

  console.log("\nBuild passed.");
  console.log("Static export written to dist/.");
  console.log("Vercel deploys the repository root plus api/ serverless functions.");
}

main();
