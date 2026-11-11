"use strict";

var crypto = require("node:crypto");

var TRIP_TYPES = ["outstation", "local", "airport", "corporate"];
var TRIP_LABELS = {
  outstation: "Outstation",
  local: "Local rental",
  airport: "Airport transfer",
  corporate: "Corporate booking"
};
var AIRPORT_LABEL = "Kempegowda International Airport (BLR)";
var WHATSAPP_NUMBER = "919632345415";
var MAX_NOTES = 1000;
var MAX_BODY_BYTES = 20000;

function toLine(value, maxLength) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength || 200);
}

function toMultiline(value, maxLength) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength || MAX_NOTES);
}

function digitsOnly(value) {
  return String(value == null ? "" : value).replace(/\D/g, "");
}

function isValidPhone(value) {
  var digits = digitsOnly(value);
  if (digits.length < 10 || digits.length > 15) return false;
  if (/^0+$/.test(digits)) return false;
  return true;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function todayISO() {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  } catch (error) {
    var now = new Date();
    return (
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0")
    );
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var date = new Date(value + "T12:00:00+05:30");
  if (isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isFutureDate(value) {
  return isValidDate(value) && value >= todayISO();
}

function formatDate(value) {
  if (!value || !isValidDate(value)) return value || "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata"
    }).format(new Date(value + "T12:00:00+05:30"));
  } catch (error) {
    return value;
  }
}

function formatTime(value) {
  if (!isValidTime(value)) return value || "";
  var parts = value.split(":");
  var hours = Number(parts[0]);
  var minutes = parts[1];
  var suffix = hours >= 12 ? "PM" : "AM";
  var hour = hours % 12;
  if (hour === 0) hour = 12;
  return hour + ":" + minutes + " " + suffix;
}

