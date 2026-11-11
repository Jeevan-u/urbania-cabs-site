"use strict";

/**
 * Headless Chrome smoke test for the local site.
 *
 * Start the site with `npm run dev`, start Chrome with remote debugging:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --remote-debugging-port=9222 \
 *     --user-data-dir=/tmp/urbania-chrome about:blank
 * Then run:
 *   node scripts/smoke.js
 */

var BASE = process.env.SMOKE_BASE || "http://localhost:3000";
var DEBUG = process.env.SMOKE_DEBUG || "http://localhost:9222";

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function connect() {
  var target = await fetch(DEBUG + "/json/new?about:blank", { method: "PUT" }).then(function (response) {
    return response.json();
  });
  var ws = new WebSocket(target.webSocketDebuggerUrl);
  var nextId = 0;
  var pending = new Map();
  var loadResolvers = [];
  var consoleErrors = [];
  var exceptions = [];

  ws.onmessage = function (event) {
    var message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      var request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === "Page.loadEventFired") {
      loadResolvers.splice(0).forEach(function (resolve) {
        resolve();
      });
    }
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text || "exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(
        message.params.args
          .map(function (arg) {
            return arg.value || arg.description || "";
          })
          .join(" ")
      );
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      var entry = message.params.entry;
      consoleErrors.push(entry.text + (entry.url ? " " + entry.url : ""));
    }
  };

  await new Promise(function (resolve, reject) {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++nextId;
      pending.set(id, { resolve: resolve, reject: reject });
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "window.__opened = [];" +
      "window.open = function () {" +
      "  var fake = { document: { title: '', body: { textContent: '' } }, location: { href: '' }, close: function () { this.closed = true; } };" +
      "  window.__opened.push(fake);" +
      "  return fake;" +
      "};"
  });

  async function evaluate(expression) {
    var result = await send("Runtime.evaluate", {
      expression: expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(
        "Evaluation failed: " +
          (result.exceptionDetails.exception && result.exceptionDetails.exception.description
            ? result.exceptionDetails.exception.description
            : result.exceptionDetails.text)
      );
    }
    return result.result.value;
  }

  async function navigate(path) {
    var loaded = new Promise(function (resolve) {
      loadResolvers.push(resolve);
    });
    await send("Page.navigate", { url: BASE + path });
    await Promise.race([loaded, wait(15000)]);
    await wait(350);
  }

  function close() {
    try {
      ws.close();
    } catch (error) {
      /* Ignore. */
    }
  }

  return {
    send: send,
    evaluate: evaluate,
    navigate: navigate,
    close: close,
    consoleErrors: consoleErrors,
    exceptions: exceptions
  };
}

function check(condition, message) {
  if (!condition) throw new Error("FAIL: " + message);
  console.log("ok - " + message);
}

