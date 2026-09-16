(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var adminToken = new URLSearchParams(location.search).get("admin") || "";
  var apiBase = (config.apiBaseUrl || "").replace(/\/$/, "");
  var liveMode = !!apiBase;

  var alumni = (window.ALUMNI || []).slice();
  var hasContactData = alumni.some(function (a) { return a.email || a.facebook || a.birthday; });

  var state = { query: "", division: "", onlyWhatsapp: false, onlyContact: false, sortKey: "name", sortDir: 1, editingId: null };

  var $ = function (id) { return document.getElementById(id); };

  // ---- Header -----------------------------------------------------------
  $("schoolName").textContent = config.schoolName || "";
  $("batchLabel").textContent = config.batchLabel || "Alumni";
  $("tagline").textContent = config.tagline || "";
  document.title = (config.schoolName ? config.schoolName + " · " : "") + (config.batchLabel || "Alumni") + " · Alumni Network";

  if (config.whatsappInviteUrl) {
    var wa = $("whatsappLink");
    wa.href = config.whatsappInviteUrl;
    wa.hidden = false;
  }

  var mailto = buildMailto();
  $("updateMailto").href = mailto;
  if (!config.organizerEmail) { $("updateMailto").hidden = true; }
  if (liveMode) {
    $("update").querySelector("p").textContent =
      "Find your row below and click Edit - changes save immediately, no email needed. " +
      "If you're not listed at all, email the organiser instead.";
  }

  function buildMailto() {
    if (!config.organizerEmail) { return "#"; }
    var subject = (config.batchLabel || "Alumni") + " - update my details";
    var body = [
      "Name:", "Division (A-F):", "Email:", "Phone / WhatsApp:", "Facebook:", "Birthday:",
      "Add me to the batch WhatsApp group (yes/no):", "", "Anything else:"
    ].join("\n");
    return "mailto:" + config.organizerEmail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  // ---- Boot ---------------------------------------------------------------
  if (liveMode) {
    fetchLiveData().then(init).catch(function (err) {
      console.error("Failed to load live data, falling back to the bundled snapshot:", err);
      liveMode = false;
      init();
    });
  } else {
    init();
  }

  function fetchLiveData() {
    var url = apiBase + (adminToken ? "/api/alumni/full?token=" + encodeURIComponent(adminToken) : "/api/alumni");
    return fetch(url).then(function (res) {
      if (!res.ok) { throw new Error("HTTP " + res.status); }
      return res.json();
    }).then(function (rows) {
      alumni = rows;
      hasContactData = alumni.some(function (a) { return a.email || a.facebook || a.birthday; });
    });
  }

  function init() {
    renderStats();
    renderModeNote();
    renderFilters();
    bindToolbar();
    bindSorting();
    bindEditing();

    if (!hasContactData) {
      document.body.classList.add("hide-contact");
      if (!liveMode) { $("privacyNote").hidden = false; }
      $("onlyContact").closest(".toggle").hidden = true;
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncLayoutMode, 150);
    });

    render();
  }

  // Admin view (7 columns) and public view (4 columns) overflow the table
  // at different widths, so a fixed CSS breakpoint can't cover both -
  // measure the actual rendered width instead and switch to stacked cards
  // whenever the table would otherwise need horizontal scrolling (which
  // hides the Edit button off-screen with no visual hint that it's there).
  function syncLayoutMode() {
    var wrap = document.querySelector(".table-wrap");
    var table = $("alumniTable");
    if (!wrap || !table) { return; }
    wrap.classList.remove("cards-mode");
    var overflowing = table.scrollWidth > wrap.clientWidth + 1;
    wrap.classList.toggle("cards-mode", overflowing);
  }

  function renderModeNote() {
    var note = $("modeNote");
    if (!note) { return; }
    if (liveMode && adminToken) {
      note.textContent = "Admin view - live data, full contact details, edits save instantly.";
      note.hidden = false;
    } else if (liveMode) {
      note.textContent = "Live directory - contact details aren't shown publicly. Click Edit on your row to add or update yours; only organisers with the admin link can see them.";
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  // ---- Stats ------------------------------------------------------------
  var divisions, inGroup, withEmail;

  function renderStats() {
    divisions = unique(alumni.map(function (a) { return a.division; })).sort();
    inGroup = alumni.filter(function (a) { return a.whatsappGroup === true; }).length;
    withEmail = alumni.filter(function (a) { return a.email; }).length;

    var stats = [
      { value: alumni.length, label: "Classmates", sub: divisions.length + " divisions" },
      { value: inGroup, label: "In WhatsApp group", sub: pct(inGroup, alumni.length) + " of the batch" },
      hasContactData
        ? { value: withEmail, label: "With email address", sub: (alumni.length - withEmail) + " still to reach" }
        : { value: alumni.length - inGroup, label: "Still to reconnect", sub: "not yet in the group" },
      { value: divisions.length, label: "Divisions", sub: divisions.map(function (d) { return "X-" + d; }).join(" · ") }
    ];
    $("stats").innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="value">' + s.value + '</div><div class="label">' + esc(s.label) + '</div><div class="sub">' + esc(s.sub) + "</div></div>";
    }).join("");
  }

  // ---- Filters ----------------------------------------------------------
  function renderFilters() {
    var chips = $("divisionChips");
    chips.innerHTML = ['<button type="button" class="chip" data-division="" aria-pressed="true">All</button>']
      .concat(divisions.map(function (d) {
        return '<button type="button" class="chip" data-division="' + esc(d) + '" aria-pressed="false">X-' + esc(d) + "</button>";
      })).join("");
    chips.addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) { return; }
      state.division = btn.getAttribute("data-division");
      Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function (c) {
        c.setAttribute("aria-pressed", String(c === btn));
      });
      render();
    });
  }

  function bindToolbar() {
    $("search").addEventListener("input", function (e) { state.query = e.target.value.trim().toLowerCase(); render(); });
    $("onlyWhatsapp").addEventListener("change", function (e) { state.onlyWhatsapp = e.target.checked; render(); });
    $("onlyContact").addEventListener("change", function (e) { state.onlyContact = e.target.checked; render(); });
  }

  // ---- Sorting ----------------------------------------------------------
  function bindSorting() {
    var headers = document.querySelectorAll("th.sortable");
    Array.prototype.forEach.call(headers, function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) { state.sortDir = -state.sortDir; } else { state.sortKey = key; state.sortDir = 1; }
        Array.prototype.forEach.call(headers, function (h) { h.removeAttribute("aria-sort"); });
        th.setAttribute("aria-sort", state.sortDir === 1 ? "ascending" : "descending");
        render();
      });
    });
  }

  // ---- Editing (live mode only) ------------------------------------------
  function bindEditing() {
    if (!liveMode) { return; }
    var body = $("alumniBody");

    body.addEventListener("click", function (e) {
      var trigger = e.target.closest(".edit-trigger");
      if (trigger) {
        state.editingId = trigger.getAttribute("data-id");
        render();
        return;
      }
      var cancel = e.target.closest(".edit-cancel");
      if (cancel) {
        state.editingId = null;
        render();
      }
    });

    body.addEventListener("submit", function (e) {
      var form = e.target.closest(".edit-form");
      if (!form) { return; }
      e.preventDefault();
      saveEdit(form);
    });
  }

  function saveEdit(form) {
    var id = form.getAttribute("data-id");
    var waVal = form.whatsappGroup.value;
    var payload = {
      whatsappGroup: waVal === "yes" ? true : waVal === "no" ? false : null,
      email: form.email.value.trim(),
      facebook: form.facebook.value.trim(),
      birthday: form.birthday.value.trim()
    };
    var statusEl = form.querySelector(".edit-status");
    var saveBtn = form.querySelector(".btn-save");
    saveBtn.disabled = true;
    statusEl.hidden = false;
    statusEl.className = "edit-status";
    statusEl.textContent = "Saving…";

    fetch(apiBase + "/api/alumni/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok) { throw new Error((result.data && result.data.error) || "Save failed"); }
      var idx = alumni.findIndex(function (r) { return r.id === id; });
      if (idx !== -1) {
        alumni[idx] = Object.assign({}, alumni[idx], result.data, payload);
      }
      state.editingId = null;
      renderStats();
      render();
    }).catch(function (err) {
      statusEl.textContent = err.message || "Something went wrong. Try again.";
      statusEl.className = "edit-status edit-status-error";
      saveBtn.disabled = false;
    });
  }

  // ---- Render -----------------------------------------------------------
  function render() {
    var rows = alumni.filter(function (a) {
      if (state.division && a.division !== state.division) { return false; }
      if (state.onlyWhatsapp && a.whatsappGroup !== true) { return false; }
      if (state.onlyContact && !(a.email || a.facebook || a.birthday)) { return false; }
      if (state.query) {
        var hay = [a.name, "x-" + a.division, a.division, a.email, a.facebook, a.notes].join(" ").toLowerCase();
        if (hay.indexOf(state.query) === -1) { return false; }
      }
      return true;
    });

    rows.sort(function (x, y) {
      var a = sortValue(x[state.sortKey]), b = sortValue(y[state.sortKey]);
      if (a < b) { return -state.sortDir; }
      if (a > b) { return state.sortDir; }
      return x.name.localeCompare(y.name);
    });

    $("alumniBody").innerHTML = rows.map(rowHtml).join("");
    $("emptyState").hidden = rows.length > 0;
    $("resultCount").textContent = rows.length === alumni.length
      ? "Showing all " + rows.length + " classmates"
      : "Showing " + rows.length + " of " + alumni.length + " classmates";
    syncLayoutMode();
  }

  function rowHtml(a) {
    var flag = a.possibleDuplicate ? '<span class="flag" title="This name appears more than once in the list">check</span>' : "";
    var note = a.notes ? '<span class="note">' + esc(a.notes) + "</span>" : "";
    var editCell;
    if (liveMode) {
      editCell = state.editingId === a.id ? editFormHtml(a) : '<button type="button" class="edit-link edit-trigger" data-id="' + esc(a.id) + '">Edit</button>';
    } else {
      editCell = editLink(a);
    }
    return "<tr>" +
      '<td class="name">' + esc(a.name) + flag + note + "</td>" +
      '<td data-label="Division"><span class="badge badge-div">X-' + esc(a.division) + "</span></td>" +
      '<td data-label="WhatsApp">' + whatsappBadge(a.whatsappGroup) + "</td>" +
      '<td class="contact-col" data-label="Email">' + (a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + "</a>" : dash()) + "</td>" +
      '<td class="contact-col" data-label="Facebook">' + (a.facebook ? esc(a.facebook) : dash()) + "</td>" +
      '<td class="contact-col" data-label="Birthday">' + (a.birthday ? esc(formatDate(a.birthday)) : dash()) + "</td>" +
      '<td class="edit-cell" data-label="Edit">' + editCell + "</td>" +
      "</tr>";
  }

  function editFormHtml(a) {
    var wa = a.whatsappGroup === true ? "yes" : a.whatsappGroup === false ? "no" : "unknown";
    return '<form class="edit-form" data-id="' + esc(a.id) + '">' +
      '<label>WhatsApp<select name="whatsappGroup">' +
        '<option value="unknown"' + (wa === "unknown" ? " selected" : "") + ">Unknown</option>" +
        '<option value="yes"' + (wa === "yes" ? " selected" : "") + ">Yes</option>" +
        '<option value="no"' + (wa === "no" ? " selected" : "") + ">No</option>" +
      "</select></label>" +
      '<label>Email<input type="email" name="email" value="' + esc(a.email || "") + '" placeholder="you@example.com"></label>' +
      '<label>Facebook<input type="text" name="facebook" value="' + esc(a.facebook || "") + '" placeholder="profile name or URL"></label>' +
      '<label>Birthday<input type="date" name="birthday" value="' + esc(a.birthday || "") + '"></label>' +
      '<div class="edit-form-actions">' +
        '<button type="submit" class="btn-save">Save</button>' +
        '<button type="button" class="btn-cancel edit-cancel">Cancel</button>' +
      "</div>" +
      '<p class="edit-status" hidden></p>' +
    "</form>";
  }

  function editLink(a) {
    if (!config.organizerEmail) { return dash(); }
    var subject = "Correction: " + a.name + " (X-" + a.division + ")";
    var whatsappLine = a.whatsappGroup === true ? "Yes" : a.whatsappGroup === false ? "No" : "Unknown - please set to Yes or No";
    var body = [
      "Is this you, or do you know this person's current details? Fill in what's correct and send.",
      "",
      "Name: " + a.name,
      "Division: X-" + a.division,
      "In WhatsApp group? (currently: " + whatsappLine + "): ",
      "Email" + (a.email ? " (currently " + a.email + ")" : "") + ": ",
      "Facebook" + (a.facebook ? " (currently " + a.facebook + ")" : "") + ": ",
      "Birthday" + (a.birthday ? " (currently " + formatDate(a.birthday) + ")" : "") + ": ",
      "",
      "Anything else:"
    ].join("\n");
    var href = "mailto:" + config.organizerEmail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    return '<a class="edit-link" href="' + href + '">Edit</a>';
  }

  function whatsappBadge(v) {
    if (v === true) { return '<span class="badge badge-yes">Yes</span>'; }
    if (v === false) { return '<span class="badge badge-no">No</span>'; }
    return '<span class="badge badge-unknown" title="Never recorded either way - not necessarily \'not in the group\'">Unknown</span>';
  }

  // ---- Helpers ----------------------------------------------------------
  function dash() { return '<span class="muted">—</span>'; }
  function pct(n, d) { return d ? Math.round((n / d) * 100) + "%" : "0%"; }
  function unique(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }); }
  function sortValue(v) {
    if (v === true) { return 0; }
    if (v === false) { return 1; }
    if (v === null || v === undefined) { return 2; }
    return String(v).toLowerCase();
  }
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) { return iso; }
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return parseInt(m[3], 10) + " " + months[parseInt(m[2], 10) - 1] + " " + m[1];
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
