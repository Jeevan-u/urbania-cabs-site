/* ==========================================================================
   Urbania Cabs Bangalore — front-end behaviour
   Vanilla JS. No dependencies.
   ========================================================================== */
(function () {
  "use strict";

  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  /* ---------- Constants ---------- */
  var WHATSAPP_NUMBER = "919632345415";
  var WHATSAPP_BASE = "https://wa.me/" + WHATSAPP_NUMBER;
  var EMAIL = "skycabsbangalore@gmail.com";
  var AIRPORT_LABEL = "Kempegowda International Airport (BLR)";
  var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TRIP_TYPES = ["outstation", "local", "airport", "corporate"];
  var TRIP_LABELS = {
    outstation: "Outstation",
    local: "Local rental",
    airport: "Airport transfer",
    corporate: "Corporate booking"
  };
  var SESSION_TOKEN = makeId();
  var placesAvailable = null;
  var geoSupported = "geolocation" in navigator;
  var lastSubmission = { signature: "", time: 0, ok: false };

  /* ---------- Helpers ---------- */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }
  function on(el, event, handler, options) {
    if (el) el.addEventListener(event, handler, options);
  }
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, wait);
    };
  }
  function todayISO() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    } catch (err) {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }
  function formatDate(value) {
    if (!value) return "";
    var d = new Date(value + "T12:00:00");
    if (isNaN(d.getTime())) return value;
    try {
      return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
    } catch (err) {
      return value;
    }
  }
  function formatTime(value) {
    if (!value) return "";
    var parts = value.split(":");
    if (parts.length !== 2) return value;
    var h = Number(parts[0]);
    var m = parts[1];
    var suffix = h >= 12 ? "PM" : "AM";
    var hour = h % 12;
    if (hour === 0) hour = 12;
    return hour + ":" + m + " " + suffix;
  }
  function formatSubmittedAt() {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }).format(new Date());
    } catch (err) {
      return new Date().toString();
    }
  }
  function waLink(text) {
    return WHATSAPP_BASE + "?text=" + encodeURIComponent(text || "");
  }
  function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }
  function scrollBehavior() {
    return REDUCED_MOTION ? "auto" : "smooth";
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function showToast(message) {
    var toast = $("#toast");
    var text = $("#toastText");
    if (!toast || !text) return;
    text.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 4200);
  }

  /* ---------- Header ---------- */
  var header = $("#siteHeader");
  function updateHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  on(window, "scroll", updateHeader, { passive: true });
  updateHeader();

  /* ---------- Mobile menu ---------- */
  var menuToggle = $("#menuToggle");
  var mobileNav = $("#mobileNav");
  var menuClose = $(".mobile-nav__close", mobileNav);

  function openMenu() {
    if (!mobileNav || !menuToggle) return;
    mobileNav.inert = false;
    mobileNav.classList.add("is-open");
    mobileNav.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close menu");
    document.body.classList.add("menu-open");
    window.setTimeout(function () {
      if (menuClose) menuClose.focus();
    }, 60);
  }
  function closeMenu() {
    if (!mobileNav || !menuToggle) return;
    mobileNav.classList.remove("is-open");
    mobileNav.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("menu-open");
    window.setTimeout(function () {
      mobileNav.inert = true;
      menuToggle.focus();
    }, 380);
  }
  on(menuToggle, "click", function () {
    if (mobileNav && mobileNav.classList.contains("is-open")) closeMenu();
    else openMenu();
  });
  $$("[data-menu-close]", mobileNav).forEach(function (el) {
    on(el, "click", closeMenu);
  });
  $$(".mobile-nav__links a, .mobile-nav__contact a", mobileNav).forEach(function (link) {
    on(link, "click", function () {
      if (mobileNav && mobileNav.classList.contains("is-open")) closeMenu();
    });
  });
  on(document, "keydown", function (event) {
    if (!mobileNav || !mobileNav.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== "Tab") return;
    var focusables = $$(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      mobileNav
    ).filter(function (el) {
      return el.offsetParent !== null;
    });
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  var desktopQuery = window.matchMedia("(min-width: 901px)");
  function handleDesktopChange(event) {
    if (event.matches && mobileNav && mobileNav.classList.contains("is-open")) closeMenu();
  }
  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", handleDesktopChange);
  } else if (typeof desktopQuery.addListener === "function") {
    desktopQuery.addListener(handleDesktopChange);
  }

  /* ---------- Hero video (progressive, poster fallback) ---------- */
  function initHeroVideo() {
    var video = $("[data-hero-video]");
    if (!video) return;
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (REDUCED_MOTION || (connection && connection.saveData)) return;
    var src = video.getAttribute("data-src");
    if (!src) return;

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 4500);

    fetch(src, { method: "HEAD", signal: controller.signal, cache: "no-store" })
      .then(function (response) {
        clearTimeout(timer);
        if (!response.ok) throw new Error("Video not available");
        var source = document.createElement("source");
        source.src = src;
        source.type = "video/mp4";
        video.appendChild(source);
        video.preload = "auto";
        video.load();
        var tryPlay = function () {
          var promise = video.play();
          if (promise && typeof promise.then === "function") {
            promise
              .then(function () {
                video.classList.add("is-ready");
              })
              .catch(function () {
                /* Autoplay blocked: poster stays visible. */
              });
          }
        };
        video.addEventListener("canplay", tryPlay, { once: true });
        video.addEventListener("loadeddata", tryPlay, { once: true });
        setTimeout(tryPlay, 2800);
      })
      .catch(function () {
        clearTimeout(timer);
        /* No video file or blocked request: the poster remains. */
      });

    on(document, "visibilitychange", function () {
      if (!video.classList.contains("is-ready")) return;
      if (document.hidden) {
        video.pause();
      } else {
        var p = video.play();
        if (p && typeof p.catch === "function") p.catch(function () {});
      }
    });
  }
  initHeroVideo();

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    var items = $$("[data-reveal]");
    if (!items.length) return;
    if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach(function (el) {
      observer.observe(el);
    });
  }
  initReveal();

  /* ---------- Dates ---------- */
  function setMinimumDates() {
    var today = todayISO();
    $$('input[type="date"]').forEach(function (input) {
      if (!input.min) input.min = today;
    });
  }
  function syncDateMins() {
    var today = todayISO();
    var outPickup = $("#outPickupDate");
    var outReturn = $("#outReturnDate");
    if (outPickup && outReturn) {
      outReturn.min = outPickup.value || today;
      if (outReturn.value && outReturn.value < outReturn.min) outReturn.value = "";
    }
    var corpStart = $("#corpStart");
    var corpEnd = $("#corpEnd");
    if (corpStart && corpEnd) {
      corpEnd.min = corpStart.value || today;
      if (corpEnd.value && corpEnd.value < corpEnd.min) corpEnd.value = "";
    }
  }
  setMinimumDates();
  on($("#outPickupDate"), "change", syncDateMins);
  on($("#corpStart"), "change", syncDateMins);

  /* ---------- Trip tabs / panels ---------- */
  var tripTypeInput = $("#tripType");
  var tripTabs = $$("[data-trip-tab]");
  var tripPanels = $$("[data-panel]");

  function getCurrentTripType() {
    return tripTypeInput && TRIP_TYPES.indexOf(tripTypeInput.value) !== -1 ? tripTypeInput.value : "outstation";
  }

  function setPanelEnabled(panel, enabled) {
    $$("input, select, textarea, button", panel).forEach(function (el) {
      if (el.type === "hidden") return;
      el.disabled = !enabled;
    });
  }

  function syncReturnDate() {
    var panel = $('[data-panel="outstation"]');
    if (!panel) return;
    var checked = $('input[name="outTripMode"]:checked', panel);
    var roundTrip = checked && checked.value === "Round trip";
    var wrap = $("[data-return-date]", panel);
    if (!wrap) return;
    var input = $("input", wrap);
    wrap.hidden = !roundTrip;
    if (input) {
      input.disabled = !roundTrip;
      input.required = roundTrip;
      if (!roundTrip) {
        input.value = "";
        clearFieldError(input);
      }
    }
    syncDateMins();
  }

  function syncAirportFields() {
    var panel = $('[data-panel="airport"]');
    if (!panel) return;
    var checked = $('input[name="airportDirection"]:checked', panel);
    var direction = checked ? checked.value : "Airport drop";
    var pickup = $('[data-key="pickup"]', panel);
    var drop = $('[data-key="drop"]', panel);
    if (!pickup || !drop) return;

    var pickupIsFixed = direction === "Airport pickup";
    var fixed = pickupIsFixed ? pickup : drop;
    var editable = pickupIsFixed ? drop : pickup;
    var fixedField = fixed.closest(".field");
    var editableField = editable.closest(".field");

    if (fixed.value && fixed.value !== AIRPORT_LABEL && !editable.value) {
      editable.value = fixed.value;
    }
    if (editable.value === AIRPORT_LABEL) editable.value = "";
    fixed.value = AIRPORT_LABEL;
    fixed.readOnly = true;
    fixed.setAttribute("aria-readonly", "true");
    editable.readOnly = false;
    editable.removeAttribute("aria-readonly");

    var fixedPlace = $('[data-place-id-for="' + fixed.id + '"]', panel);
    if (fixedPlace) fixedPlace.value = "";
    var fixedLocate = $('[data-locate="' + fixed.id + '"]', fixedField);
    if (fixedLocate) fixedLocate.hidden = true;
    var editableLocate = $('[data-locate="' + editable.id + '"]', editableField);
    if (editableLocate) editableLocate.hidden = !geoSupported;

    var fixedStatus = $("[data-place-status]", fixedField);
    if (fixedStatus) fixedStatus.textContent = "Airport is fixed for this direction.";
    var editableStatus = $("[data-place-status]", editableField);
    if (editableStatus && editableStatus.textContent === "Airport is fixed for this direction.") {
      editableStatus.textContent = "";
    }
    clearFieldError(fixed);
    clearFieldError(editable);
  }

  function setTripType(type, options) {
    options = options || {};
    if (TRIP_TYPES.indexOf(type) === -1) type = "outstation";
    if (tripTypeInput) tripTypeInput.value = type;

    tripTabs.forEach(function (tab) {
      var active = tab.getAttribute("data-trip-tab") === type;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });

    tripPanels.forEach(function (panel) {
      var active = panel.getAttribute("data-panel") === type;
      panel.hidden = !active;
      setPanelEnabled(panel, active);
    });

    if (type === "outstation") syncReturnDate();
    if (type === "airport") syncAirportFields();
    if (type === "corporate") syncDateMins();
    if (options.focus) {
      var panel = $('[data-panel="' + type + '"]');
      var target = panel && $("[data-autocomplete]", panel);
      if (target) target.focus({ preventScroll: true });
    }
  }

  function setFieldValue(panel, key, value) {
    if (!panel || !value) return;
    var field = $('[data-key="' + key + '"]', panel);
    if (!field) return;
    field.value = value;
    if (field.id) {
      var hidden = $('[data-place-id-for="' + field.id + '"]', panel);
      if (hidden) hidden.value = "";
    }
    clearFieldError(field);
  }

  function setVehicle(value) {
    if (!value) return;
    $$("[data-vehicle-select]").forEach(function (select) {
      var match = null;
      Array.prototype.forEach.call(select.options, function (option) {
        if (option.value === value || option.text === value) match = option.value;
      });
      if (match !== null) select.value = match;
    });
  }

  function dateKeyFor(type) {
    if (type === "outstation") return "pickupDate";
    if (type === "local") return "date";
    if (type === "airport") return "travelDate";
    return "travelStart";
  }

  function scrollToBooking(focus) {
    var booking = $("#booking");
    if (!booking) return;
    booking.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    if (focus) {
      window.setTimeout(
        function () {
          var panel = $('[data-panel="' + getCurrentTripType() + '"]');
          var target = panel && $("[data-autocomplete]", panel);
          if (target) target.focus({ preventScroll: true });
        },
        REDUCED_MOTION ? 20 : 450
      );
    }
  }

  function applyTripType(type, options) {
    options = options || {};
    setTripType(type);
    var panel = $('[data-panel="' + type + '"]');
    if (options.vehicle) setVehicle(options.vehicle);
    if (options.pickup) setFieldValue(panel, "pickup", options.pickup);
    if (options.drop) setFieldValue(panel, "drop", options.drop);
    if (options.date) setFieldValue(panel, dateKeyFor(type), options.date);
    if (options.passengers) setFieldValue(panel, "passengers", options.passengers);

    if (type === "airport") {
      var combined = (cleanText(options.pickup) + " " + cleanText(options.drop)).toLowerCase();
      if (combined.indexOf("airport") !== -1 || combined.indexOf("blr") !== -1) {
        var pickupText = cleanText(options.pickup).toLowerCase();
        var pickupIsAirport = pickupText.indexOf("airport") !== -1 || pickupText.indexOf("blr") !== -1;
        var radio = $(
          'input[name="airportDirection"][value="' + (pickupIsAirport ? "Airport pickup" : "Airport drop") + '"]',
          panel
        );
        if (radio) radio.checked = true;
      }
      syncAirportFields();
    }
    if (type === "outstation") syncReturnDate();
    if (type === "corporate") syncDateMins();
    scrollToBooking(Boolean(options.focus));
  }

  tripTabs.forEach(function (tab) {
    on(tab, "click", function () {
      setTripType(tab.getAttribute("data-trip-tab"));
    });
  });
  var formTabs = $(".form-tabs");
  on(formTabs, "keydown", function (event) {
    var index = tripTabs.indexOf(document.activeElement);
    if (index === -1) return;
    var next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tripTabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tripTabs.length) % tripTabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tripTabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    tripTabs[next].focus();
    setTripType(tripTabs[next].getAttribute("data-trip-tab"));
  });

  $$('input[name="outTripMode"]').forEach(function (radio) {
    on(radio, "change", syncReturnDate);
  });
  $$('input[name="airportDirection"]').forEach(function (radio) {
    on(radio, "change", syncAirportFields);
  });

  /* ---------- Quick enquiry ---------- */
  var quickForm = $("#quickForm");
  var quickTypeInput = $("#quickTripType");
  var quickTabs = $$("[data-quick-tab]");
  var quickPickup = $("#quickPickup");
  var quickDrop = $("#quickDrop");
  var quickDropField = $("#quickDropField");
  var quickDate = $("#quickDate");
  var quickPassengers = $("#quickPassengers");
  var quickError = $("#quickError");
  var quickType = "outstation";

  function setQuickType(type) {
    quickType = type;
    if (quickTypeInput) quickTypeInput.value = type;
    quickTabs.forEach(function (tab) {
      var active = tab.getAttribute("data-quick-tab") === type;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
    var isLocal = type === "local";
    if (quickDropField) quickDropField.hidden = isLocal;
    if (quickDrop) {
      quickDrop.required = !isLocal;
      if (isLocal) quickDrop.value = "";
    }
    var pickupLabel = $('label[for="quickPickup"]');
    var dropLabel = $('label[for="quickDrop"]');
    if (pickupLabel) pickupLabel.textContent = type === "airport" ? "Pickup address" : "Pickup location";
    if (dropLabel) dropLabel.textContent = type === "corporate" ? "Destination" : type === "airport" ? "Drop address" : "Drop location";
    if (quickDrop) {
      quickDrop.placeholder =
        type === "airport" ? "e.g. Whitefield, Bangalore" : type === "corporate" ? "e.g. Electronic City" : "e.g. Mysore";
    }
    if (quickError) {
      quickError.textContent = "";
      quickError.classList.remove("is-visible");
    }
  }
  quickTabs.forEach(function (tab) {
    on(tab, "click", function () {
      setQuickType(tab.getAttribute("data-quick-tab"));
    });
  });
  if (quickDate) quickDate.min = todayISO();
  on(quickForm, "submit", function (event) {
    event.preventDefault();
    var pickup = cleanText(quickPickup && quickPickup.value);
    var drop = cleanText(quickDrop && quickDrop.value);
    var date = quickDate ? quickDate.value : "";
    var passengers = quickPassengers ? Number(quickPassengers.value) : 2;
    var message = "";
    if (!pickup) message = "Please enter a pickup location.";
    else if (quickType !== "local" && !drop) message = "Please enter a drop location or destination.";
    else if (!date) message = "Please choose a pickup date.";
    else if (date < todayISO()) message = "Please choose today or a future date.";
    else if (!Number.isInteger(passengers) || passengers < 1 || passengers > 60) message = "Enter a passenger count between 1 and 60.";
    if (message) {
      if (quickError) {
        quickError.textContent = message;
        quickError.classList.add("is-visible");
      }
      if (!pickup && quickPickup) quickPickup.focus();
      else if (quickType !== "local" && !drop && quickDrop) quickDrop.focus();
      else if (!date && quickDate) quickDate.focus();
      else if (quickPassengers) quickPassengers.focus();
      return;
    }
    applyTripType(quickType, {
      pickup: pickup,
      drop: drop,
      date: date,
      passengers: passengers,
      focus: true
    });
    showToast("Details carried over. Complete the enquiry below.");
  });

  /* ---------- Cross-page enquiry links ---------- */
  document.addEventListener("click", function (event) {
    var area = event.target.closest("[data-area]");
    var destination = event.target.closest("[data-destination]");
    var vehicle = event.target.closest("[data-enquire-vehicle]");
    var start = event.target.closest("[data-start-enquiry]");
    if (!area && !destination && !vehicle && !start) return;
    event.preventDefault();
    var type = start
      ? start.getAttribute("data-start-enquiry")
      : area
        ? "local"
        : destination
          ? "outstation"
          : getCurrentTripType();
    var options = {};
    if (vehicle) options.vehicle = vehicle.getAttribute("data-enquire-vehicle");
    if (area) options.pickup = area.getAttribute("data-area") + ", Bangalore";
    if (destination) options.drop = destination.getAttribute("data-destination");
    applyTripType(type, options);
    if (area) showToast("Local rental started for " + area.getAttribute("data-area") + ".");
    if (destination) showToast("Outstation enquiry started for " + destination.getAttribute("data-destination") + ".");
  });

  $$("[data-wa-vehicle]").forEach(function (link) {
    var vehicle = link.getAttribute("data-wa-vehicle");
    link.href = waLink("Hello Urbania Cabs Bangalore, I would like to enquire about " + vehicle + ".");
  });

  /* ==========================================================================
     Validation helpers
     ========================================================================== */
  var defaultErrors = new WeakMap();
  $$(".field__error").forEach(function (el) {
    defaultErrors.set(el, el.textContent);
  });

  function fieldWrap(field) {
    return field && field.closest ? field.closest(".field") : null;
  }

  function errorElementFor(field) {
    if (!field) return null;
    if (field.id) {
      var byId = document.getElementById(field.id + "Error");
      if (byId) return byId;
    }
    var group = field.getAttribute("data-radio-group");
    if (group) return document.querySelector('[data-error-for="' + group + '"]');
    return null;
  }

  function defaultErrorText(field) {
    var el = errorElementFor(field);
    var stored = el && defaultErrors.get(el);
    return stored || "This field is required.";
  }

  function labelTextFor(field) {
    if (!field) return "This field";
    if (field.id) {
      var label = document.querySelector('label[for="' + field.id + '"]');
      if (label) {
        return cleanText(label.textContent)
          .replace(/\s*\*$/, "")
          .replace(/\s*\(optional\)$/i, "");
      }
    }
    var group = field.getAttribute("data-radio-group");
    if (group) {
      var groupLabel = document.getElementById(group + "Label");
      if (groupLabel) {
        return cleanText(groupLabel.textContent)
          .replace(/\s*\*$/, "")
          .replace(/\s*\(optional\)$/i, "");
      }
    }
    return field.name || "This field";
  }

  function setFieldError(field, message) {
    if (!field) return;
    var wrap = fieldWrap(field);
    if (wrap) wrap.classList.add("is-invalid");
    field.setAttribute("aria-invalid", "true");
    var el = errorElementFor(field);
    if (el) {
      if (!defaultErrors.has(el)) defaultErrors.set(el, el.textContent);
      if (message) el.textContent = message;
    }
  }

  function clearFieldError(field) {
    if (!field) return;
    var wrap = fieldWrap(field);
    if (wrap) wrap.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");
    var el = errorElementFor(field);
    if (el && defaultErrors.has(el)) el.textContent = defaultErrors.get(el);
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
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanText(value));
  }

  function validateField(field) {
    if (!field || field.disabled) return "";
    var rule = field.getAttribute("data-validate");
    var required = field.hasAttribute("required");

    if (field.type === "checkbox") {
      return field.checked ? "" : defaultErrorText(field);
    }

    var value = cleanText(field.value);

    if (rule === "date" || rule === "date-end") {
      if (!value) return required ? defaultErrorText(field) : "";
      if (value < todayISO()) return "Please choose today or a future date.";
      if (rule === "date-end") {
        var afterId = field.getAttribute("data-end-after");
        var start = afterId ? document.getElementById(afterId) : null;
        if (start && start.value && value < start.value) {
          return "The end date cannot be before the start date.";
        }
      }
      return "";
    }

    if (!value) return required ? defaultErrorText(field) : "";

    switch (rule) {
      case "time":
        return "";
      case "phone":
        return isValidPhone(value) ? "" : "Enter a valid phone number with at least 10 digits.";
      case "email":
        return isValidEmail(value) ? "" : "Enter a valid email address, such as name@example.com.";
      case "passengers": {
        var passengers = Number(value);
        return Number.isInteger(passengers) && passengers >= 1 && passengers <= 60
          ? ""
          : "Enter a passenger count between 1 and 60.";
      }
      case "duration": {
        var duration = Number(value);
        return Number.isInteger(duration) && duration >= 1 && duration <= 72
          ? ""
          : "Enter a duration between 1 and 72 hours.";
      }
      case "luggageCount": {
        var bags = Number(value);
        return Number.isInteger(bags) && bags >= 0 && bags <= 60
          ? ""
          : "Enter a luggage count between 0 and 60.";
      }
      default:
        return "";
    }
  }

  function hideErrorSummary() {
    var summary = $("#formErrorSummary");
    if (summary) summary.classList.remove("is-visible");
  }

  function focusField(field) {
    if (!field) return;
    var target = field;
    if (field.type === "radio" && field.name) {
      var panel = field.closest("[data-panel]") || document;
      target = $('input[name="' + field.name + '"]', panel) || field;
    }
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  }

  function showErrorSummary(fields) {
    var summary = $("#formErrorSummary");
    var list = $("#formErrorList");
    if (!summary || !list) return;
    list.textContent = "";
    var seen = {};
    fields.forEach(function (field) {
      var key = field.name || field.id;
      if (!key || seen[key]) return;
      seen[key] = true;
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#" + (field.id || key);
      link.textContent = labelTextFor(field);
      link.addEventListener("click", function (event) {
        event.preventDefault();
        focusField(field);
      });
      item.appendChild(link);
      list.appendChild(item);
    });
    summary.classList.add("is-visible");
    summary.focus({ preventScroll: true });
  }

  function validateForm() {
    var panel = $('[data-panel="' + getCurrentTripType() + '"]');
    var invalid = [];
    if (panel) {
      $$("input, select, textarea", panel).forEach(function (field) {
        if (field.disabled || field.type === "hidden") return;
        if (field.type === "radio") {
          if (!field.hasAttribute("required")) return;
          var group = $('input[name="' + field.name + '"]:checked', panel);
          if (!group) {
            setFieldError(field, defaultErrorText(field));
            invalid.push(field);
          } else {
            $$('input[name="' + field.name + '"]', panel).forEach(clearFieldError);
          }
          return;
        }
        var message = validateField(field);
        if (message) {
          setFieldError(field, message);
          invalid.push(field);
        } else {
          clearFieldError(field);
        }
      });
    }
    var consent = $("#consent");
    if (consent) {
      if (!consent.checked) {
        setFieldError(consent, defaultErrorText(consent));
        invalid.push(consent);
      } else {
        clearFieldError(consent);
      }
    }
    return invalid;
  }

  /* ==========================================================================
     Google Places autocomplete (proxied through /api/places)
     ========================================================================== */
  var placesNotice = $("#placesNotice");
  var acControllers = new WeakMap();

  function showPlacesNotice(show) {
    if (!placesNotice) return;
    placesNotice.classList.toggle("is-visible", Boolean(show));
  }

  function initAutocomplete(input) {
    var listId = input.getAttribute("aria-controls");
    var list = listId ? document.getElementById(listId) : null;
    if (!list) return;
    var panel = input.closest("[data-panel]");
    var field = fieldWrap(input);
    var hidden = panel && input.id ? $('[data-place-id-for="' + input.id + '"]', panel) : null;
    var status = field ? $("[data-place-status]", field) : null;
    var items = [];
    var activeIndex = -1;

    function setStatus(message, kind) {
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", kind === "error");
      status.classList.toggle("is-ok", kind === "ok");
    }

    function clearList() {
      list.textContent = "";
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      items = [];
      activeIndex = -1;
    }

    function setActive(index) {
      if (!items.length) return;
      activeIndex = (index + items.length) % items.length;
      $$(".autocomplete-option", list).forEach(function (option, optionIndex) {
        var active = optionIndex === activeIndex;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-selected", active ? "true" : "false");
        if (active) {
          input.setAttribute("aria-activedescendant", option.id);
          option.scrollIntoView({ block: "nearest" });
        }
      });
    }

    function render(results) {
      list.textContent = "";
      items = results;
      activeIndex = -1;
      if (!results.length) {
        clearList();
        setStatus("No matching addresses. You can type the full address manually.", "");
        return;
      }
      results.forEach(function (result, index) {
        var option = document.createElement("li");
        option.className = "autocomplete-option";
        option.id = list.id + "-option-" + index;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        var primary = document.createElement("strong");
        primary.textContent = result.primary || result.description || "Address";
        option.appendChild(primary);
        if (result.secondary) {
          var secondary = document.createElement("small");
          secondary.textContent = result.secondary;
          option.appendChild(secondary);
        }
        option.addEventListener("mousedown", function (event) {
          event.preventDefault();
          select(result);
        });
        option.addEventListener("click", function (event) {
          event.preventDefault();
          select(result);
        });
        list.appendChild(option);
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setStatus("", "");
    }

    function select(result) {
      if (!result) return;
      input.value = result.description || result.primary || "";
      var chosen = input.value;
      if (hidden) hidden.value = result.placeId || "";
      clearList();
      clearFieldError(input);
      setStatus("Address selected.", "ok");
      if (!result.placeId) return;
      fetch(
        "/api/places?action=details&placeId=" +
          encodeURIComponent(result.placeId) +
          "&sessionToken=" +
          encodeURIComponent(SESSION_TOKEN),
        { headers: { Accept: "application/json" } }
      )
        .then(function (response) {
          if (!response.ok) throw new Error("Details unavailable");
          return response.json();
        })
        .then(function (data) {
          if (data && data.address && input.value === chosen) input.value = data.address;
          if (data && data.placeId && hidden) hidden.value = data.placeId;
        })
        .catch(function () {
          /* Keep the selected description; manual entry still works. */
        });
    }

    function requestSuggestions(query) {
      var previous = acControllers.get(input);
      if (previous) previous.abort();
      var controller = new AbortController();
      acControllers.set(input, controller);
      fetch(
        "/api/places?action=autocomplete&input=" +
          encodeURIComponent(query) +
          "&sessionToken=" +
          encodeURIComponent(SESSION_TOKEN),
        { headers: { Accept: "application/json" }, signal: controller.signal }
      )
        .then(function (response) {
          if (response.status === 429) {
            clearList();
            setStatus("Too many address lookups. Please type the address manually.", "error");
            return null;
          }
          if (!response.ok) throw new Error("Autocomplete unavailable");
          return response.json();
        })
        .then(function (data) {
          if (!data) return;
          render(Array.isArray(data.results) ? data.results : []);
        })
        .catch(function (error) {
          if (error && error.name === "AbortError") return;
          clearList();
          setStatus("Suggestions are unavailable. Please type the full address manually.", "error");
        });
    }

    var runSuggestions = debounce(function () {
      var query = cleanText(input.value);
      if (input.readOnly) return;
      if (placesAvailable === false) {
        clearList();
        return;
      }
      if (query.length < 3) {
        clearList();
        setStatus("", "");
        return;
      }
      setStatus("Looking up addresses…", "");
      requestSuggestions(query);
    }, 280);

    on(input, "input", function () {
      if (hidden) hidden.value = "";
      clearFieldError(input);
      setStatus("", "");
      runSuggestions();
    });

    on(input, "keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (list.hidden || !items.length) return;
        event.preventDefault();
        setActive(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
        return;
      }
      if (event.key === "Enter") {
        if (!list.hidden && activeIndex >= 0 && items[activeIndex]) {
          event.preventDefault();
          select(items[activeIndex]);
        }
        return;
      }
      if (event.key === "Escape") {
        if (!list.hidden) {
          event.preventDefault();
          clearList();
        }
      }
    });

    on(input, "blur", function () {
      window.setTimeout(clearList, 160);
    });

    on(input, "focus", function () {
      if (!list.hidden) input.setAttribute("aria-expanded", "true");
    });
  }

  function initPlaces() {
    $$("[data-autocomplete]").forEach(initAutocomplete);

    fetch("/api/places?action=status", { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Places status unavailable");
        return response.json();
      })
      .then(function (data) {
        placesAvailable = Boolean(data && data.configured);
        showPlacesNotice(!placesAvailable);
      })
      .catch(function () {
        placesAvailable = false;
        showPlacesNotice(true);
      });
  }

  /* ==========================================================================
     Current location
     ========================================================================== */
  function initLocateButtons() {
    if (!geoSupported) return;
    $$("[data-locate]").forEach(function (button) {
      button.hidden = false;
      on(button, "click", function () {
        useCurrentLocation(button);
      });
    });
  }

  function useCurrentLocation(button) {
    var inputId = button.getAttribute("data-locate");
    var input = inputId ? document.getElementById(inputId) : null;
    if (!input || input.readOnly) return;
    var field = fieldWrap(input);
    var status = field ? $("[data-place-status]", field) : null;
    var panel = input.closest("[data-panel]");
    var hidden = panel && input.id ? $('[data-place-id-for="' + input.id + '"]', panel) : null;

    function setStatus(message, kind) {
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", kind === "error");
      status.classList.toggle("is-ok", kind === "ok");
    }

    if (!navigator.geolocation) {
      setStatus("Location is not supported by this browser. Please type your address.", "error");
      return;
    }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setStatus("Location lookup needs a secure HTTPS connection. Please type your address.", "error");
      return;
    }

    button.classList.add("is-loading");
    button.disabled = true;
    setStatus("Finding your location…", "");

    navigator.geolocation.getCurrentPosition(
      function (position) {
        var lat = position.coords.latitude;
        var lng = position.coords.longitude;

        function finishWithCoordinates() {
          input.value = "Current location (" + lat.toFixed(5) + ", " + lng.toFixed(5) + ")";
          if (hidden) hidden.value = "";
          clearFieldError(input);
          setStatus("Location added as coordinates. Add a landmark if it helps the driver.", "");
          button.classList.remove("is-loading");
          button.disabled = false;
        }

        if (placesAvailable === false) {
          finishWithCoordinates();
          return;
        }

        fetch(
          "/api/places?action=reverse&lat=" +
            encodeURIComponent(lat) +
            "&lng=" +
            encodeURIComponent(lng),
          { headers: { Accept: "application/json" } }
        )
          .then(function (response) {
            if (!response.ok) throw new Error("Reverse lookup unavailable");
            return response.json();
          })
          .then(function (data) {
            if (!data || !data.address) throw new Error("No address found");
            input.value = data.address;
            if (hidden) hidden.value = data.placeId || "";
            clearFieldError(input);
            setStatus("Using your current location.", "ok");
          })
          .catch(finishWithCoordinates)
          .then(function () {
            button.classList.remove("is-loading");
            button.disabled = false;
          });
      },
      function (error) {
        var message = "Location could not be determined. Please type your address.";
        if (error && error.code === 1) {
          message = "Location permission was denied. Please type your address instead.";
        } else if (error && error.code === 3) {
          message = "Location lookup timed out. Please type your address instead.";
        }
        setStatus(message, "error");
        button.classList.remove("is-loading");
        button.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /* ==========================================================================
     Enquiry payload, message and submission
     ========================================================================== */
  var enquiryForm = $("#enquiryForm");
  var formStartedAt = $("#formStartedAt");
  var submitBtn = $("#submitBtn");
  var isSubmitting = false;

  if (formStartedAt && !formStartedAt.value) formStartedAt.value = String(Date.now());

  function collectPayload() {
    var type = getCurrentTripType();
    var panel = $('[data-panel="' + type + '"]');
    var payload = {
      tripType: type,
      tripLabel: TRIP_LABELS[type],
      source: "website",
      pageUrl: location.href,
      startedAt: Number(formStartedAt && formStartedAt.value) || 0,
      submittedAt: Date.now(),
      sessionToken: SESSION_TOKEN,
      consent: false
    };

    if (panel) {
      $$("[data-key]", panel).forEach(function (field) {
        if (field.disabled) return;
        var key = field.getAttribute("data-key");
        if (!key) return;
        if (field.type === "radio") {
          if (field.checked) payload[key] = field.value;
          return;
        }
        if (field.type === "checkbox") {
          payload[key] = field.checked;
          return;
        }
        payload[key] = cleanText(field.value);
      });
    }

    var consent = $("#consent");
    payload.consent = Boolean(consent && consent.checked);
    if (!payload.name && payload.contactPerson) payload.name = payload.contactPerson;
    return payload;
  }

  function buildMessage(payload) {
    var lines = ["*New booking enquiry - Urbania Cabs Bangalore*", "", "Trip type: " + payload.tripLabel];

    function add(label, value) {
      var text = cleanText(value);
      if (text) lines.push(label + ": " + text);
    }

    if (payload.tripType === "outstation") {
      add("Pickup", payload.pickup);
      add("Drop", payload.drop);
      add("Pickup date", formatDate(payload.pickupDate));
      add("Pickup time", formatTime(payload.pickupTime));
      add("Journey", payload.tripMode);
      if (payload.tripMode === "Round trip") add("Return date", formatDate(payload.returnDate));
      add("Passengers", payload.passengers);
      add("Luggage", payload.luggage);
      add("Vehicle", payload.vehicle);
    } else if (payload.tripType === "local") {
      add("Pickup", payload.pickup);
      add("Date", formatDate(payload.date));
      add("Start time", formatTime(payload.startTime));
      add("Duration", payload.duration ? payload.duration + " hours" : "");
      add("Passengers", payload.passengers);
      add("Vehicle", payload.vehicle);
    } else if (payload.tripType === "airport") {
      add("Direction", payload.direction);
      add("Pickup", payload.pickup);
      add("Drop", payload.drop);
      add("Flight", payload.flightNumber);
      add("Travel date", formatDate(payload.travelDate));
      add("Travel time", formatTime(payload.travelTime));
      add("Passengers", payload.passengers);
      add("Luggage", payload.luggage ? payload.luggage + " bags" : "");
      add("Vehicle", payload.vehicle);
    } else {
      add("Company", payload.company);
      add("Contact person", payload.contactPerson);
      add("Pickup", payload.pickup);
      add("Destination", payload.destination);
      add("Travel start", formatDate(payload.travelStart));
      add("Travel end", formatDate(payload.travelEnd));
      add("Passengers", payload.passengers);
      add("Vehicle", payload.vehicle);
    }

    if (payload.tripType !== "corporate") add("Name", payload.name);
    add("Phone", payload.phone);
    add("Email", payload.email);
    add("Notes", payload.notes);
    lines.push("");
    lines.push("Sent from urbaniacabsbanglore.com");
    return lines.join("\n");
  }

  function renderStatus(kind, title, message, waUrl, waLabel) {
    var status = $("#formStatus");
    if (!status) return;
    status.textContent = "";
    status.className = "form-status";
    if (!title) return;
    status.classList.add("is-visible");
    if (kind) status.classList.add("form-status--" + kind);
    var strong = document.createElement("strong");
    strong.textContent = title;
    status.appendChild(strong);
    if (message) {
      var paragraph = document.createElement("p");
      paragraph.textContent = message;
      status.appendChild(paragraph);
    }
    if (waUrl) {
      var actions = document.createElement("div");
      actions.className = "form-status__actions";
      var link = document.createElement("a");
      link.className = "btn btn--whatsapp btn--sm";
      link.href = waUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = waLabel || "Open WhatsApp";
      actions.appendChild(link);
      status.appendChild(actions);
    }
    status.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }

  function setSubmitting(active) {
    isSubmitting = active;
    if (!submitBtn) return;
    submitBtn.classList.toggle("is-loading", active);
    submitBtn.disabled = active;
    submitBtn.setAttribute("aria-busy", active ? "true" : "false");
    var label = $(".btn__label", submitBtn);
    if (label) label.textContent = active ? "Preparing enquiry…" : "Send enquiry";
  }

  function openWhatsAppTab() {
    var tab = null;
    try {
      tab = window.open("", "_blank");
    } catch (error) {
      tab = null;
    }
    if (tab) {
      try {
        tab.document.title = "Opening WhatsApp";
        tab.document.body.textContent = "Preparing your WhatsApp message…";
      } catch (error) {
        /* Cross-origin or blocked document access is safe to ignore. */
      }
    }
    return tab;
  }

  function sendToWhatsAppTab(tab, url) {
    if (!tab) return false;
    try {
      tab.location.href = url;
      return true;
    } catch (error) {
      return false;
    }
  }

  on(enquiryForm, "input", function (event) {
    var field = event.target;
    if (field && field.matches && field.matches("input, select, textarea")) {
      if (field.type !== "checkbox" || field.id === "consent") clearFieldError(field);
    }
    hideErrorSummary();
  });
  on(enquiryForm, "change", function (event) {
    var field = event.target;
    if (field && field.matches && field.matches("input, select, textarea")) {
      if (field.type !== "checkbox" || field.id === "consent") clearFieldError(field);
    }
  });

  on(enquiryForm, "submit", function (event) {
    event.preventDefault();
    if (isSubmitting) return;
    hideErrorSummary();

    var invalid = validateForm();
    if (invalid.length) {
      showErrorSummary(invalid);
      showToast("Please check the highlighted fields.");
      focusField(invalid[0]);
      return;
    }

    var honeypot = $("#website");
    if (honeypot && cleanText(honeypot.value)) {
      renderStatus("error", "Enquiry not sent", "Please clear the additional website field and try again.");
      return;
    }

    var started = Number(formStartedAt && formStartedAt.value) || 0;
    if (started && Date.now() - started < 1500) {
      renderStatus("warning", "One moment", "Please review your details and press send again.");
      return;
    }

    var payload = collectPayload();
    var message = buildMessage(payload);
    var whatsappUrl = waLink(message);
    var signature = JSON.stringify([
      payload.tripType,
      payload.name,
      payload.phone,
      payload.pickup,
      payload.drop,
      payload.pickupDate,
      payload.date,
      payload.travelDate,
      payload.travelStart
    ]);

    if (
      lastSubmission.ok &&
      lastSubmission.signature === signature &&
      Date.now() - lastSubmission.time < 90000
    ) {
      renderStatus(
        "warning",
        "Enquiry already sent",
        "This enquiry went through a moment ago. Please wait for our reply, or call us on +91 96323 45415."
      );
      return;
    }

    var whatsappTab = openWhatsAppTab();
    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, 15000);

    setSubmitting(true);
    renderStatus("", "", "");

    fetch("/api/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { response: response, data: data || {} };
          });
      })
      .then(function (result) {
        window.clearTimeout(timeout);
        var response = result.response;
        var data = result.data;
        var ok = response.ok && data.ok !== false;

        if (ok) {
          lastSubmission = { signature: signature, time: Date.now(), ok: true };
          try {
            sessionStorage.setItem("uc_last_enquiry", String(Date.now()));
          } catch (error) {
            /* Storage can be blocked in private mode. */
          }

          var destination = data.whatsappUrl || whatsappUrl;
          var tabOpened = sendToWhatsAppTab(whatsappTab, destination);

          if (data.notified) {
            renderStatus(
              "success",
              "Enquiry sent to our team",
              tabOpened
                ? "We have your details. WhatsApp is opening with a copy of the enquiry so you can continue the conversation there."
                : "We have your details. Use the button below to open WhatsApp with a copy of the enquiry and continue the conversation.",
              destination,
              "Open WhatsApp"
            );
          } else {
            renderStatus(
              "warning",
              "Finish sending in WhatsApp",
              tabOpened
                ? "WhatsApp is opening with your details. Press send there so our team receives the enquiry directly."
                : "Use the button below to open WhatsApp with your details, then press send so our team receives the enquiry.",
              destination,
              "Open WhatsApp"
            );
          }
          return;
        }

        if (whatsappTab) {
          try {
            whatsappTab.close();
          } catch (error) {
            /* Ignore. */
          }
        }

        if (response.status === 429) {
          renderStatus(
            "warning",
            "Too many enquiries",
            "Please wait a few minutes before sending another enquiry, or contact us directly on WhatsApp.",
            whatsappUrl,
            "Message us on WhatsApp"
          );
          return;
        }

        if (response.status === 400) {
          var details = Array.isArray(data.errors)
            ? data.errors.map(function (item) {
                return item.message || item;
              })
            : [];
          renderStatus(
            "error",
            "Please check your details",
            details.length
              ? details.join(" ")
              : "Some details could not be accepted. Please review the form and try again."
          );
          return;
        }

        renderStatus(
          "warning",
          "We could not confirm the enquiry",
          "Our notification service did not respond. Please open WhatsApp and press send so your enquiry reaches us directly.",
          whatsappUrl,
          "Open WhatsApp"
        );
      })
      .catch(function (error) {
        window.clearTimeout(timeout);
        var timedOut = error && error.name === "AbortError";
        var tabOpened = sendToWhatsAppTab(whatsappTab, whatsappUrl);
        renderStatus(
          "warning",
          timedOut ? "The request took too long" : "We could not reach the enquiry service",
          tabOpened
            ? "WhatsApp is opening with your details. Press send there so your enquiry reaches our team directly."
            : "Please open WhatsApp with the button below and press send so your enquiry reaches our team directly.",
          whatsappUrl,
          "Open WhatsApp"
        );
      })
      .then(function () {
        setSubmitting(false);
      });
  });

  /* ==========================================================================
     Init
     ========================================================================== */
  setTripType(getCurrentTripType());
  initLocateButtons();
  initPlaces();
})();
