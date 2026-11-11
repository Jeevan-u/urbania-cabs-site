"use strict";

/**
 * Small in-memory fixed-window rate limiter.
 *
 * Serverless instances do not share memory, so this protects a single warm
 * instance rather than the whole deployment. It is a useful first line of
 * defence alongside the honeypot and timing checks in the enquiry endpoint.
 */
var buckets = new Map();

function cleanup(now) {
  if (buckets.size < 5000) return;
  for (var entry of buckets) {
    if (now >= entry[1].reset) buckets.delete(entry[0]);
  }
}

function rateLimit(key, limit, windowMs) {
  var now = Date.now();
  var bucket = buckets.get(key);
  if (!bucket || now >= bucket.reset) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  cleanup(now);
  var allowed = bucket.count <= limit;
  return {
    allowed: allowed,
    remaining: Math.max(0, limit - bucket.count),
    limit: limit,
    reset: bucket.reset,
    retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000))
  };
}

module.exports = { rateLimit: rateLimit };
