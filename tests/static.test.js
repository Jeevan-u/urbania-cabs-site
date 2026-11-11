"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

test("the main page contains the required enquiry structure", function () {
  var html = read("index.html");
  [
    "enquiryForm",
    "quickForm",
    "tripType",
    "formStartedAt",
    "formStatus",
    "formErrorSummary",
    "formErrorList",
    "placesNotice",
    "submitBtn",
    "consent",
    "website",
    "booking",
    "hero-title"
  ].forEach(function (id) {
    assert.ok(html.indexOf('id="' + id + '"') !== -1, "missing id " + id);
  });

  ["outstation", "local", "airport", "corporate"].forEach(function (panel) {
    assert.ok(html.indexOf('data-panel="' + panel + '"') !== -1, "missing panel " + panel);
  });

  assert.ok(html.indexOf("data-hero-video") !== -1);
  assert.ok(html.indexOf("assets/urbania-hero.mp4") !== -1);
  assert.ok(html.indexOf("https://wa.me/919632345415") !== -1);
  assert.ok(html.indexOf("tel:+919632345415") !== -1);
  assert.ok(html.indexOf("skycabsbangalore@gmail.com") !== -1);
});

test("the main page has no inline styles or inline event handlers", function () {
  ["index.html", "privacy.html", "terms.html", "404.html"].forEach(function (file) {
    var html = read(file);
    assert.equal(/\sstyle\s*=/i.test(html), false, file + " has an inline style");
    assert.equal(/\son[a-z]{3,}\s*=/i.test(html), false, file + " has an inline handler");
  });
});

test("JSON-LD blocks parse", function () {
  var html = read("index.html");
  var regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  var match;
  var count = 0;
  while ((match = regex.exec(html))) {
    count += 1;
    assert.doesNotThrow(function () {
      JSON.parse(match[1]);
    }, "JSON-LD block " + count + " is invalid");
  }
  assert.ok(count >= 2);
});

test("SEO files point at the production domain", function () {
  var html = read("index.html");
  assert.ok(html.indexOf('rel="canonical" href="https://www.urbaniacabsbanglore.com/"') !== -1);
  assert.ok(html.indexOf('property="og:image" content="https://www.urbaniacabsbanglore.com/assets/img/og-image.jpg"') !== -1);

  var robots = read("robots.txt");
  assert.ok(robots.indexOf("Sitemap: https://www.urbaniacabsbanglore.com/sitemap.xml") !== -1);

  var sitemap = read("sitemap.xml");
  assert.ok(sitemap.indexOf("https://www.urbaniacabsbanglore.com/") !== -1);
  assert.ok(sitemap.indexOf("https://www.urbaniacabsbanglore.com/privacy") !== -1);
  assert.ok(sitemap.indexOf("https://www.urbaniacabsbanglore.com/terms") !== -1);
});

test("manifest and vercel configuration parse", function () {
  var manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "/");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

  var vercel = JSON.parse(read("vercel.json"));
  assert.equal(vercel.cleanUrls, true);
  var csp = vercel.headers[0].headers.find(function (header) {
    return header.key === "Content-Security-Policy";
  });
  assert.ok(csp, "CSP header is missing");
  assert.ok(csp.value.indexOf("default-src 'self'") !== -1);
  assert.ok(csp.value.indexOf("frame-ancestors 'none'") !== -1);
});

test("secrets are not present in client code", function () {
  var client = read("assets/js/main.js");
  assert.equal(client.indexOf("TELEGRAM_BOT_TOKEN"), -1);
  assert.equal(client.indexOf("TELEGRAM_CHAT_ID"), -1);
  assert.equal(client.indexOf("GOOGLE_MAPS_API_KEY"), -1);
  assert.equal(client.indexOf("AIza"), -1);
});

test("the enquiry API keeps Telegram credentials on the server", function () {
  var api = read("api/enquiry.js");
  assert.ok(api.indexOf("process.env.TELEGRAM_BOT_TOKEN") !== -1);
  assert.ok(api.indexOf("process.env.TELEGRAM_CHAT_ID") !== -1);
  assert.ok(api.indexOf("api.telegram.org") !== -1);

  var places = read("api/places.js");
  assert.ok(places.indexOf("process.env.GOOGLE_MAPS_API_KEY") !== -1);
  assert.ok(places.indexOf("places.googleapis.com") !== -1);
});

test("all four legal and error pages exist with canonical metadata", function () {
  var privacy = read("privacy.html");
  var terms = read("terms.html");
  var notFound = read("404.html");
  assert.ok(privacy.indexOf('rel="canonical" href="https://www.urbaniacabsbanglore.com/privacy"') !== -1);
  assert.ok(terms.indexOf('rel="canonical" href="https://www.urbaniacabsbanglore.com/terms"') !== -1);
  assert.ok(notFound.indexOf('name="robots" content="noindex, follow"') !== -1);
});
