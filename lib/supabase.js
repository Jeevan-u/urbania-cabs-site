"use strict";

// Server-only Supabase REST helpers. Never import this file from browser code.
function config() {
  return {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  };
}
function configured() {
  var c = config();
  return Boolean(c.url && c.key);
}
async function request(path, options) {
  var c = config();
  if (!c.url || !c.key) throw new Error("supabase_not_configured");
  var response = await fetch(c.url + "/rest/v1/" + path, Object.assign({
    headers: {
      apikey: c.key,
      Authorization: "Bearer " + c.key,
      "Content-Type": "application/json"
    }
  }, options || {}));
  var body = null;
  var raw = await response.text();
  if (raw) {
    try { body = JSON.parse(raw); } catch (error) { body = null; }
  }
  if (!response.ok) {
    var failure = new Error("supabase_request_failed");
    failure.status = response.status;
    failure.details = body && body.message ? body.message : "";
    throw failure;
  }
  return body;
}
async function saveBooking(data, reference) {
  var customerName = data.name || data.contactPerson || "Customer";
  var rows = await request("bookings?select=id,reference", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      reference: reference,
      trip_type: data.tripType,
      status: "new",
      customer_name: customerName,
      contact_person: data.contactPerson || null,
      company: data.company || null,
      phone: data.phone,
      email: data.email || null,
      pickup: data.pickup,
      drop_location: data.drop || null,
      passengers: Number(data.passengers) || null,
      vehicle_preference: data.vehicle || null,
      pickup_date: data.pickupDate || data.date || data.travelDate || data.travelStart || null,
      pickup_time: data.pickupTime || data.startTime || data.travelTime || null,
      details: data
    } )]
  });
  return Array.isArray(rows) ? rows[0] : null;
}
async function getAuthenticatedUser(token) {
  var c = config();
  var anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (!c.url || !anon || !token) return null;
  var response = await fetch(c.url + "/auth/v1/user", {
    headers: { apikey: anon, Authorization: "Bearer " + token }
  });
  if (!response.ok) return null;
  return response.json();
}
async function isAdmin(userId) {
  var rows = await request("profiles?select=role&id=eq." + encodeURIComponent(userId) + "&limit=1");
  return Array.isArray(rows) && rows.length === 1 && ["admin", "owner"].indexOf(rows[0].role) !== -1;
}
module.exports = { configured: configured, saveBooking: saveBooking, getAuthenticatedUser: getAuthenticatedUser, isAdmin: isAdmin, request: request };
