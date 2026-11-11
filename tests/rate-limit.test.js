"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");

var rateLimit = require("../lib/rate-limit").rateLimit;

test("allows requests up to the limit and blocks the next one", function () {
  var key = "test-" + Math.random().toString(36).slice(2);
  var first = rateLimit(key, 2, 60000);
  var second = rateLimit(key, 2, 60000);
  var third = rateLimit(key, 2, 60000);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfter >= 1);
});

test("separate keys have separate buckets", function () {
  var a = "test-a-" + Math.random().toString(36).slice(2);
  var b = "test-b-" + Math.random().toString(36).slice(2);
  assert.equal(rateLimit(a, 1, 60000).allowed, true);
  assert.equal(rateLimit(a, 1, 60000).allowed, false);
  assert.equal(rateLimit(b, 1, 60000).allowed, true);
});
