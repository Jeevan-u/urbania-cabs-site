"use strict";

var rateLimit = require("../lib/rate-limit").rateLimit;

var API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
var BANGALORE = { latitude: 12.9716, longitude: 77.5946 };

function setCommonHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function clientIp(req) {
  var forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0];
  return req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown";
}

function queryValue(req, name) {
  if (req.query && typeof req.query === "object" && req.query[name] !== undefined) {
    return String(req.query[name]);
  }
  try {
    var url = new URL(req.url, "http://localhost");
    return url.searchParams.get(name) || "";
  } catch (error) {
    return "";
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function googleError(status, data) {
  var message = data && data.error && data.error.message ? data.error.message : "";
  console.error("Google Places request failed:", status, message);
}

async function googleFetch(url, options) {
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, 8000);
  try {
    var response = await fetch(url, Object.assign({ signal: controller.signal }, options));
    var data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      googleError(response.status, data);
      var failure = new Error("places_request_failed");
      failure.status = response.status;
      throw failure;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function mapPlace(place) {
  if (!place) return null;
  return {
    placeId: place.id || "",
    name: place.displayName && place.displayName.text ? place.displayName.text : "",
    address: place.formattedAddress || "",
    lat: place.location && place.location.latitude ? place.location.latitude : null,
    lng: place.location && place.location.longitude ? place.location.longitude : null
  };
}

module.exports = async function handler(req, res) {
  setCommonHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  var action = queryValue(req, "action");

  if (action === "status") {
    return json(res, 200, { configured: Boolean(API_KEY) });
  }

  if (!API_KEY) {
    return json(res, 503, {
      ok: false,
      error: "places_not_configured",
      message: "Address suggestions are not configured. Please type your address manually."
    });
  }

  var ip = clientIp(req);
  var limit = rateLimit("places:" + ip, 90, 60 * 1000);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return json(res, 429, {
      ok: false,
      error: "rate_limited",
      message: "Too many address lookups. Please type your address manually."
    });
  }

  try {
    if (action === "autocomplete") {
      var input = queryValue(req, "input").trim().slice(0, 200);
      var sessionToken = queryValue(req, "sessionToken").trim().slice(0, 80);
      if (input.length < 3) {
        return json(res, 200, { results: [] });
      }
      var body = {
        input: input,
        languageCode: "en",
        includedRegionCodes: ["in"],
        locationBias: {
          circle: {
            center: BANGALORE,
            radius: 50000
          }
        }
      };
      if (sessionToken) body.sessionToken = sessionToken;

      var data = await googleFetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY
        },
        body: JSON.stringify(body)
      });

      var suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      var results = suggestions
        .map(function (suggestion) {
          return suggestion && suggestion.placePrediction;
        })
        .filter(Boolean)
        .map(function (prediction) {
          var main =
            prediction.structuredFormat &&
            prediction.structuredFormat.mainText &&
            prediction.structuredFormat.mainText.text
              ? prediction.structuredFormat.mainText.text
              : "";
          var secondary =
            prediction.structuredFormat &&
            prediction.structuredFormat.secondaryText &&
            prediction.structuredFormat.secondaryText.text
              ? prediction.structuredFormat.secondaryText.text
              : "";
          return {
            placeId: prediction.placeId || "",
            primary: main,
            secondary: secondary,
            description: prediction.text && prediction.text.text ? prediction.text.text : main
          };
        })
        .filter(function (item) {
          return Boolean(item.placeId);
        });

      return json(res, 200, { results: results });
    }

    if (action === "details") {
      var placeId = queryValue(req, "placeId").trim();
      var detailsSession = queryValue(req, "sessionToken").trim().slice(0, 80);
      if (!placeId || placeId.length < 5 || placeId.length > 300 || !/^[A-Za-z0-9_-]+$/.test(placeId)) {
        return json(res, 400, { ok: false, error: "invalid_place_id" });
      }
      var detailsUrl =
        "https://places.googleapis.com/v1/places/" +
        encodeURIComponent(placeId) +
        "?languageCode=en" +
        (detailsSession ? "&sessionToken=" + encodeURIComponent(detailsSession) : "");
      var place = await googleFetch(detailsUrl, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location"
        }
      });
      var mapped = mapPlace(place);
      if (!mapped) return json(res, 404, { ok: false, error: "not_found" });
      return json(res, 200, mapped);
    }

    if (action === "reverse") {
      var lat = Number(queryValue(req, "lat"));
      var lng = Number(queryValue(req, "lng"));
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return json(res, 400, { ok: false, error: "invalid_coordinates" });
      }
      var nearby = await googleFetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location"
        },
        body: JSON.stringify({
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: 50
            }
          },
          maxResultCount: 1,
          languageCode: "en",
          rankPreference: "DISTANCE"
        })
      });
      var places = Array.isArray(nearby.places) ? nearby.places : [];
      var nearest = mapPlace(places[0]);
      if (!nearest || !nearest.address) {
        return json(res, 404, { ok: false, error: "not_found" });
      }
      return json(res, 200, nearest);
    }

    return json(res, 400, { ok: false, error: "unknown_action" });
  } catch (error) {
    if (error && error.name === "AbortError") {
      return json(res, 504, {
        ok: false,
        error: "places_timeout",
        message: "The address lookup timed out. Please type your address manually."
      });
    }
    return json(res, 502, {
      ok: false,
      error: "places_unavailable",
      message: "Address suggestions are unavailable. Please type your address manually."
    });
  }
};
