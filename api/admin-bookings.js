"use strict";

var db = require("../lib/supabase");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}
function bearer(req) {
  var value = req.headers.authorization || "";
  var match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1] : "";
}
function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch (error) { return null; }
}
module.exports = async function handler(req, res) {
  if (!db.configured()) return send(res, 503, { ok: false, error: "database_not_configured" });
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }
  try {
    var user = await db.getAuthenticatedUser(bearer(req));
    if (!user || !user.id) return send(res, 401, { ok: false, error: "authentication_required" });
    if (!(await db.isAdmin(user.id))) return send(res, 403, { ok: false, error: "admin_access_required" });

    if (req.method === "GET") {
      var rows = await db.request("bookings?select=*&order=created_at.desc&limit=100");
      return send(res, 200, { ok: true, bookings: rows || [] });
    }

    var body = parseBody(req.body);
    var allowed = ["new","contacted","quoted","confirmed","completed","cancelled"];
    if (!body || typeof body.id !== "string" || allowed.indexOf(body.status) === -1) {
      return send(res, 400, { ok: false, error: "invalid_booking_update" });
    }
    var updated = await db.request("bookings?id=eq." + encodeURIComponent(body.id) + "&select=id,reference,status,updated_at", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() })
    });
    if (!Array.isArray(updated) || !updated.length) return send(res, 404, { ok: false, error: "booking_not_found" });
    return send(res, 200, { ok: true, booking: updated[0] });
  } catch (error) {
    console.error("Admin bookings API failed:", error && error.message ? error.message : "unknown");
    return send(res, 500, { ok: false, error: "server_error" });
  }
};
