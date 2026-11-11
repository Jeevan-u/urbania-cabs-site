"use strict";

var enquiry = require("../lib/enquiry");
var rateLimit = require("../lib/rate-limit").rateLimit;

var TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
var TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

function setCommonHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function clientIp(req) {
  var forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0];
  return (
    req.headers["x-real-ip"] ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown"
  );
}

function parseBody(body) {
  if (!body) return null;
  if (typeof body === "object") return body;
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body);
  } catch (error) {
    return null;
  }
}

function telegramConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function sendTelegram(text) {
  var response = await fetch(
    "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        disable_web_page_preview: true
      })
    }
  );
  var data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }
  if (!response.ok || data.ok === false) {
    var reason = data.description || "Telegram rejected the message";
    throw new Error(reason);
  }
  return data;
}

module.exports = async function handler(req, res) {
  setCommonHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    return;
  }

  var body = parseBody(req.body);
  if (!body) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        ok: false,
        error: "invalid_json",
        errors: [{ field: "form", message: "The enquiry could not be read. Please try again." }]
      })
    );
    return;
  }

  var serialised = JSON.stringify(body);
  if (serialised.length > enquiry.MAX_BODY_BYTES) {
    res.statusCode = 413;
    res.end(
      JSON.stringify({
        ok: false,
        error: "payload_too_large",
        errors: [{ field: "form", message: "The enquiry is too long. Please shorten your notes." }]
      })
    );
    return;
  }

  var ip = clientIp(req);
  var limit = rateLimit("enquiry:" + ip, 8, 10 * 60 * 1000);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.statusCode = 429;
    res.end(
      JSON.stringify({
        ok: false,
        error: "rate_limited",
        message: "Too many enquiries. Please wait a few minutes and try again.",
        retryAfter: limit.retryAfter
      })
    );
    return;
  }

  var result = enquiry.validateEnquiry(body);
  if (!result.valid) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: "validation_failed", errors: result.errors }));
    return;
  }

  if (result.spam) {
    /* Silently accept so automated clients do not learn the rules. */
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, notified: false, discarded: true }));
    return;
  }

  var reference = enquiry.createReference();
  var text = enquiry.formatEnquiry(result.data, reference);
  var whatsappUrl = enquiry.buildWhatsAppUrl(result.data, reference);

  if (!telegramConfigured()) {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        notified: false,
        configured: false,
        reference: reference,
        whatsappUrl: whatsappUrl
      })
    );
    return;
  }

  try {
    await sendTelegram(text);
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        notified: true,
        configured: true,
        reference: reference,
        whatsappUrl: whatsappUrl
      })
    );
  } catch (error) {
    console.error(
      "Telegram notification failed:",
      error && error.message ? error.message : "unknown error"
    );
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        ok: false,
        error: "notification_failed",
        configured: true,
        reference: reference,
        whatsappUrl: whatsappUrl
      })
    );
  }
};
