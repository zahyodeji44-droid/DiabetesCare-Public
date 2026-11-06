"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const kinds = {
  glucose: ["Glucose", "◉"],
  meal: ["Meal", "♧"],
  medication: ["Medication", "✚"],
  activity: ["Activity", "↗"],
  symptom: ["Feeling", "♡"],
};
let settingsUnit = "mmol/L";
let originalRecord = null;
let mutationBusy = false;
let live = {
  records: [],
  deletedRecords: [],
  preferences: { name: "", unit: "mmol/L", lower: null, upper: null },
};
let demoState = null,
  demo = false,
  currentView = "home",
  editId = null,
  entryKind = "glucose",
  deletedId = null,
  loaded = false;
const state = () => (demo ? demoState : live);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const unit = () => state().preferences.unit;
const displayValue = (v) =>
  v == null
    ? "—"
    : unit() === "mg/dL"
      ? Math.round(v * 18).toString()
      : Number(v).toFixed(1);
const canonical = (v) => (unit() === "mg/dL" ? v / 18 : v);
const localDate = (d) => {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const localInput = (d) => {
  d = new Date(d);
  return `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const clock = (t) =>
  new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dateLabel = (t) =>
  new Date(t).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const records = () =>
  state()
    .records.filter((r) => !r.deleted)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
const period = (list, days) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Number(days) + 1);
  return list.filter((r) => new Date(r.time) >= start);
};
const average = (list) =>
  list.length ? list.reduce((s, r) => s + r.value, 0) / list.length : null;
const rangeSet = () =>
  state().preferences.lower != null && state().preferences.upper != null;
const inRange = (r) =>
  r.value >= state().preferences.lower && r.value <= state().preferences.upper;
async function api(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-DiabetesCare": "journal",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }).catch(() => {
    throw new Error(
      "Cannot reach DiabetesCare. Keep its VS Code terminal running, then try again.",
    );
  });
  if (!response.ok) {
    let message = "The request could not be completed. Please try again.";
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}
async function load() {
  try {
    live = await api("/api/state");
    loaded = true;
    $("#load-error").hidden = true;
    $("#connection").textContent = "● Local journal";
    render();
  } catch (e) {
    loaded = false;
    $("#load-error").hidden = false;
    $("#load-error-text").textContent = e.message;
    $("#connection").textContent = "○ Connection unavailable";
    $("#add-main").disabled = true;
  }
}
function empty(title, description, kind) {
  return `<div class="empty"><span>◌</span><strong>${esc(title)}</strong><p>${esc(description)}</p>${kind ? `<button class="secondary" data-add="${kind}">＋ Log an entry</button>` : ""}</div>`;
}
function stat(label, value, suffix, foot, featured = false) {
  return `<article class="stat${featured ? " featured" : ""}"><div class="stat-label">${esc(label)}<span class="stat-icon">◌</span></div><strong class="stat-value">${esc(value)}<small>${esc(suffix)}</small></strong><div class="stat-foot">${esc(foot)}</div></article>`;
}
function summaryStats(list) {
  const glucose = list.filter((r) => r.kind === "glucose"),
    avg = average(glucose);
  const days = new Set(list.map((r) => localDate(r.time))).size;
  const pct =
    glucose.length && rangeSet()
      ? Math.round((glucose.filter(inRange).length / glucose.length) * 100)
      : null;
  return (
    stat(
      "Average glucose",
      displayValue(avg),
      unit(),
      `${glucose.length} ${glucose.length === 1 ? "reading" : "readings"} in this period`,
      true,
    ) +
    stat(
      "Within personal range",
      pct === null ? "—" : pct,
      pct === null ? "" : "%",
      rangeSet()
        ? "Of logged readings · not time in range"
        : "Set your own range in Preferences",
    ) +
    stat(
      "Journal entries",
      list.length,
      "entries",
      "Across all five entry types",
    ) +
    stat(
      "Days with entries",
      days,
      days === 1 ? "day" : "days",
      "Every entry adds a little context",
    )
  );
}
function render() {
  $("#demo-banner").hidden = !demo;
  $("#demo-toggle").textContent = demo
    ? "Back to my journal ↗"
    : "Explore with demo data ↗";
  $("#add-main").disabled = !loaded && !demo;
  $("#heading-date").textContent = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  document.body.classList.toggle("on-home", currentView === "home");
  const titles = {
    home: [
      "Your life. Your context.",
      "A private journal for better care conversations.",
      "Home",
    ],
    visit: [
      "Bring your story to the conversation.",
      "Your records, your observations, and the questions that matter to you.",
      "Visit prep",
    ],
    dashboard: [
      state().preferences.name
        ? `${state().preferences.name}, your day at a glance.`
        : "Your day, at a glance.",
      "Small moments. A clearer picture of your routine.",
      "Overview",
    ],
    records: [
      "Every entry tells a story.",
      "Find, review, and update the details of your journal.",
      "My records",
    ],
    insights: [
      "A little perspective.",
      "See patterns in the records you’ve chosen to keep.",
      "Trends & summaries",
    ],
    settings: [
      "A journal that feels like yours.",
      "Choose your units, set your preferences, and manage your data.",
      "Preferences",
    ],
  };
  const t = titles[currentView];
  $("#page-title").textContent = t[0];
  $("#page-description").textContent = t[1];
  $("#breadcrumb").textContent = `Workspace / ${t[2]}`;
  $("#profile-button").textContent = state().preferences.name
    ? state().preferences.name.slice(0, 2).toUpperCase()
    : "DC";
  for (const key of Object.keys(titles))
    $(`#${key}-view`).hidden = key !== currentView;
  $$(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === currentView);
    if (b.dataset.view === currentView) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  renderDashboard();
  renderRecords();
  renderInsights();
  populateSettings();
  renderVisit();
}
function showView(v) {
  currentView = v;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderDashboard() {
  const all = records(),
    today = all.filter((r) => localDate(r.time) === localDate(new Date())),
    glucose = all.filter((r) => r.kind === "glucose"),
    recent = glucose[0],
    tg = today.filter((r) => r.kind === "glucose");
  $("#stats").innerHTML =
    stat(
      "Latest glucose",
      displayValue(recent?.value),
      unit(),
      recent
        ? `${dateLabel(recent.time)} · ${clock(recent.time)}`
        : "Your first reading starts the story",
      true,
    ) +
    stat(
      "Today's average",
      displayValue(average(tg)),
      unit(),
      `${tg.length} glucose ${tg.length === 1 ? "reading" : "readings"} today`,
    ) +
    stat(
      "Today's entries",
      today.length,
      "entries",
      `${today.filter((r) => r.kind === "meal").length} meals · ${today.filter((r) => r.kind === "activity").length} activities`,
    ) +
    stat(
      "Days logged this week",
      new Set(period(all, 7).map((r) => localDate(r.time))).size,
      "/ 7",
      "A record of your journaling routine",
    );
  $("#timeline").innerHTML = today.length
    ? today
        .map(
          (r) =>
            `<div class="timeline-item"><span class="timeline-time">${esc(clock(r.time))}</span><span class="kind-icon ${r.kind}">${kinds[r.kind]?.[1] || "◌"}</span><div class="timeline-description"><strong>${esc(recordTitle(r))}</strong><p>${esc(recordDetail(r) || "No additional notes")}</p></div><span class="entry-tag">${esc(kinds[r.kind]?.[0] || r.kind)}</span></div>`,
        )
        .join("")
    : empty(
        "A fresh page for today.",
        "Log a reading, meal, or moment to build your daily timeline.",
        "glucose",
      );
  renderChart(period(glucose, $("#chart-days").value));
}
function recordTitle(r) {
  return r.kind === "glucose" ? `${displayValue(r.value)} ${unit()}` : r.title;
}
function recordDetail(r) {
  return [
    r.context,
    r.carbs != null ? `${r.carbs} g carbs` : "",
    r.duration != null ? `${r.duration} min` : "",
    r.dose,
    r.note,
  ]
    .filter(Boolean)
    .join(" · ");
}
function renderChart(list) {
  $("#range-legend").textContent = rangeSet()
    ? `Personal range: ${displayValue(state().preferences.lower)}–${displayValue(state().preferences.upper)} ${unit()}`
    : "No personal range set";
  if (!list.length) {
    $("#glucose-chart").innerHTML = empty(
      records().some((r) => r.kind === "glucose")
        ? "No readings in this period."
        : "Your chart begins with one reading.",
      records().some((r) => r.kind === "glucose")
        ? "Try a longer chart period, or log a new reading."
        : "Add glucose readings to see them plotted over time.",
      "glucose",
    );
    return;
  }
  const points = [...list].sort((a, b) => new Date(a.time) - new Date(b.time));
  const W = 640,
    H = 225,
    L = 42,
    R = 18,
    T = 16,
    B = 32;
  let min = Math.min(...points.map((p) => p.value)),
    max = Math.max(...points.map((p) => p.value));
  if (rangeSet()) {
    min = Math.min(min, state().preferences.lower);
    max = Math.max(max, state().preferences.upper);
  }
  const pad = Math.max((max - min) * 0.2, 1);
  min = Math.max(0, min - pad);
  max += pad;
  const first = +new Date(points[0].time),
    last = +new Date(points[points.length - 1].time),
    span = last - first;
  const x = (p) =>
      span
        ? L + ((+new Date(p.time) - first) / span) * (W - L - R)
        : (W + L - R) / 2,
    y = (v) => T + ((max - v) / (max - min)) * (H - T - B);
  let grid = "";
  for (let i = 0; i < 5; i++) {
    const v = min + ((max - min) * i) / 4,
      yy = y(v);
    grid += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="#edf2f2"/><text x="${L - 9}" y="${yy + 3}" text-anchor="end">${displayValue(v)}</text>`;
  }
  const poly = points.map((p) => `${x(p)},${y(p.value)}`).join(" ");
  const band = rangeSet()
    ? `<rect x="${L}" y="${y(state().preferences.upper)}" width="${W - L - R}" height="${y(state().preferences.lower) - y(state().preferences.upper)}" fill="#e8f3ed" opacity="0.65"/>`
    : "";
  const ticks = [
    points[0],
    ...(points.length > 2 ? [points[Math.floor(points.length / 2)]] : []),
    ...(points.length > 1 ? [points[points.length - 1]] : []),
  ];
  $("#glucose-chart").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Glucose chart showing ${points.length} ${points.length === 1 ? "reading" : "readings"} from ${dateLabel(points[0].time)} to ${dateLabel(points[points.length - 1].time)}. Values available in My records.`)}">${band}${grid}<polyline points="${poly}" fill="none" stroke="#238a78" stroke-width="2.3" stroke-linejoin="round"/>${points.map((p) => `<circle cx="${x(p)}" cy="${y(p.value)}" r="4" fill="white" stroke="#238a78" stroke-width="2"><title>${esc(`${dateLabel(p.time)} ${clock(p.time)}: ${displayValue(p.value)} ${unit()}`)}</title></circle>`).join("")}${ticks.map((p) => `<text x="${x(p)}" y="${H - 8}" text-anchor="middle">${esc(new Date(p.time).toLocaleDateString([], { month: "short", day: "numeric" }))}</text>`).join("")}</svg>`;
}
function recordPool() {
  if ($("#filter-status").value !== "deleted") return records();
  return (
    demo
      ? demoState.records.filter((r) => r.deleted)
      : live.deletedRecords || []
  )
    .slice()
    .sort((a, b) => new Date(b.time) - new Date(a.time));
}
function filteredRecords() {
  let list = recordPool();
  const kind = $("#filter-kind").value,
    days = $("#filter-period").value,
    q = $("#search").value.toLowerCase().trim();
  if (kind !== "all") list = list.filter((r) => r.kind === kind);
  if (days === "today")
    list = list.filter((r) => localDate(r.time) === localDate(new Date()));
  else if (days !== "all") list = period(list, days);
  if (q)
    list = list.filter((r) =>
      [r.title, r.note, r.context, r.dose, recordTitle(r), kinds[r.kind]?.[0]]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  return list;
}
function renderRecords() {
  const list = filteredRecords();
  $("#record-count").textContent =
    `${list.length} of ${recordPool().length} ${$("#filter-status").value === "deleted" ? "deleted " : ""}records`;
  $("#export-filtered").disabled = list.length === 0;
  $("#record-list").innerHTML = list.length
    ? `<div class="table-wrap"><table><thead><tr><th>Entry</th><th>When</th><th>Context & notes</th><th>Actions</th></tr></thead><tbody>${list.map((r) => `<tr><td><div class="table-kind"><span class="kind-icon ${r.kind}">${kinds[r.kind]?.[1] || "◌"}</span><div>${esc(recordTitle(r))}<small>${esc(kinds[r.kind]?.[0] || r.kind)}</small></div></div></td><td>${esc(dateLabel(r.time))}<small>${esc(clock(r.time))}</small></td><td class="table-note">${esc(recordDetail(r) || "—")}</td><td><div class="table-actions">${$("#filter-status").value === "deleted" ? `<button data-restore="${r.id}" aria-label="Restore ${esc(recordTitle(r))}">Restore</button>` : `<button data-edit="${r.id}" aria-label="Edit ${esc(recordTitle(r))}">Edit</button><button data-delete="${r.id}" aria-label="Delete ${esc(recordTitle(r))}">Delete</button>`}</div></td></tr>`).join("")}</tbody></table></div>`
    : empty(
        $("#filter-status").value === "deleted"
          ? "No deleted records match."
          : records().length
            ? "No matching records."
            : "Your journal is ready.",
        "Try changing your filters, or log a new entry.",
        $("#filter-status").value === "deleted" || records().length
          ? null
          : "glucose",
      );
}
function renderInsights() {
  const list = period(records(), $("#insight-days").value);
  $("#insight-stats").innerHTML = summaryStats(list);
  const grouped = new Map();
  list.forEach((r) => {
    const key = localDate(r.time);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  });
  $("#daily-summary").innerHTML = grouped.size
    ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Entries</th><th>Glucose average</th></tr></thead><tbody>${[...grouped].map(([d, items]) => `<tr><td>${esc(dateLabel(d + "T12:00"))}</td><td>${items.length}</td><td>${displayValue(average(items.filter((r) => r.kind === "glucose")))} <small>${unit()}</small></td></tr>`).join("")}</tbody></table></div>`
    : empty(
        "No entries in this period.",
        "Try a longer period, or add your first entry.",
      );
  const contexts = new Map();
  list
    .filter((r) => r.kind === "glucose")
    .forEach((r) => {
      const key = r.context || "Unspecified";
      if (!contexts.has(key)) contexts.set(key, []);
      contexts.get(key).push(r);
    });
  $("#context-summary").innerHTML = contexts.size
    ? [...contexts]
        .map(
          ([name, items]) =>
            `<div class="context-row"><div>${esc(name)}<small>${items.length} ${items.length === 1 ? "reading" : "readings"}</small></div><strong>${displayValue(average(items))} ${unit()}</strong></div>`,
        )
        .join("")
    : empty(
        "No glucose context yet.",
        "Choose a context when logging readings to compare descriptive averages.",
      );
}
function populateSettings() {
  settingsUnit = state().preferences.unit;
  const f = $("#settings-form"),
    p = state().preferences;
  f.elements.name.value = p.name;
  f.elements.unit.value = p.unit;
  f.elements.lower.value =
    p.lower == null
      ? ""
      : Number((p.lower * (p.unit === "mg/dL" ? 18 : 1)).toFixed(4));
  f.elements.upper.value =
    p.upper == null
      ? ""
      : Number((p.upper * (p.unit === "mg/dL" ? 18 : 1)).toFixed(4));
  $$(".settings-unit").forEach((e) => (e.textContent = p.unit));
}
function setKind(kind) {
  entryKind = kind;
  $$("[data-kind]").forEach((b) =>
    b.classList.toggle("active", b.dataset.kind === kind),
  );
  const glucose = kind === "glucose";
  $("#value-label").hidden = !glucose;
  $("#title-label").hidden = glucose;
  $("#context-label").hidden = !glucose;
  $("#carbs-label").hidden = kind !== "meal";
  $("#duration-label").hidden = kind !== "activity";
  $("#dose-label").hidden = kind !== "medication";
  const f = $("#entry-form");
  f.elements.value.required = glucose;
  f.elements.value.disabled = !glucose;
  f.elements.title.required = !glucose;
  f.elements.title.disabled = glucose;
  f.elements.carbs.disabled = kind !== "meal";
  f.elements.duration.disabled = kind !== "activity";
  f.elements.dose.disabled = kind !== "medication";
  f.elements.context.disabled = !glucose;
  $("#entry-unit").textContent = unit();
  f.elements.value.placeholder = unit() === "mg/dL" ? "e.g. 115" : "e.g. 6.4";
  $("#entry-error").textContent = "";
}
function openEntry(kind = "glucose", record = null) {
  if (mutationBusy) return toast("Please wait for the current save to finish.");
  if (!loaded && !demo) {
    toast("Load your journal before adding entries.");
    return;
  }
  const f = $("#entry-form");
  f.reset();
  editId = record?.id || null;
  originalRecord = record ? structuredClone(record) : null;
  $("#dialog-title").textContent = record ? "Edit your entry" : "Log an entry";
  setKind(record?.kind || kind);
  f.elements.time.value = localInput(record?.time || new Date());
  f.elements.time.max = localInput(new Date(Date.now() + 5 * 60000));
  f.elements.time.min = "2000-01-01T00:00";
  if (record) {
    f.elements.value.value =
      record.value == null
        ? ""
        : unit() === "mg/dL"
          ? Number((record.value * 18).toFixed(2))
          : record.value;
    for (const field of [
      "title",
      "context",
      "note",
      "carbs",
      "duration",
      "dose",
    ])
      f.elements[field].value = record[field] ?? "";
  }
  $("#entry-dialog").showModal();
  setTimeout(
    () => f.elements[entryKind === "glucose" ? "value" : "title"].focus(),
    0,
  );
}
async function saveEntry(event) {
  event.preventDefault();
  if (mutationBusy) return;
  const f = event.currentTarget,
    button = $("#save-entry"),
    val = (name) => f.elements[name].value.trim();
  const record = {
    kind: entryKind,
    time:
      originalRecord && val("time") === localInput(originalRecord.time)
        ? originalRecord.time
        : new Date(val("time")).toISOString(),
    value:
      entryKind === "glucose"
        ? originalRecord?.kind === "glucose" &&
          Number(val("value")) ===
            (unit() === "mg/dL"
              ? Number((originalRecord.value * 18).toFixed(2))
              : originalRecord.value)
          ? originalRecord.value
          : canonical(Number(val("value")))
        : null,
    title: entryKind === "glucose" ? "" : val("title"),
    context: entryKind === "glucose" ? val("context") : "",
    note: val("note"),
    carbs: entryKind === "meal" && val("carbs") ? Number(val("carbs")) : null,
    duration:
      entryKind === "activity" && val("duration")
        ? Number(val("duration"))
        : null,
    dose: entryKind === "medication" ? val("dose") : "",
  };
  mutationBusy = true;
  button.disabled = true;
  $("#entry-error").textContent = "";
  try {
    if (
      record.value !== null &&
      (!Number.isFinite(record.value) ||
        record.value <= 0 ||
        record.value > 100)
    )
      throw new Error(
        "Enter a glucose value greater than 0 and at most " +
          (unit() === "mg/dL" ? "1800 mg/dL." : "100 mmol/L."),
      );
    if (demo) {
      record.id = editId || crypto.randomUUID();
      record.deleted = false;
      const i = demoState.records.findIndex((r) => r.id === editId);
      if (i >= 0) demoState.records[i] = record;
      else demoState.records.push(record);
    } else {
      const saved = await api(
        editId ? `/api/records/${editId}` : "/api/records",
        editId ? "PUT" : "POST",
        record,
      );
      const index = live.records.findIndex((r) => r.id === saved.id);
      if (index < 0) live.records.push(saved);
      else live.records[index] = saved;
    }
    $("#entry-dialog").close();
    render();
    toast(
      demo
        ? editId
          ? "Demo entry updated."
          : "Demo entry added. Your real journal is unchanged."
        : editId
          ? "Entry updated."
          : "Entry saved to your journal.",
    );
  } catch (e) {
    $("#entry-error").textContent = e.message;
  } finally {
    mutationBusy = false;
    button.disabled = false;
  }
}
async function deleteEntry(id) {
  if (mutationBusy) return;
  mutationBusy = true;
  try {
    if (demo) {
      demoState.records.find((r) => r.id === id).deleted = true;
    } else {
      await api(`/api/records/${id}`, "DELETE");
      const removed = live.records.find((r) => r.id === id);
      if (removed)
        (live.deletedRecords ||= []).push({ ...removed, deleted: true });
      live.records = live.records.filter((r) => r.id !== id);
    }
    deletedId = id;
    render();
    toast("Entry moved to Deleted records. You can restore it any time.", true);
  } catch (e) {
    toast(e.message);
  } finally {
    mutationBusy = false;
  }
}
async function restoreEntry(id) {
  if (!id || mutationBusy) return;
  mutationBusy = true;
  try {
    if (demo) {
      demoState.records.find((r) => r.id === id).deleted = false;
    } else {
      const r = await api(`/api/records/${id}/restore`, "POST");
      live.records = live.records.filter((item) => item.id !== id);
      live.records.push(r);
      live.deletedRecords = (live.deletedRecords || []).filter(
        (item) => item.id !== id,
      );
    }
    deletedId = null;
    render();
    toast("Entry restored.");
  } catch (e) {
    toast(e.message);
  } finally {
    mutationBusy = false;
  }
}
async function undo() {
  await restoreEntry(deletedId);
}
function toast(text, undoable = false) {
  $("#toast-text").textContent = text;
  $("#toast").hidden = false;
  $("#undo-delete").hidden = !undoable;
}
function buildDemo() {
  const list = [];
  const now = new Date();
  for (let day = 6; day >= 0; day--) {
    for (const [hour, value, context] of [
      [8, 5.5 + ((day * 7) % 9) / 10, "Fasting"],
      [13, 7.1 + ((day * 3) % 8) / 10, "After meal"],
      [19, 6.2 + ((day * 2) % 7) / 10, "Before meal"],
    ]) {
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      d.setHours(hour, 15, 0, 0);
      if (d > now) continue;
      list.push({
        id: crypto.randomUUID(),
        kind: "glucose",
        time: d.toISOString(),
        value,
        title: "",
        context,
        note: day === 0 ? "A quiet day at home." : "",
        deleted: false,
      });
    }
    for (const [kind, hour, title, extra] of [
      ["meal", 12, "Grain bowl & vegetables", { carbs: 42 }],
      ["activity", 16, "Afternoon walk", { duration: 25 }],
      ["medication", 8, "Sample medication log", { dose: "Demo entry only" }],
    ]) {
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      d.setHours(hour, 30, 0, 0);
      if (d > now) continue;
      list.push({
        id: crypto.randomUUID(),
        kind,
        time: d.toISOString(),
        title,
        note: "Illustrative sample record",
        ...extra,
        deleted: false,
      });
    }
  }
  return {
    records: list,
    preferences: { name: "", unit: "mmol/L", lower: null, upper: null },
  };
}
function toggleDemo() {
  if (mutationBusy) return toast("Please wait for the current save to finish.");
  if ($("#entry-dialog").open) $("#entry-dialog").close();
  if (!demoState) demoState = buildDemo();
  demo = !demo;
  visitDirty = false;
  if (currentView === "home") currentView = "dashboard";
  deletedId = null;
  $("#toast").hidden = true;
  $("#settings-error").textContent = "";
  render();
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvFor(list) {
  const quote = (value) => {
    let text = String(value ?? "");
    if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return (
    "Type,Timestamp,Glucose (mmol/L),Title,Context,Notes,Carbs (g),Duration (min),Dose\r\n" +
    list
      .map((r) =>
        [
          r.kind,
          r.time,
          r.value,
          r.title,
          r.context,
          r.note,
          r.carbs,
          r.duration,
          r.dose,
        ]
          .map(quote)
          .join(","),
      )
      .join("\r\n")
  );
}
function exportShown() {
  const list = filteredRecords();
  if (!list.length) return;
  downloadBlob(
    new Blob([csvFor(list)], { type: "text/csv" }),
    `diabetescare-${demo ? "demo-" : ""}filtered-${localDate(new Date())}.csv`,
  );
  toast(
    `Exported ${list.length} shown ${list.length === 1 ? "record" : "records"}.`,
  );
}
async function exportData(format) {
  try {
    let blob, filename;
    if (demo) {
      if (format === "json") {
        blob = new Blob(
          [
            JSON.stringify(
              { ...demoState, records: records(), demo: true },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        );
        filename = "diabetescare-demo.json";
      } else {
        const quote = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
        const safe = (v) =>
          /^[\s]*[=+\-@]/.test(String(v ?? "")) ? "'" + v : v;
        const rows = records().map((r) =>
          [
            r.kind,
            r.time,
            r.value,
            r.title,
            r.context,
            r.note,
            r.carbs,
            r.duration,
            r.dose,
          ]
            .map((v) => quote(safe(v)))
            .join(","),
        );
        blob = new Blob(
          [
            "Type,Timestamp,Glucose (mmol/L),Title,Context,Notes,Carbs (g),Duration (min),Dose\r\n" +
              rows.join("\r\n"),
          ],
          { type: "text/csv" },
        );
        filename = "diabetescare-demo.csv";
      }
    } else {
      const response = await fetch(
        format === "json" ? "/api/export" : "/api/export.csv",
      );
      if (!response.ok) throw new Error("Export failed. Try again.");
      blob = await response.blob();
      filename = `diabetescare-${localDate(new Date())}.${format}`;
    }
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Export downloaded.");
  } catch (e) {
    toast(e.message);
  }
}
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"),
    view = e.target.closest("[data-view]"),
    edit = e.target.closest("[data-edit]"),
    del = e.target.closest("[data-delete]"),
    kind = e.target.closest("[data-kind]"),
    restore = e.target.closest("[data-restore]");
  if (add) openEntry(add.dataset.add);
  if (view) showView(view.dataset.view);
  if (edit)
    openEntry(
      "glucose",
      records().find((r) => r.id === edit.dataset.edit),
    );
  if (del) deleteEntry(del.dataset.delete);
  if (restore) restoreEntry(restore.dataset.restore);
  if (kind) setKind(kind.dataset.kind);
});
$(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  showView("home");
});
$("#add-main").addEventListener("click", () => openEntry());
$("#profile-button").addEventListener("click", () => showView("settings"));
$("#close-dialog").addEventListener("click", () => $("#entry-dialog").close());
$("#entry-form").addEventListener("submit", saveEntry);
$("#chart-days").addEventListener("change", renderDashboard);
$("#insight-days").addEventListener("change", renderInsights);
["search", "filter-kind", "filter-period", "filter-status"].forEach((id) =>
  $(`#${id}`).addEventListener(
    id === "search" ? "input" : "change",
    renderRecords,
  ),
);
$("#clear-filters").addEventListener("click", () => {
  $("#search").value = "";
  $("#filter-kind").value = "all";
  $("#filter-period").value = "all";
  $("#filter-status").value = "active";
  renderRecords();
});
$("#demo-toggle").addEventListener("click", toggleDemo);
$("#leave-demo").addEventListener("click", toggleDemo);
$("#undo-delete").addEventListener("click", undo);
$("#dismiss-toast").addEventListener(
  "click",
  () => ($("#toast").hidden = true),
);
$("#retry").addEventListener("click", load);
$("#refresh-journal").addEventListener("click", async () => {
  if (demo) return toast("Demo records live only in this tab.");
  await load();
  if (loaded) toast("Journal refreshed.");
});
$("#export-filtered").addEventListener("click", exportShown);
$("#export-csv").addEventListener("click", () => exportData("csv"));
$("#export-json").addEventListener("click", () => exportData("json"));
$("#print-summary").addEventListener("click", () => window.print());
$("#settings-form").elements.unit.addEventListener("change", (e) => {
  const to = e.target.value;
  const f = $("#settings-form");
  for (const key of ["lower", "upper"]) {
    const input = f.elements[key];
    if (input.value)
      input.value = Number(
        (Number(input.value) * (to === "mg/dL" ? 18 : 1 / 18)).toFixed(8),
      );
  }
  settingsUnit = to;
  $$(".settings-unit").forEach((el) => (el.textContent = to));
});
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget,
    button = f.querySelector('button[type="submit"]');
  const prefs = {
    name: f.elements.name.value.trim(),
    unit: f.elements.unit.value,
    lower: f.elements.lower.value
      ? Number(f.elements.lower.value) / (settingsUnit === "mg/dL" ? 18 : 1)
      : null,
    upper: f.elements.upper.value
      ? Number(f.elements.upper.value) / (settingsUnit === "mg/dL" ? 18 : 1)
      : null,
  };
  button.disabled = true;
  $("#settings-error").textContent = "";
  try {
    if (
      (prefs.lower == null) !== (prefs.upper == null) ||
      (prefs.lower != null &&
        (prefs.lower <= 0 || prefs.upper <= prefs.lower || prefs.upper > 100))
    )
      throw new Error(
        "Enter both limits with the upper above the lower, or leave both blank.",
      );
    if (demo) demoState.preferences = prefs;
    else live.preferences = await api("/api/preferences", "PUT", prefs);
    render();
    toast("Preferences saved.");
  } catch (error) {
    $("#settings-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
initVisit();
render();
load();
