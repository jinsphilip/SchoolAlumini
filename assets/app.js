(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var alumni = (window.ALUMNI || []).slice();
  var hasContactData = alumni.some(function (a) { return a.email || a.facebook || a.birthday; });

  var state = { query: "", division: "", onlyWhatsapp: false, onlyContact: false, sortKey: "name", sortDir: 1 };

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

  function buildMailto() {
    if (!config.organizerEmail) { return "#"; }
    var subject = (config.batchLabel || "Alumni") + " - update my details";
    var body = [
      "Name:", "Division (A-F):", "Email:", "Phone / WhatsApp:", "Facebook:", "Birthday:",
      "Add me to the batch WhatsApp group (yes/no):", "", "Anything else:"
    ].join("\n");
    return "mailto:" + config.organizerEmail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  // ---- Stats ------------------------------------------------------------
  var divisions = unique(alumni.map(function (a) { return a.division; })).sort();
  var inGroup = alumni.filter(function (a) { return a.whatsappGroup === true; }).length;
  var withEmail = alumni.filter(function (a) { return a.email; }).length;

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

  // ---- Filters ----------------------------------------------------------
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

  $("search").addEventListener("input", function (e) { state.query = e.target.value.trim().toLowerCase(); render(); });
  $("onlyWhatsapp").addEventListener("change", function (e) { state.onlyWhatsapp = e.target.checked; render(); });
  $("onlyContact").addEventListener("change", function (e) { state.onlyContact = e.target.checked; render(); });

  if (!hasContactData) {
    document.body.classList.add("hide-contact");
    $("privacyNote").hidden = false;
    $("onlyContact").closest(".toggle").hidden = true;
  }

  // ---- Sorting ----------------------------------------------------------
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
  }

  function rowHtml(a) {
    var flag = a.possibleDuplicate ? '<span class="flag" title="This name appears more than once in the list">check</span>' : "";
    var note = a.notes ? '<span class="note">' + esc(a.notes) + "</span>" : "";
    return "<tr>" +
      '<td class="name">' + esc(a.name) + flag + note + "</td>" +
      '<td><span class="badge badge-div">X-' + esc(a.division) + "</span></td>" +
      "<td>" + whatsappBadge(a.whatsappGroup) + "</td>" +
      '<td class="contact-col">' + (a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + "</a>" : dash()) + "</td>" +
      '<td class="contact-col">' + (a.facebook ? esc(a.facebook) : dash()) + "</td>" +
      '<td class="contact-col">' + (a.birthday ? esc(formatDate(a.birthday)) : dash()) + "</td>" +
      "</tr>";
  }

  function whatsappBadge(v) {
    if (v === true) { return '<span class="badge badge-yes">Yes</span>'; }
    if (v === false) { return '<span class="badge badge-no">No</span>'; }
    return '<span class="badge badge-unknown">Unknown</span>';
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

  render();
})();
