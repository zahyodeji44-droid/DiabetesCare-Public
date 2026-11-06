// Dependency-free regression checks. Run: node --test tests/frontend.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
function app() {
  const nodes = new Map();
  const node = (key) => {
    if (!nodes.has(key))
      nodes.set(key, {
        value: "",
        hidden: false,
        disabled: false,
        textContent: "",
        innerHTML: "",
        addEventListener() {},
        setAttribute() {},
        removeAttribute() {},
        classList: { toggle() {} },
        close() {
          this.open = false;
        },
        showModal() {
          this.open = true;
        },
        focus() {},
        click() {},
        querySelector() {
          return node(key + " button");
        },
        elements: new Proxy(
          {},
          { get: (_, name) => node(key + " " + String(name)) },
        ),
      });
    return nodes.get(key);
  };
  const context = vm.createContext({
    console,
    Date,
    Map,
    Set,
    Blob,
    structuredClone,
    crypto: require("node:crypto").webcrypto,
    setTimeout: () => 0,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    window: { scrollTo() {}, print() {} },
    document: {
      querySelector: node,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => node("download"),
    },
    fetch: async () => {
      throw new Error("Unexpected network request");
    },
  });
  let source = fs.readFileSync(
    path.join(__dirname, "../wwwroot/app.js"),
    "utf8",
  );
  source = source.replace(/\nrender\(\);\nload\(\);\s*$/, "\n");
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../wwwroot/visit.js"), "utf8"),
    context,
  );
  vm.runInContext(source, context);
  vm.runInContext("render = () => {}; loaded = true;", context);
  for (const key of ["#filter-kind", "#filter-period"]) node(key).value = "all";
  node("#filter-status").value = "active";
  return { context, node, run: (code) => vm.runInContext(code, context) };
}
test("filters combine type, date, search, and deleted status", () => {
  const a = app();
  a.run(
    `live.records=[{id:'1',kind:'meal',title:'Lunch',time:new Date().toISOString(),note:'Rice'}, {id:'2',kind:'glucose',value:6.4,time:new Date().toISOString(),note:'Fasting'}];live.deletedRecords=[{id:'3',kind:'meal',title:'Old lunch',time:new Date().toISOString(),deleted:true}];`,
  );
  a.node("#filter-kind").value = "meal";
  a.node("#search").value = "rice";
  a.node("#filter-period").value = "today";
  assert.equal(a.run("filteredRecords().length"), 1);
  a.node("#filter-status").value = "deleted";
  a.node("#search").value = "old";
  assert.equal(a.run("filteredRecords()[0].id"), "3");
});
test("note-only edit preserves exact timestamp and canonical glucose", async () => {
  const a = app();
  a.run(
    `live.preferences.unit='mg/dL'; originalRecord={id:'test',kind:'glucose',value:6.1234567,time:'2026-10-01T12:34:56.789-04:00'};editId='test';entryKind='glucose';live.records=[originalRecord]; api=async(path,method,body)=>{if(method!=='PUT')throw Error('Unexpected refresh');return {...body,id:'test'};};`,
  );
  const f = a.node("#entry-form");
  f.elements.value.value = a.run(
    "String(Number((originalRecord.value*18).toFixed(2)))",
  );
  f.elements.time.value = a.run("localInput(originalRecord.time)");
  f.elements.note.value = "Updated note";
  await a.run(
    `saveEntry({preventDefault(){},currentTarget:document.querySelector('#entry-form')})`,
  );
  assert.equal(a.run("live.records[0].value"), 6.1234567);
  assert.equal(a.run("live.records[0].time"), "2026-10-01T12:34:56.789-04:00");
  assert.equal(a.run("live.records[0].note"), "Updated note");
});
test("save commits returned record without a second request", async () => {
  const a = app();
  a.node("#entry-form").elements.value.value = "6.4";
  a.node("#entry-form").elements.time.value = "2026-10-01T12:00";
  a.run(
    `let calls=0;api=async(path,method,body)=>{calls++;if(method!=='POST')throw Error('Connection lost after successful save');return {...body,id:'new'};};`,
  );
  await a.run(
    `saveEntry({preventDefault(){},currentTarget:document.querySelector('#entry-form')})`,
  );
  assert.equal(a.run("calls"), 1);
  assert.equal(a.run("live.records.length"), 1);
  assert.equal(a.node("#entry-error").textContent, "");
});
test("failed save preserves journal and allows retry", async () => {
  const a = app();
  a.node("#entry-form").elements.value.value = "6.4";
  a.node("#entry-form").elements.time.value = "2026-10-01T12:00";
  a.run(`api=async()=>{throw Error('Disk unavailable');};`);
  await a.run(
    `saveEntry({preventDefault(){},currentTarget:document.querySelector('#entry-form')})`,
  );
  assert.equal(a.run("live.records.length"), 0);
  assert.equal(a.node("#entry-error").textContent, "Disk unavailable");
  assert.equal(a.run("mutationBusy"), false);
});
test("CSV protects spreadsheet formulas and quotes multiline notes", () => {
  const a = app();
  const csv = a.run(
    `csvFor([{kind:'meal',title:'=SUM(A1)',note:'Line one\\n"Line two"',time:'2026-10-01'}])`,
  );
  assert.ok(csv.includes('"\'=SUM(A1)"'));
  assert.ok(csv.includes('"Line one\n""Line two"""'));
});
test("demo edits never write to the real journal", async () => {
  const a = app();
  a.run(
    `demoState=buildDemo();demo=true;api=async()=>{throw Error('Demo touched API');};`,
  );
  a.node("#entry-form").elements.value.value = "6.4";
  a.node("#entry-form").elements.time.value = "2026-10-01T12:00";
  await a.run(
    `saveEntry({preventDefault(){},currentTarget:document.querySelector('#entry-form')})`,
  );
  assert.equal(a.run("live.records.length"), 0);
  assert.equal(a.node("#entry-error").textContent, "");
});
test("deletion moves to recoverable records and restore removes it from trash", async () => {
  const a = app();
  a.run(
    `live.records=[{id:'x',kind:'meal',title:'Lunch'}];api=async(path,method)=>method==='DELETE'?null:{id:'x',kind:'meal',title:'Lunch',deleted:false};`,
  );
  await a.run("deleteEntry('x')");
  assert.equal(a.run("live.records.length"), 0);
  assert.equal(a.run("live.deletedRecords.length"), 1);
  await a.run("restoreEntry('x')");
  assert.equal(a.run("live.records.length"), 1);
  assert.equal(a.run("live.deletedRecords.length"), 0);
});