function createReference() {
  var now = new Date();
  var stamp =
    String(now.getUTCFullYear()).slice(-2) +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0");
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var bytes = crypto.randomBytes(4);
  var suffix = "";
  for (var i = 0; i < bytes.length; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return "UC-" + stamp + "-" + suffix;
}

function validateEnquiry(payload) {
  var errors = [];
  var data = {};

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      valid: false,
      spam: false,
      errors: [{ field: "form", message: "The enquiry could not be read. Please try again." }],
      data: null
    };
  }

  var tripType = toLine(payload.tripType, 20).toLowerCase();
  if (TRIP_TYPES.indexOf(tripType) === -1) {
    errors.push({ field: "tripType", message: "Please choose a valid trip type." });
    tripType = "outstation";
  }

  data.tripType = tripType;
  data.tripLabel = TRIP_LABELS[tripType];
  data.website = toLine(payload.website, 200);
  data.consent = payload.consent === true || payload.consent === "true" || payload.consent === "on";
  data.name = toLine(payload.name, 80);
  data.contactPerson = toLine(payload.contactPerson, 80);
  data.company = toLine(payload.company, 120);
  data.phone = toLine(payload.phone, 20);
  data.email = toLine(payload.email, 120).toLowerCase();
  data.pickup = toLine(payload.pickup, 200);
  data.drop = toLine(payload.drop, 200);
  data.destination = toLine(payload.destination, 200);
  data.pickupPlaceId = toLine(payload.pickupPlaceId, 200);
  data.dropPlaceId = toLine(payload.dropPlaceId, 200);
  data.destinationPlaceId = toLine(payload.destinationPlaceId, 200);
  data.vehicle = toLine(payload.vehicle, 60);
  data.luggage = toLine(payload.luggage, 40);
  data.notes = toMultiline(payload.notes, MAX_NOTES);
  data.pageUrl = toLine(payload.pageUrl, 500);
  data.startedAt = Number(payload.startedAt) || 0;
  data.submittedAt = Number(payload.submittedAt) || Date.now();
  data.sessionToken = toLine(payload.sessionToken, 80);

  if (!data.consent) {
    errors.push({ field: "consent", message: "Please accept the privacy notice to continue." });
  }

  if (tripType === "corporate") {
    if (!data.company) errors.push({ field: "company", message: "Please enter your company name." });
    if (!data.contactPerson) {
      errors.push({ field: "contactPerson", message: "Please enter a contact person." });
    }
    if (!data.name) data.name = data.contactPerson;
  } else if (!data.name) {
    errors.push({ field: "name", message: "Please enter your name." });
  }

  if (!data.phone) {
    errors.push({ field: "phone", message: "Please enter a phone number." });
  } else if (!isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Please enter a valid phone number with 10 to 15 digits." });
  }

  if (!data.email) {
    if (tripType === "corporate") {
      errors.push({ field: "email", message: "Please enter your work email address." });
    }
  } else if (!isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Please enter a valid email address." });
  }

  if (!data.pickup) {
    errors.push({ field: "pickup", message: "Please enter a pickup location." });
  }

  function requireVehicle() {
    if (!data.vehicle) {
      errors.push({ field: "vehicle", message: "Please choose a vehicle preference." });
    }
  }

  function requirePassengers() {
    var passengers = Number(payload.passengers);
    data.passengers = Number.isInteger(passengers) ? passengers : 0;
    if (!Number.isInteger(passengers) || passengers < 1 || passengers > 60) {
      errors.push({ field: "passengers", message: "Please enter a passenger count between 1 and 60." });
    }
  }

  function requireDate(field, value, label) {
    if (!value) {
      errors.push({ field: field, message: "Please choose " + label + "." });
      return false;
    }
    if (!isValidDate(value)) {
      errors.push({ field: field, message: "Please choose a valid " + label + "." });
      return false;
    }
    if (!isFutureDate(value)) {
      errors.push({ field: field, message: "Please choose today or a future date for " + label + "." });
      return false;
    }
    return true;
  }

  function requireTime(field, value, label) {
    if (!value) {
      errors.push({ field: field, message: "Please choose " + label + "." });
      return false;
    }
    if (!isValidTime(value)) {
      errors.push({ field: field, message: "Please choose a valid " + label + "." });
      return false;
    }
    return true;
  }

  if (tripType === "outstation") {
    data.drop = data.drop;
    data.pickupDate = toLine(payload.pickupDate, 10);
    data.pickupTime = toLine(payload.pickupTime, 5);
    data.tripMode = toLine(payload.tripMode, 20);
    data.returnDate = toLine(payload.returnDate, 10);

    if (!data.drop) {
      errors.push({ field: "drop", message: "Please enter a drop location." });
    }
    var pickupDateOk = requireDate("pickupDate", data.pickupDate, "a pickup date");
    requireTime("pickupTime", data.pickupTime, "a pickup time");

    if (["One-way", "Round trip"].indexOf(data.tripMode) === -1) {
      errors.push({ field: "tripMode", message: "Please choose one-way or round trip." });
    }
    if (data.tripMode === "Round trip") {
      if (!requireDate("returnDate", data.returnDate, "a return date")) {
        /* Error already recorded. */
      } else if (pickupDateOk && data.returnDate < data.pickupDate) {
        errors.push({ field: "returnDate", message: "The return date cannot be before the pickup date." });
      }
    } else {
      data.returnDate = "";
    }

    if (!data.luggage) {
      errors.push({ field: "luggage", message: "Please select your luggage details." });
    }
    requirePassengers();
    requireVehicle();
  } else if (tripType === "local") {
    data.date = toLine(payload.date, 10);
    data.startTime = toLine(payload.startTime, 5);
    data.duration = Number(payload.duration);
    data.passengers = Number(payload.passengers);

    requireDate("date", data.date, "a date");
    requireTime("startTime", data.startTime, "a start time");

    if (!Number.isInteger(data.duration) || data.duration < 1 || data.duration > 72) {
      errors.push({ field: "duration", message: "Please enter a duration between 1 and 72 hours." });
    }
    requirePassengers();
    requireVehicle();
  } else if (tripType === "airport") {
    data.direction = toLine(payload.direction, 30);
    data.drop = data.drop;
    data.flightNumber = toLine(payload.flightNumber, 20);
    data.travelDate = toLine(payload.travelDate, 10);
    data.travelTime = toLine(payload.travelTime, 5);
    data.luggage = toLine(payload.luggage, 5);
    data.passengers = Number(payload.passengers);

    if (["Airport pickup", "Airport drop"].indexOf(data.direction) === -1) {
      errors.push({ field: "direction", message: "Please choose airport pickup or drop." });
    }
    if (!data.drop) {
      errors.push({ field: "drop", message: "Please enter the other address for the airport journey." });
    }
    requireDate("travelDate", data.travelDate, "a travel date");
    requireTime("travelTime", data.travelTime, "a travel time");

    var bags = Number(data.luggage);
    if (!Number.isInteger(bags) || bags < 0 || bags > 60) {
      errors.push({ field: "luggage", message: "Please enter a luggage count between 0 and 60." });
    }
    requirePassengers();
    requireVehicle();
  } else {
    data.destination = data.destination;
    data.travelStart = toLine(payload.travelStart, 10);
    data.travelEnd = toLine(payload.travelEnd, 10);

    if (!data.destination) {
      errors.push({ field: "destination", message: "Please enter a destination." });
    }
    var startOk = requireDate("travelStart", data.travelStart, "a travel start date");
    if (data.travelEnd) {
      if (!isValidDate(data.travelEnd)) {
        errors.push({ field: "travelEnd", message: "Please choose a valid travel end date." });
      } else if (data.travelEnd < todayISO()) {
        errors.push({ field: "travelEnd", message: "The travel end date cannot be in the past." });
      } else if (startOk && data.travelEnd < data.travelStart) {
        errors.push({ field: "travelEnd", message: "The travel end date cannot be before the start date." });
      }
    }
    requirePassengers();
    requireVehicle();
  }

  var spam = false;
  if (data.website) spam = true;
  if (data.startedAt > 0 && data.submittedAt - data.startedAt < 1500) spam = true;
  if (data.startedAt > data.submittedAt + 60000) spam = true;
  if (data.submittedAt > Date.now() + 5 * 60 * 1000) spam = true;

  return {
    valid: errors.length === 0,
    spam: spam,
    errors: errors,
    data: data
  };
}