async function main() {
  var page = await connect();
  var failures = [];

  try {
    await page.navigate("/");

    var basics = await page.evaluate(`(function () {
      return {
        js: document.documentElement.classList.contains("js"),
        panels: Array.prototype.map.call(document.querySelectorAll("[data-panel]"), function (panel) { return panel.hidden; }),
        placesNotice: document.querySelector("#placesNotice").className,
        locateVisible: Array.prototype.every.call(document.querySelectorAll("[data-locate]"), function (button) { return !button.hidden; }),
        videoSource: Boolean(document.querySelector("[data-hero-video] source")),
        poster: Boolean(document.querySelector(".hero__poster")),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        title: document.title
      };
    })()`);
    check(basics.js, "JavaScript initialises");
    check(JSON.stringify(basics.panels) === JSON.stringify([false, true, true, true]), "only outstation panel is open");
    check(basics.placesNotice.indexOf("is-visible") !== -1, "manual-entry notice is visible without Places");
    check(basics.locateVisible, "current-location buttons are available");
    check(!basics.videoSource && basics.poster, "hero uses the poster when the video is missing");
    check(!basics.overflow, "no horizontal overflow at the initial viewport");
    check(basics.title.indexOf("Urbania Cabs Bangalore") !== -1, "page title is present");

    var tabState = await page.evaluate(`(function () {
      document.querySelector('[data-trip-tab="local"]').click();
      return {
        tripType: document.querySelector("#tripType").value,
        localHidden: document.querySelector("#panel-local").hidden,
        outstationHidden: document.querySelector("#panel-outstation").hidden,
        outstationDisabled: document.querySelector("#outPickup").disabled,
        localDisabled: document.querySelector("#localPickup").disabled,
        selected: document.querySelector('[data-trip-tab="local"]').getAttribute("aria-selected")
      };
    })()`);
    check(tabState.tripType === "local", "trip tab updates the hidden trip type");
    check(tabState.localHidden === false && tabState.outstationHidden === true, "trip panels switch correctly");
    check(tabState.outstationDisabled === true && tabState.localDisabled === false, "hidden panel fields are disabled");
    check(tabState.selected === "true", "trip tab exposes aria-selected");

    var quickLocal = await page.evaluate(`(function () {
      document.querySelector('[data-quick-tab="local"]').click();
      return {
        dropHidden: document.querySelector("#quickDropField").hidden,
        dropRequired: document.querySelector("#quickDrop").required
      };
    })()`);
    check(quickLocal.dropHidden === true && quickLocal.dropRequired === false, "quick local rental hides the drop field");

    var quickOutstation = await page.evaluate(`(function () {
      document.querySelector('[data-quick-tab="outstation"]').click();
      document.querySelector("#quickPickup").value = "Indiranagar, Bangalore";
      document.querySelector("#quickDrop").value = "Mysore";
      document.querySelector("#quickDate").value = "2030-01-15";
      document.querySelector("#quickPassengers").value = "4";
      document.querySelector("#quickForm").requestSubmit();
      return {
        tripType: document.querySelector("#tripType").value,
        pickup: document.querySelector("#outPickup").value,
        drop: document.querySelector("#outDrop").value,
        date: document.querySelector("#outPickupDate").value,
        passengers: document.querySelector("#outPassengers").value
      };
    })()`);
    check(quickOutstation.tripType === "outstation", "quick form carries the trip type into the main form");
    check(quickOutstation.pickup === "Indiranagar, Bangalore", "quick form carries the pickup");
    check(quickOutstation.drop === "Mysore", "quick form carries the drop");
    check(quickOutstation.date === "2030-01-15", "quick form carries the date");
    check(quickOutstation.passengers === "4", "quick form carries the passenger count");

    var validation = await page.evaluate(`(function () {
      document.querySelector('[data-trip-tab="airport"]').click();
      ["airportPickup", "airportDate", "airportTime", "airportVehicle", "airportName", "airportPhone"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
      document.querySelector("#consent").checked = false;
      document.querySelector("#enquiryForm").requestSubmit();
      return {
        summaryVisible: document.querySelector("#formErrorSummary").classList.contains("is-visible"),
        errorCount: document.querySelectorAll("#formErrorList li").length,
        invalidFields: document.querySelectorAll(".field.is-invalid").length,
        firstFocus: document.activeElement ? document.activeElement.id : ""
      };
    })()`);
    check(validation.summaryVisible, "invalid submission shows the error summary");
    check(validation.errorCount >= 4, "error summary lists the invalid fields");
    check(validation.invalidFields >= 4, "invalid fields are marked in the form");
    check(validation.firstFocus.length > 0, "focus moves to the first invalid field");

    var airportFixed = await page.evaluate(`(function () {
      var drop = document.querySelector("#airportDrop");
      return {
        readOnly: drop.readOnly,
        value: drop.value,
        locateHidden: document.querySelector('[data-locate="airportDrop"]').hidden
      };
    })()`);
    check(airportFixed.readOnly && airportFixed.value.length > 0, "the airport end of the journey is fixed");
    check(airportFixed.locateHidden, "the fixed airport field has no location button");

    var locate = await page.evaluate(`(function () {
      navigator.geolocation.getCurrentPosition = function (success, error) {
        error({ code: 1, message: "denied" });
      };
      document.querySelector('[data-locate="airportPickup"]').click();
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(document.querySelector("#airportPickupStatus").textContent);
        }, 150);
      });
    })()`);
    check(locate.toLowerCase().indexOf("denied") !== -1, "location permission denial is explained");

    var validSubmit = await page.evaluate(`(function () {
      document.querySelector('[data-trip-tab="outstation"]').click();
      document.querySelector("#outPickup").value = "Indiranagar, Bangalore";
      document.querySelector("#outDrop").value = "Mysore";
      document.querySelector("#outPickupDate").value = "2030-01-15";
      document.querySelector("#outPickupTime").value = "06:30";
      document.querySelector('input[name="outTripMode"][value="One-way"]').checked = true;
      document.querySelector("#outPassengers").value = "4";
      document.querySelector("#outLuggage").value = "1 to 2 bags";
      document.querySelector("#outVehicle").value = "Innova";
      document.querySelector("#outName").value = "Smoke Test";
      document.querySelector("#outPhone").value = "+91 96323 45415";
      document.querySelector("#outEmail").value = "smoke@example.com";
      document.querySelector("#consent").checked = true;
      document.querySelector("#formStartedAt").value = String(Date.now() - 5000);
      document.querySelector("#enquiryForm").requestSubmit();
      return new Promise(function (resolve) {
        var status = document.querySelector("#formStatus");
        var started = Date.now();
        var timer = setInterval(function () {
          if (status.classList.contains("is-visible") || Date.now() - started > 12000) {
            clearInterval(timer);
            resolve({
              className: status.className,
              text: status.textContent,
              opened: window.__opened.length,
              href: window.__opened.length ? window.__opened[0].location.href : "",
              actions: status.querySelectorAll(".form-status__actions a").length
            });
          }
        }, 100);
      });
    })()`);
    check(validSubmit.className.indexOf("form-status--warning") !== -1, "unconfigured Telegram is reported honestly");
    check(validSubmit.text.indexOf("WhatsApp") !== -1, "status explains the WhatsApp step");
    check(validSubmit.opened >= 1, "a WhatsApp tab is opened");
    check(validSubmit.href.indexOf("https://wa.me/919632345415?text=") === 0, "WhatsApp URL contains the number and message");
    check(validSubmit.actions >= 1, "status includes a WhatsApp fallback link");

    var mobile = await page.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await wait(200);
    var menuOpen = await page.evaluate(`(function () {
      document.querySelector("#menuToggle").click();
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({
            open: document.querySelector("#mobileNav").classList.contains("is-open"),
            expanded: document.querySelector("#menuToggle").getAttribute("aria-expanded"),
            body: document.body.classList.contains("menu-open"),
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1
          });
        }, 120);
      });
    })()`);
    check(menuOpen.open, "mobile menu opens");
    check(menuOpen.expanded === "true", "mobile menu updates aria-expanded");
    check(menuOpen.body, "mobile menu locks body scrolling");
    check(!menuOpen.overflow, "no horizontal overflow with the mobile menu open");

    var menuClose = await page.evaluate(`(function () {
      document.querySelector(".mobile-nav__close").click();
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({
            open: document.querySelector("#mobileNav").classList.contains("is-open"),
            focus: document.activeElement ? document.activeElement.id : ""
          });
        }, 500);
      });
    })()`);
    check(!menuClose.open, "mobile menu closes");
    check(menuClose.focus === "menuToggle", "focus returns to the menu button");

    var widths = [320, 390, 768, 1024, 1440];
    for (var i = 0; i < widths.length; i += 1) {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: widths[i],
        height: 900,
        deviceScaleFactor: 1,
        mobile: widths[i] < 768
      });
      await wait(150);
      var overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1");
      check(!overflow, "no horizontal overflow at " + widths[i] + "px");
    }

    await page.send("Emulation.clearDeviceMetricsOverride");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await wait(1200);
    var images = await page.evaluate(`(function () {
      return Array.prototype.filter.call(document.images, function (image) {
        return !image.complete || image.naturalWidth === 0;
      }).map(function (image) { return image.src; });
    })()`);
    check(images.length === 0, "all images load (missing: " + images.join(", ") + ")");

    await page.navigate("/privacy");
    var privacy = await page.evaluate(`(function () {
      return {
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]').href,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    })()`);
    check(privacy.title.indexOf("Privacy") !== -1, "privacy page loads");
    check(privacy.canonical.indexOf("/privacy") !== -1, "privacy canonical is clean");
    check(!privacy.overflow, "privacy page has no horizontal overflow");

    await page.navigate("/terms");
    var terms = await page.evaluate(`(function () {
      return {
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]').href
      };
    })()`);
    check(terms.title.indexOf("Terms") !== -1, "terms page loads");
    check(terms.canonical.indexOf("/terms") !== -1, "terms canonical is clean");

    var realErrors = page.consoleErrors.filter(function (error) {
      if (!error) return false;
      if (error.indexOf("favicon") !== -1) return false;
      /* The hero video is optional and absent in this checkout; the poster covers it. */
      if (error.indexOf("urbania-hero.mp4") !== -1) return false;
      return true;
    });
    check(page.exceptions.length === 0, "no uncaught JavaScript exceptions");
    check(realErrors.length === 0, "no console errors (" + realErrors.join(" | ") + ")");
  } catch (error) {
    failures.push(error);
  } finally {
    page.close();
  }

  if (failures.length) {
    failures.forEach(function (failure) {
      console.error(failure.message);
    });
    process.exit(1);
  }
  console.log("\nSmoke test passed.");
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