test("chart empty state distinguishes older readings from a new journal", () => {
  const a = app();
  a.run(
    "live.records=[{id:'old',kind:'glucose',value:6.4,time:'2020-01-01T12:00:00Z'}]; renderChart([]);",
  );
  assert.ok(
    a.node("#glucose-chart").innerHTML.includes("No readings in this period."),
  );
  a.run("live.records=[];renderChart([]);");
  assert.ok(
    a
      .node("#glucose-chart")
      .innerHTML.includes("Your chart begins with one reading."),
  );
});

test("visit summary uses the selected period and excludes deleted entries", () => {
  const a = app();
  a.node("#visit-days").value = "14";
  a.run(
    "live.records=[{id:'1',kind:'glucose',value:6,time:new Date().toISOString()},{id:'2',kind:'glucose',value:8,time:new Date().toISOString()},{id:'3',kind:'meal',title:'Lunch',time:new Date().toISOString(),deleted:true},{id:'old',kind:'glucose',value:99,time:'2000-01-01T12:00:00Z'}];",
  );
  assert.equal(a.run("visitSummary().glucose.length"), 2);
  assert.equal(a.run("visitSummary().average"), 7);
  assert.equal(a.run("visitSummary().counts.meal"), 0);
});
test("visit text includes personal agenda and explicitly marks demo output", () => {
  const a = app();
  a.node("#visit-days").value = "14";
  a.node("#visit-form").elements.focus.value = "Discuss my routine";
  a.node("#visit-form").elements.questions.value =
    "What timing should I record?";
  a.run("demo=true;demoState=buildDemo();");
  const text = a.run("visitText()");
  assert.ok(text.includes("DEMO VISIT BRIEF"));
  assert.ok(text.includes("Discuss my routine"));
  assert.ok(text.includes("What timing should I record?"));
  assert.ok(text.includes("not your personal journal"));
});