function buildLines(data, reference) {
  var lines = ["New booking enquiry - Urbania Cabs Bangalore", ""];
  if (reference) lines.push("Reference: " + reference);
  lines.push("Trip type: " + data.tripLabel);

  function add(label, value) {
    var text = toLine(value, 500);
    if (text) lines.push(label + ": " + text);
  }

  if (data.tripType === "outstation") {
    add("Pickup", data.pickup);
    add("Drop", data.drop);
    add("Pickup date", formatDate(data.pickupDate));
    add("Pickup time", formatTime(data.pickupTime));
    add("Journey", data.tripMode);
    if (data.tripMode === "Round trip") add("Return date", formatDate(data.returnDate));
    add("Passengers", data.passengers);
    add("Luggage", data.luggage);
    add("Vehicle", data.vehicle);
  } else if (data.tripType === "local") {
    add("Pickup", data.pickup);
    add("Date", formatDate(data.date));
    add("Start time", formatTime(data.startTime));
    add("Duration", data.duration ? data.duration + " hours" : "");
    add("Passengers", data.passengers);
    add("Vehicle", data.vehicle);
  } else if (data.tripType === "airport") {
    add("Direction", data.direction);
    add("Pickup", data.pickup || AIRPORT_LABEL);
    add("Drop", data.drop);
    add("Flight", data.flightNumber);
    add("Travel date", formatDate(data.travelDate));
    add("Travel time", formatTime(data.travelTime));
    add("Passengers", data.passengers);
    add("Luggage", data.luggage !== "" ? data.luggage + " bags" : "");
    add("Vehicle", data.vehicle);
  } else {
    add("Company", data.company);
    add("Contact person", data.contactPerson);
    add("Pickup", data.pickup);
    add("Destination", data.destination);
    add("Travel start", formatDate(data.travelStart));
    add("Travel end", formatDate(data.travelEnd));
    add("Passengers", data.passengers);
    add("Vehicle", data.vehicle);
  }

  if (data.tripType !== "corporate") add("Name", data.name);
  add("Phone", data.phone);
  add("Email", data.email);
  if (data.notes) {
    lines.push("Notes:");
    data.notes.split("\n").forEach(function (line) {
      if (line.trim()) lines.push(line.trim());
    });
  }

  lines.push("");
  lines.push("Sent from urbaniacabsbanglore.com");
  return lines;
}

function formatEnquiry(data, reference) {
  return buildLines(data, reference).join("\n");
}

function formatWhatsAppMessage(data, reference) {
  var lines = buildLines(data, reference);
  lines[0] = "*" + lines[0] + "*";
  return lines.join("\n");
}

function buildWhatsAppUrl(data, reference) {
  return (
    "https://wa.me/" +
    WHATSAPP_NUMBER +
    "?text=" +
    encodeURIComponent(formatWhatsAppMessage(data, reference))
  );
}

module.exports = {
  TRIP_TYPES: TRIP_TYPES,
  TRIP_LABELS: TRIP_LABELS,
  AIRPORT_LABEL: AIRPORT_LABEL,
  WHATSAPP_NUMBER: WHATSAPP_NUMBER,
  MAX_BODY_BYTES: MAX_BODY_BYTES,
  validateEnquiry: validateEnquiry,
  formatEnquiry: formatEnquiry,
  formatWhatsAppMessage: formatWhatsAppMessage,
  buildWhatsAppUrl: buildWhatsAppUrl,
  createReference: createReference,
  isValidPhone: isValidPhone,
  isValidEmail: isValidEmail,
  isValidDate: isValidDate,
  isValidTime: isValidTime,
  formatDate: formatDate,
  formatTime: formatTime
};
