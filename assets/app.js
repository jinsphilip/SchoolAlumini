(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var adminToken = new URLSearchParams(location.search).get("admin") || "";
  var apiBase = (config.apiBaseUrl || "").replace(/\/$/, "");
  var liveMode = !!apiBase;

  var alumni = (window.ALUMNI || []).slice();
  var hasContactData = alumni.some(function (a) { return a.email || a.phone || a.facebook || a.birthday; });

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

  if (!config.organizerEmail) {
    $("updateMailto").hidden = true;
  } else {
    $("updateMailto").addEventListener("click", function () {
      var subject = (config.batchLabel || "Alumni") + " - update my details";
      var body = [
        "Name:", "Division (A-F):", "Email:", "Phone / WhatsApp:", "Facebook:", "Birthday:",
        "Add me to the batch WhatsApp group (yes/no):", "", "Anything else:"
      ].join("\n");
      openMailto(config.organizerEmail, subject, body);
    });
  }
  if (liveMode) {
    $("update").querySelector("p").textContent =
      "Find your row below and click Edit - changes save immediately, no email needed. " +
      "If you're not listed at all, email the organiser instead.";
  }

  // mailto: links silently do nothing in a normal browser tab if there's no
  // handler - but plenty of in-app browsers (WhatsApp, Instagram, etc.) try
  // to load "mailto:..." as a real page instead, which replaces this page
  // with a blank one since there's nothing to render. Trigger the handoff
  // through a hidden iframe instead of window.location - the OS/browser
  // still sees the mailto: request and can hand it to a mail app, but the
  // visible page is never navigated, so it can't go blank. Always also
  // copy the message so there's a usable fallback either way.
  function openMailto(to, subject, body) {
    var href = "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    var plainText = "To: " + to + "\nSubject: " + subject + "\n\n" + body;
    try {
      var iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = href;
      document.body.appendChild(iframe);
      setTimeout(function () {
        if (iframe.parentNode) { iframe.parentNode.removeChild(iframe); }
      }, 1000);
    } catch (e) {
      // Fine - the copy-to-clipboard fallback below still covers this.
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plainText).then(function () {
        showToast("Opening your email app… If nothing happens, the message was copied - paste it into a new email to " + to + ".");
      }).catch(function () {
        showToast("Opening your email app… If nothing happens, send this yourself to " + to + ": “" + subject + "”");
      });
    } else {
      showToast("Opening your email app… If nothing happens, send this yourself to " + to + ": “" + subject + "”");
    }
  }

  var toastTimer;
  function showToast(message) {
    var el = $("toast");
    if (!el) { return; }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 7000);
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
      hasContactData = alumni.some(function (a) { return a.email || a.phone || a.facebook || a.birthday; });
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

  // ---- Editing ------------------------------------------------------------
  function bindEditing() {
    var body = $("alumniBody");

    body.addEventListener("click", function (e) {
      var mailtoBtn = e.target.closest(".mailto-edit-trigger");
      if (mailtoBtn) {
        openMailto(config.organizerEmail, mailtoBtn.getAttribute("data-subject"), mailtoBtn.getAttribute("data-body"));
        return;
      }
      if (!liveMode) { return; }
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
      var removePhoto = e.target.closest(".remove-photo-btn");
      if (removePhoto) {
        var removeForm = removePhoto.closest(".edit-form");
        removeForm.photo.value = "";
        removeForm.querySelector(".photo-preview").src = BLANK_AVATAR;
      }
    });

    body.addEventListener("change", function (e) {
      var fileInput = e.target.closest(".photo-input");
      if (!fileInput || !fileInput.files || !fileInput.files[0]) { return; }
      var form = fileInput.closest(".edit-form");
      var statusEl = form.querySelector(".edit-status");
      compressImage(fileInput.files[0]).then(function (dataUrl) {
        form.photo.value = dataUrl;
        form.querySelector(".photo-preview").src = dataUrl;
      }).catch(function (err) {
        statusEl.hidden = false;
        statusEl.className = "edit-status edit-status-error";
        statusEl.textContent = err.message;
        fileInput.value = "";
      });
    });

    if (!liveMode) { return; }
    body.addEventListener("submit", function (e) {
      var form = e.target.closest(".edit-form");
      if (!form) { return; }
      e.preventDefault();
      saveEdit(form);
    });
  }

  // Resizes to a small square-ish avatar and re-encodes as JPEG so a phone
  // photo (often several MB) turns into ~20-50KB before it ever leaves the
  // browser - keeps the database small and uploads fast on a weak connection.
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        reject(new Error("Please choose a JPEG, PNG, or WebP image."));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not read that file.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("Could not read that image.")); };
        img.onload = function () {
          var maxDim = 320;
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function saveEdit(form) {
    var id = form.getAttribute("data-id");
    var waVal = form.whatsappGroup.value;
    var payload = {
      whatsappGroup: waVal === "yes" ? true : waVal === "no" ? false : null,
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      facebook: form.facebook.value.trim(),
      birthday: form.birthday.value.trim(),
      photo: form.photo.value
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
      '<td class="name">' + avatarHtml(a, 32) + '<span class="name-text">' + esc(a.name) + flag + note + "</span></td>" +
      '<td data-label="Division"><span class="badge badge-div">X-' + esc(a.division) + "</span></td>" +
      '<td data-label="WhatsApp">' + whatsappBadge(a.whatsappGroup) + "</td>" +
      '<td class="contact-col" data-label="Phone">' + (a.phone ? esc(a.phone) : dash()) + "</td>" +
      '<td class="contact-col" data-label="Email">' + (a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + "</a>" : dash()) + "</td>" +
      '<td class="contact-col" data-label="Facebook">' + (a.facebook ? esc(a.facebook) : dash()) + "</td>" +
      '<td class="contact-col" data-label="Birthday">' + (a.birthday ? esc(formatDate(a.birthday)) : dash()) + "</td>" +
      '<td class="edit-cell" data-label="Edit">' + editCell + "</td>" +
      "</tr>";
  }

  var BLANK_AVATAR = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#e2ddd2"/></svg>'
  );

  function avatarHtml(a, size) {
    if (a.photo) {
      return '<img class="avatar" width="' + size + '" height="' + size + '" src="' + esc(a.photo) + '" alt="">';
    }
    var initials = (a.name || "").split(" ").filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
    return '<div class="avatar avatar-placeholder" style="width:' + size + "px;height:" + size + 'px">' + esc(initials) + "</div>";
  }

  function editFormHtml(a) {
    var wa = a.whatsappGroup === true ? "yes" : a.whatsappGroup === false ? "no" : "unknown";
    return '<form class="edit-form" data-id="' + esc(a.id) + '">' +
      '<div class="photo-edit">' +
        '<img class="photo-preview" src="' + (a.photo ? esc(a.photo) : BLANK_AVATAR) + '" alt="">' +
        '<div class="photo-edit-actions">' +
          '<label class="photo-upload-btn">Choose photo<input type="file" class="photo-input" accept="image/jpeg,image/png,image/webp"></label>' +
          '<button type="button" class="btn-cancel remove-photo-btn">Remove</button>' +
        "</div>" +
        '<input type="hidden" name="photo" value="' + (a.photo ? esc(a.photo) : "") + '">' +
      "</div>" +
      '<label>WhatsApp<select name="whatsappGroup">' +
        '<option value="unknown"' + (wa === "unknown" ? " selected" : "") + ">Unknown</option>" +
        '<option value="yes"' + (wa === "yes" ? " selected" : "") + ">Yes</option>" +
        '<option value="no"' + (wa === "no" ? " selected" : "") + ">No</option>" +
      "</select></label>" +
      '<label>Phone (WhatsApp)<input type="tel" name="phone" value="' + esc(a.phone || "") + '" placeholder="+91 98765 43210"></label>' +
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
      "Phone / WhatsApp number" + (a.phone ? " (currently " + a.phone + ")" : "") + ": ",
      "Email" + (a.email ? " (currently " + a.email + ")" : "") + ": ",
      "Facebook" + (a.facebook ? " (currently " + a.facebook + ")" : "") + ": ",
      "Birthday" + (a.birthday ? " (currently " + formatDate(a.birthday) + ")" : "") + ": ",
      "Photo: please attach one to this email if you'd like it shown in the directory",
      "",
      "Anything else:"
    ].join("\n");
    return '<button type="button" class="edit-link mailto-edit-trigger" data-subject="' + esc(subject) + '" data-body="' + esc(body) + '">Edit</button>';
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
