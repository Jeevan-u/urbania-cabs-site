"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");

var enquiry = require("../lib/enquiry");

function outstationPayload(overrides) {
  return Object.assign(
    {
      tripType: "outstation",
      name: "Test User",
      phone: "+91 96323 45415",
      email: "test@example.com",
      pickup: "Indiranagar, Bangalore",
      drop: "Mysore",
      pickupDate: "2030-01-15",
      pickupTime: "06:30",
      tripMode: "Round trip",
      returnDate: "2030-01-17",
      passengers: 4,
      luggage: "1 to 2 bags",
      vehicle: "Innova",
      notes: "Child seat please",
      consent: true,
      startedAt: Date.now() - 5000,
      submittedAt: Date.now()
    },
    overrides || {}
  );
}

test("accepts a complete outstation enquiry", function () {
  var result = enquiry.validateEnquiry(outstationPayload());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.spam, false);
  assert.equal(result.data.tripLabel, "Outstation");
  assert.equal(result.data.name, "Test User");
});

test("rejects missing required outstation details", function () {
  var result = enquiry.validateEnquiry(
    outstationPayload({
      name: "",
      phone: "",
      pickup: "",
      drop: "",
      pickupDate: "",
      pickupTime: "",
      vehicle: ""
    })
  );
  assert.equal(result.valid, false);
  var fields = result.errors.map(function (item) {
    return item.field;
  });
  ["name", "phone", "pickup", "drop", "pickupDate", "pickupTime", "vehicle"].forEach(function (field) {
    assert.ok(fields.indexOf(field) !== -1, "expected an error for " + field);
  });
});

test("rejects an invalid phone number", function () {
  var result = enquiry.validateEnquiry(outstationPayload({ phone: "12345" }));
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(function (item) {
      return item.field === "phone";
    })
  );
});

test("rejects a past pickup date", function () {
  var result = enquiry.validateEnquiry(
    outstationPayload({ pickupDate: "2020-01-01", returnDate: "2020-01-02" })
  );
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(function (item) {
      return item.field === "pickupDate";
    })
  );
});

test("rejects a return date before the pickup date", function () {
  var result = enquiry.validateEnquiry(
    outstationPayload({ pickupDate: "2030-01-15", returnDate: "2030-01-14" })
  );
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(function (item) {
      return item.field === "returnDate";
    })
  );
});

test("accepts a one-way outstation enquiry without a return date", function () {
  var result = enquiry.validateEnquiry(
    outstationPayload({ tripMode: "One-way", returnDate: "" })
  );
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("validates airport luggage and direction", function () {
  var payload = {
    tripType: "airport",
    name: "Airport User",
    phone: "9632345415",
    email: "",
    pickup: enquiry.AIRPORT_LABEL,
    drop: "Whitefield, Bangalore",
    direction: "Airport drop",
    travelDate: "2030-02-01",
    travelTime: "14:15",
    passengers: 2,
    luggage: 2,
    vehicle: "Sedan",
    consent: true,
    startedAt: Date.now() - 5000,
    submittedAt: Date.now()
  };
  var result = enquiry.validateEnquiry(payload);
  assert.equal(result.valid, true, JSON.stringify(result.errors));

  var bad = enquiry.validateEnquiry(Object.assign({}, payload, { luggage: 99, direction: "Sideways" }));
  assert.equal(bad.valid, false);
  assert.ok(
    bad.errors.some(function (item) {
      return item.field === "luggage";
    })
  );
  assert.ok(
    bad.errors.some(function (item) {
      return item.field === "direction";
    })
  );
});

test("requires a work email for corporate enquiries", function () {
  var payload = {
    tripType: "corporate",
    company: "Example Pvt Ltd",
    contactPerson: "Corporate User",
    phone: "+91 96323 45415",
    email: "",
    pickup: "MG Road, Bangalore",
    destination: "Electronic City",
    travelStart: "2030-03-01",
    passengers: 6,
    vehicle: "Force Urbania",
    consent: true,
    startedAt: Date.now() - 5000,
    submittedAt: Date.now()
  };
  var result = enquiry.validateEnquiry(payload);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(function (item) {
      return item.field === "email";
    })
  );

  var valid = enquiry.validateEnquiry(Object.assign({}, payload, { email: "travel@example.com" }));
  assert.equal(valid.valid, true, JSON.stringify(valid.errors));
  assert.equal(valid.data.name, "Corporate User");
});

test("flags honeypot and too-fast submissions as spam", function () {
  var honeypot = enquiry.validateEnquiry(outstationPayload({ website: "https://spam.example" }));
  assert.equal(honeypot.valid, true);
  assert.equal(honeypot.spam, true);

  var now = Date.now();
  var fast = enquiry.validateEnquiry(outstationPayload({ startedAt: now, submittedAt: now }));
  assert.equal(fast.valid, true);
  assert.equal(fast.spam, true);
});

test("formats a readable WhatsApp message and URL", function () {
  var result = enquiry.validateEnquiry(outstationPayload());
  var reference = enquiry.createReference();
  assert.match(reference, /^UC-\d{6}-[A-Z2-9]{4}$/);

  var message = enquiry.formatWhatsAppMessage(result.data, reference);
  assert.ok(message.indexOf("New booking enquiry") !== -1);
  assert.ok(message.indexOf("Pickup: Indiranagar, Bangalore") !== -1);
  assert.ok(message.indexOf("Return date: 17 Jan 2030") !== -1);
  assert.ok(message.indexOf("Phone: +91 96323 45415") !== -1);
  assert.ok(message.indexOf("Reference: " + reference) !== -1);

  var url = enquiry.buildWhatsAppUrl(result.data, reference);
  assert.ok(url.indexOf("https://wa.me/919632345415?text=") === 0);
  assert.ok(decodeURIComponent(url).indexOf("New booking enquiry") !== -1);
});

test("formats dates and times for display", function () {
  assert.equal(enquiry.formatDate("2030-01-15"), "15 Jan 2030");
  assert.equal(enquiry.formatTime("06:30"), "6:30 AM");
  assert.equal(enquiry.formatTime("00:05"), "12:05 AM");
  assert.equal(enquiry.formatTime("12:00"), "12:00 PM");
  assert.equal(enquiry.formatTime("18:45"), "6:45 PM");
});
