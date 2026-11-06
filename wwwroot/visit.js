// Appointment preparation: descriptive record summaries plus the user's own words.
// This module deliberately makes no clinical conclusions or treatment suggestions.
let visitDirty = false;
function visitFields() {
  const form = $("#visit-form");
  return Object.fromEntries(
    ["focus", "observations", "questions", "appointmentDate"].map((key) => [
      key,
      form.elements[key].value.trim(),
    ]),
  );
}
function visitSummary(days = Number($("#visit-days").value) || 14) {
  const list = period(records(), days),
    glucose = list.filter((r) => r.kind === "glucose");
  const coverage = new Set(list.map((r) => localDate(r.time))).size;
  const counts = Object.fromEntries(
    Object.keys(kinds).map((kind) => [
      kind,
      list.filter((r) => r.kind === kind).length,
    ]),
  );
  return { days, list, glucose, coverage, counts, average: average(glucose) };
}
function visitQuestions(summary) {
  const questions = [
    "What context would you like me to record around my readings?",
  ];
  if (summary.counts.medication)
    questions.push("Can we review my medication list and how I record doses?");
  if (summary.coverage < summary.days / 2)
    questions.push(
      "How often would you like me to log entries before our next visit?",
    );
  questions.push(
    "Which questions should we follow up on before my next appointment?",
  );
  return questions;
}
function visitText() {
  const summary = visitSummary(),
    notes = visitFields();
  return [
    demo ? "DIABETESCARE — DEMO VISIT BRIEF" : "DIABETESCARE — MY VISIT BRIEF",
    state().preferences.name ? `Prepared for: ${state().preferences.name}` : "",
    notes.appointmentDate
      ? `Appointment: ${dateLabel(notes.appointmentDate + "T12:00")}`
      : "",
    `Period: last ${summary.days} calendar days, ending ${dateLabel(new Date())}`,
    `Records: ${summary.list.length}; days with entries: ${summary.coverage} of ${summary.days}`,
    `Glucose: ${summary.glucose.length} readings; average: ${summary.glucose.length ? `${displayValue(summary.average)} ${unit()}` : "not available"}`,
    ...Object.entries(summary.counts)
      .filter(([key]) => key !== "glucose")
      .map(([key, count]) => `${kinds[key][0]} entries: ${count}`),
    "\nMY FOCUS",
    notes.focus || "Not added",
    "\nWHAT I HAVE NOTICED",
    notes.observations || "Not added",
    "\nMY QUESTIONS",
    notes.questions || "Not added",
    "\nCONTEXT AROUND READINGS",
    ...visitContext(summary),
    "\nCoverage includes only manually logged entries. Missing days are not evidence of missing care. Averages are not continuous-monitor time-in-range or treatment advice.",
    demo ? "\nSample data only. This is not your personal journal." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
function visitContext(summary) {
  const contexts = new Map();
  summary.glucose.forEach((r) => {
    const key = r.context || "Unspecified";
    if (!contexts.has(key)) contexts.set(key, []);
    contexts.get(key).push(r);
  });
  return contexts.size
    ? [...contexts].map(
        ([name, items]) =>
          `${name}: ${items.length} ${items.length === 1 ? "reading" : "readings"}, average ${displayValue(average(items))} ${unit()}`,
      )
    : ["No glucose readings in the selected period."];
}
function renderVisit() {
  if (!visitDirty) {
    const saved = state().visit || {};
    for (const key of ["focus", "observations", "questions", "appointmentDate"])
      $("#visit-form").elements[key].value = saved[key] || "";
  }
  const summary = visitSummary(),
    notes = visitFields();
  $("#visit-save-state").textContent = visitDirty
    ? "Unsaved changes · preview includes your current notes."
    : demo
      ? "Demo notes stay only in this tab."
      : "Your saved notes stay in your local journal.";
  $("#visit-form").querySelector('button[type="submit"]').disabled =
    !loaded && !demo;
  $("#visit-prompts").innerHTML = visitQuestions(summary)
    .map(
      (q) =>
        `<button type="button" data-question="${esc(q)}">＋ ${esc(q)}</button>`,
    )
    .join("");
  const lines = (text) => esc(text || "Not added yet.").replace(/\n/g, "<br>");
  $("#visit-brief").innerHTML =
    `${demo ? '<div class="paper-demo">DEMO · SAMPLE RECORDS</div>' : ""}<span class="eyebrow">${esc(state().preferences.name || "YOUR PERSONAL JOURNAL")}</span><h2>A little context.<br>A better conversation.</h2><p class="paper-date">${notes.appointmentDate ? `Appointment ${esc(dateLabel(notes.appointmentDate + "T12:00"))} · ` : ""}Last ${summary.days} days · through ${esc(dateLabel(new Date()))}</p><div class="brief-metrics"><div><strong>${summary.list.length}</strong><small>logged entries</small></div><div><strong>${summary.coverage}<em>/${summary.days}</em></strong><small>days with entries</small></div><div><strong>${displayValue(summary.average)}</strong><small>average ${esc(unit())} · ${summary.glucose.length} ${summary.glucose.length === 1 ? "reading" : "readings"}</small></div></div><p class="coverage-note">A snapshot of what you logged. Missing entries do not mean missing care.</p><section><span class="paper-number">01 / MY PRIORITY</span><h3>My focus for this visit</h3><p>${lines(notes.focus)}</p></section><section><span class="paper-number">02 / MY EXPERIENCE</span><h3>What I've noticed</h3><p>${lines(notes.observations)}</p></section><section><span class="paper-number">03 / MY AGENDA</span><h3>Questions I'd like to ask</h3><p>${lines(notes.questions)}</p></section><section><span class="paper-number">04 / MY LOGGED CONTEXT</span><h3>The details behind the summary</h3><div class="brief-counts">${Object.entries(
      summary.counts,
    )
      .map(
        ([key, count]) => `<span>${esc(kinds[key][0])}<b>${count}</b></span>`,
      )
      .join("")}</div><ul>${visitContext(summary)
      .map((line) => `<li>${esc(line)}</li>`)
      .join(
        "",
      )}</ul><p class="coverage-note">Descriptive averages only. These readings do not establish causes or represent continuous monitoring.</p></section>`;
}
function initVisit() {
  $("#visit-days").addEventListener("change", renderVisit);
  $("#visit-form").addEventListener("input", () => {
    visitDirty = true;
    renderVisit();
  });
  $("#visit-prompts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-question]");
    if (!button) return;
    const input = $("#visit-form").elements.questions;
    if (input.value.split("\n").includes(button.dataset.question)) return;
    const next = [input.value.trim(), button.dataset.question]
      .filter(Boolean)
      .join("\n");
    if (next.length > 2000)
      return toast("Your questions are at the 2000-character limit.");
    input.value = next;
    visitDirty = true;
    renderVisit();
  });
  $("#visit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (mutationBusy) return;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    mutationBusy = true;
    button.disabled = true;
    $("#visit-error").textContent = "";
    // Capture this revision so typing during a request never gets overwritten.
    const submitted = visitFields();
    try {
      if (demo) demoState.visit = submitted;
      else live.visit = await api("/api/visit", "PUT", submitted);
      visitDirty = JSON.stringify(visitFields()) !== JSON.stringify(submitted);
      renderVisit();
      toast(
        demo
          ? "Demo visit notes saved in this tab."
          : "Visit notes saved to your local journal.",
      );
    } catch (error) {
      $("#visit-error").textContent = error.message;
    } finally {
      mutationBusy = false;
      button.disabled = false;
    }
  });
  $("#visit-download").addEventListener("click", () => {
    downloadBlob(
      new Blob([visitText()], { type: "text/plain;charset=utf-8" }),
      `diabetescare-${demo ? "demo-" : ""}visit-brief-${localDate(new Date())}.txt`,
    );
    toast("Visit brief downloaded.");
  });
  $("#visit-print").addEventListener("click", () => window.print());
}
