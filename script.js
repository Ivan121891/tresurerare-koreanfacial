(function () {
  "use strict";

  const TEST = new URLSearchParams(location.search).get('test') === '1';

  // ------- Configuration -------
  const SERVICE_NAME = "Korean Facial";
  const SERVICE_DURATION_MIN = 60;

  // GHL credentials
  const GHL = {
    locationId: 'MuLba5LCh5hOJqGAEL19',
    calendarId: 'A9XQfSeTMvmh7bkcbMz5',
    userId:     '2tQreqXcDpaAiSBqlK7T',
    apiKey:     'pit-639678d3-a746-4469-bcea-914e1c1f5a13',
    apiBase:    'https://services.leadconnectorhq.com',
    version:    '2021-07-28',
  };

  const BUSINESS_TZ = "America/Los_Angeles";

  // Build specific time slots
  function buildAllSlots() {
    return [
      { label: '9:00 AM',  hour: 9,  minute: 0 },
      { label: '10:00 AM', hour: 10, minute: 0 },
      { label: '11:00 AM', hour: 11, minute: 0 },
      { label: '12:00 PM', hour: 12, minute: 0 },
      { label: '1:00 PM',  hour: 13, minute: 0 },
      { label: '2:00 PM',  hour: 14, minute: 0 },
      { label: '3:00 PM',  hour: 15, minute: 0 },
      { label: '4:00 PM',  hour: 16, minute: 0 },
      { label: '5:00 PM',  hour: 17, minute: 0 },
    ];
  }
  let ALL_SLOTS = buildAllSlots();

  const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const STEPS = ["date", "time", "details", "confirmed"];

  // ------- State -------
  const today = startOfDay(new Date());
  let selectedDate = null;
  let selectedTime = null;

  // ------- Elements -------
  const $ = (id) => document.getElementById(id);
  const dateGrid = $("date-grid");
  const morningGrid = $("morning-grid");
  const afternoonGrid = $("afternoon-grid");

  const timeSummary    = $("time-summary");
  const detailsSummary = $("details-summary");
  const detailsForm    = $("details-form");
  const submitBtn      = $("submit-btn");
  const btnLabel       = submitBtn.querySelector(".btn-label");
  const spinner        = submitBtn.querySelector(".spinner");
  const errorText      = $("error-text");
  const resetBtn       = $("reset-btn");
  const gcalLink       = $("gcal-link");
  const confirmCard    = $("confirm-card");

  // ------- Helpers -------
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  function offsetMinutesForTz(date, tz) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    const parts = dtf.formatToParts(date);
    const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    const asUtc = Date.UTC(
      get("year"), get("month") - 1, get("day"),
      get("hour"), get("minute"), get("second"),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  function dateFromWallTime(year, month, day, hour, minute, tz) {
    const approx = new Date(Date.UTC(year, month, day, hour, minute));
    const off = offsetMinutesForTz(approx, tz);
    return new Date(approx.getTime() - off * 60000);
  }

  function isoInTz(date, tz) {
    const off = offsetMinutesForTz(date, tz);
    const wall = new Date(date.getTime() + off * 60000);
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
           `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}` +
           `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }
  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function formatLongDate(d) {
    return d.toLocaleDateString('en-US', {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }

  // ------- Step navigation -------
  function showStep(step) {
    STEPS.forEach((s) => {
      const el = $("step-" + s);
      if (el) el.classList.toggle("hidden", s !== step);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ------- Calendar render -------
  function renderMonth() {
    dateGrid.innerHTML = "";

    const cells = [];
    const cursor = new Date(today);
    for (let i = 0; i < 6; i++) {
      cells.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    cells.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-cell";
      if (sameDay(d, selectedDate)) btn.classList.add("selected");

      const dow = document.createElement("span");
      dow.className = "dow";
      dow.textContent = DOW_SHORT[d.getDay()];

      const day = document.createElement("span");
      day.className = "day";
      day.textContent = String(d.getDate());

      btn.appendChild(dow);
      btn.appendChild(day);

      btn.addEventListener("click", () => selectDate(d));
      dateGrid.appendChild(btn);
    });
  }

  function renderTimes() {
    const now = new Date();
    const isToday = selectedDate && sameDay(selectedDate, today);

    function filterPast(slots) {
      if (!isToday) return slots;
      return slots.filter(s => {
        const slotTime = dateFromWallTime(
          selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(),
          s.hour, s.minute, BUSINESS_TZ
        );
        return slotTime.getTime() > now.getTime();
      });
    }

    // Morning block (9 AM - 11 AM)
    const morning = ALL_SLOTS.filter(s => s.hour >= 9 && s.hour <= 11);
    const morningAvail = filterPast(morning);
    morningGrid.innerHTML = "";
    if (morningAvail.length > 0) {
      morningAvail.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "time-cell";
        if (selectedTime && selectedTime.label === s.label) b.classList.add("selected");
        b.textContent = s.label;
        b.addEventListener("click", () => selectTime(s));
        morningGrid.appendChild(b);
      });
    } else {
      morningGrid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available morning slots</p>';
    }

    // Afternoon block (12 PM - 5 PM)
    const afternoon = ALL_SLOTS.filter(s => s.hour >= 12 && s.hour <= 17);
    const afternoonAvail = filterPast(afternoon);
    afternoonGrid.innerHTML = "";
    if (afternoonAvail.length > 0) {
      afternoonAvail.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "time-cell";
        if (selectedTime && selectedTime.label === s.label) b.classList.add("selected");
        b.textContent = s.label;
        b.addEventListener("click", () => selectTime(s));
        afternoonGrid.appendChild(b);
      });
    } else {
      afternoonGrid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available afternoon slots</p>';
    }
  }

  // ------- Selection handlers -------
  function selectDate(d) {
    selectedDate = startOfDay(d);
    selectedTime = null;
    renderMonth();
    renderTimes();
    timeSummary.textContent = formatLongDate(selectedDate);
    showStep("time");
    track("AddToCart", { content_name: SERVICE_NAME });
  }

  function selectTime(slot) {
    selectedTime = slot;
    renderTimes();
    detailsSummary.textContent =
      `${formatLongDate(selectedDate)} • ${selectedTime.label}`;
    showStep("details");
    track("InitiateCheckout", { content_name: SERVICE_NAME });
  }

  function track(event, params) {
    if (typeof window.fbq === "function") {
      try { window.fbq("trackSingle", "1178133073434960", event, params || {}); } catch (_) {}
    }
  }
  function trackDedicated(event, params, eventId) {
    if (typeof window.fbq === "function") {
      try {
        var opts = eventId ? { eventID: eventId } : {};
        window.fbq("trackSingle", "882967721047979", event, params || {}, opts);
      } catch (_) {}
    }
  }
  (function fireViewContent() {
    trackDedicated("ViewContent", { content_name: SERVICE_NAME });
  })();

  // ------- Back buttons -------
  document.querySelectorAll(".back-btn").forEach((btn) => {
    btn.addEventListener("click", () => showStep(btn.dataset.back));
  });

  // ------- GHL API call -------
  async function ghlFetch(path, body) {
    const res = await fetch(GHL.apiBase + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GHL.apiKey,
        'Version': GHL.version,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
    return data;
  }

  // ------- Form submit -------
  detailsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorText.classList.add("hidden");

    const name  = $("name").value.trim();
    const email = $("email").value.trim();
    const phone = $("phone").value.trim();

    if (!name || !email || !phone || !selectedDate || !selectedTime) {
      errorText.textContent = "Please fill in all fields.";
      errorText.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    btnLabel.textContent = "Booking";
    spinner.classList.remove("hidden");

    const start = dateFromWallTime(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(),
      selectedTime.hour, selectedTime.minute, BUSINESS_TZ,
    );
    const end = new Date(start.getTime() + SERVICE_DURATION_MIN * 60000);
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ");

    try {
      // 1) Upsert contact in GHL
      // Persist the lead + chosen slot BEFORE any GHL call (non-blocking).
      var leadId = null;
      try {
        const _leadRes = await fetch('/api/lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({
            locationId: GHL.locationId,
            client: location.hostname.split('.')[0].split('-')[0],
            page: location.hostname,
            treatment: SERVICE_NAME,
            calendarId: GHL.calendarId,
            startTime: isoInTz(start, BUSINESS_TZ),
            endTime: isoInTz(end, BUSINESS_TZ),
            name, email, phone,
            fbclid: (new URLSearchParams(location.search)).get('fbclid') || undefined,
            fbp: (document.cookie.match(/_fbp=([^;]+)/) || [])[1],
            fbc: (document.cookie.match(/_fbc=([^;]+)/) || [])[1],
            test: TEST,
          }),
        });
        const _leadJson = await _leadRes.json().catch(function () { return {}; });
        leadId = _leadJson.leadId || null;
      } catch (_) { /* never block booking on lead persistence */ }
      const contactRes = await ghlFetch('/contacts/upsert', {
        locationId: GHL.locationId,
        firstName: (TEST ? "[TEST] " : "") + (firstName || name),
        lastName: lastName || '-',
        email,
        phone,
        source: 'Korean Facial LP',
        tags: TEST ? ['Korean Facial', 'TEST-DONOTCOUNT'] : ['Korean Facial'],
      });
      const contactId = contactRes.contact?.id || contactRes.id;

      // 2) Book appointment
      // selectedTimezone tells GHL which timezone the slot was picked in.
      const _aptRes = await ghlFetch('/calendars/events/appointments', {
        calendarId: GHL.calendarId,
        ignoreFreeSlotValidation: true,
        locationId: GHL.locationId,
        contactId,
        assignedUserId: GHL.userId,
        startTime:      isoInTz(start, BUSINESS_TZ),
        endTime:        isoInTz(end,   BUSINESS_TZ),
        title:          `${name} — Korean Facial`,
        selectedTimezone: BUSINESS_TZ,
      });

      const appointmentId = (_aptRes && (_aptRes.id || _aptRes.appointmentId || (_aptRes.appointment && _aptRes.appointment.id))) || null;
      // Record the TRUE outcome: ghlFetch throws on non-2xx (-> outer catch ->
      // 'fail'), so reaching here means 2xx; a missing id is a captured lead,
      // not a booking — record 'lead_only' so the store never over-counts success.
      const bookingStatus = appointmentId ? 'success' : 'lead_only';
      try {
        fetch('/api/lead/result', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ leadId: leadId, locationId: GHL.locationId, status: bookingStatus, appointmentId: appointmentId, eventId: (typeof eventId !== 'undefined' ? eventId : null), scheduleFired: (!TEST && bookingStatus === 'success'), test: TEST }),
        }).catch(function () {});
      } catch (_) {}

      track("Lead", { content_name: SERVICE_NAME });
      if (!TEST && bookingStatus === 'success') track("Schedule", { content_name: SERVICE_NAME });
      if (!TEST && bookingStatus === 'success') trackDedicated("Schedule", { content_name: SERVICE_NAME });

      renderConfirmation({
        service: SERVICE_NAME,
        name, email, phone,
        time: selectedTime.label,
      });
      showStep("confirmed");
    } catch (err) {
      console.error("GHL booking error", err);
      try {
        fetch('/api/lead/result', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ leadId: leadId, locationId: GHL.locationId, status: 'fail', error: (err && err.message) ? err.message : String(err), test: TEST }),
        }).catch(function () {});
      } catch (_) {}
      const detail = (err && err.message) ? err.message : "Booking failed. Please try again or call us.";
      errorText.textContent = detail;
      errorText.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      btnLabel.textContent = "Schedule Appointment";
      spinner.classList.add("hidden");
    }
  });

  // ------- Confirmation rendering -------
  function renderConfirmation(p) {
    confirmCard.innerHTML = `
      <div class="row"><span class="label">Service</span><span>${escapeHtml(p.service)}</span></div>
      <div class="row"><span class="label">Date</span><span>${escapeHtml(formatLongDate(selectedDate))}</span></div>
      <div class="row"><span class="label">Time</span><span>${escapeHtml(p.time)}</span></div>
      <div class="row"><span class="label">Name</span><span>${escapeHtml(p.name)}</span></div>
      <div class="row"><span class="label">Email</span><span>${escapeHtml(p.email)}</span></div>
      <div class="row"><span class="label">Phone</span><span>${escapeHtml(p.phone)}</span></div>
    `;
    gcalLink.href = buildGCalUrl(p);
  }

  function buildGCalUrl(p) {
    const start = dateFromWallTime(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(),
      selectedTime.hour, selectedTime.minute, BUSINESS_TZ,
    );
    const end = new Date(start.getTime() + SERVICE_DURATION_MIN * 60000);
    const fmt = (d) =>
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z";
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: SERVICE_NAME,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: `Booking for ${p.name} (${p.email}, ${p.phone}).`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ------- Reset -------
  resetBtn.addEventListener("click", () => {
    selectedDate = null;
    selectedTime = null;
    detailsForm.reset();
    renderMonth();
    showStep("date");
  });

  // ------- Init -------
  renderMonth();
  renderTimes();
  showStep("date");
})();