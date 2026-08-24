// ===== Constants =====
const STORAGE_KEY = "trackline_projects_v1";
const ACTIVE_KEY = "trackline_active_project_v1";
const MAX_API_HISTORY = 10;
const PAGES = ["landingView", "appView", "browseView", "chatPageView", "portfolioView"];

// ===== State =====
let state = {
  gantt: null, burndown: null, kanban: null, raid: null,
  dailylog: null, submittals: null, punchlist: null,
  team: null, timesheets: null, budget: null,
};
let history = [];
let chatLogData = [];
let burndownChartInstance = null;
let activeProjectId = null;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ===== Sample data (construction-flavored) =====
const SAMPLES = {
  gantt: [
    { id: 1, name: "Mobilization & permits", start: "2026-08-03", end: "2026-08-09", progress: 100 },
    { id: 2, name: "Sitework & excavation", start: "2026-08-10", end: "2026-08-23", progress: 70 },
    { id: 3, name: "Foundation & footings", start: "2026-08-24", end: "2026-09-06", progress: 30 },
    { id: 4, name: "Framing", start: "2026-09-07", end: "2026-09-27", progress: 0 },
    { id: 5, name: "MEP rough-in", start: "2026-09-21", end: "2026-10-11", progress: 0 },
    { id: 6, name: "Insulation & drywall", start: "2026-10-12", end: "2026-10-25", progress: 0 },
    { id: 7, name: "Interior finishes", start: "2026-10-26", end: "2026-11-15", progress: 0 },
    { id: 8, name: "Final inspections & punch list", start: "2026-11-16", end: "2026-11-22", progress: 0 },
  ],
  burndown: {
    days: Array.from({ length: 11 }, (_, i) => ({
      day: i, ideal: 60 - i * 6,
      actual: i === 0 ? 60 : i <= 4 ? 60 - i * 5 : i <= 7 ? 40 - (i - 4) * 7 : 19 - (i - 7) * 6,
    })),
  },
  kanban: {
    columns: [
      { name: "To Do", cards: [{ id: "c1", title: "Order rooftop HVAC units" }, { id: "c2", title: "Schedule electrical rough-in inspection" }] },
      { name: "In Progress", cards: [{ id: "c3", title: "Frame 2nd floor east wing" }] },
      { name: "Done", cards: [{ id: "c4", title: "Pour foundation slab" }, { id: "c5", title: "Backfill & compact" }] },
    ],
  },
  raid: {
    items: [
      { id: "r1", type: "Risk", description: "Steel delivery could slip past framing start date", owner: "PM", impact: "High", status: "Open" },
      { id: "r2", type: "Assumption", description: "Local AHJ will complete foundation inspection within 48 hours of request", owner: "Site Super", impact: "Medium", status: "Monitoring" },
      { id: "r3", type: "Issue", description: "Existing utility line not shown on civil drawings", owner: "Civil Engineer", impact: "Medium", status: "Open" },
      { id: "r4", type: "Dependency", description: "Framing cannot start until foundation passes inspection", owner: "Site Super", impact: "High", status: "Open" },
    ],
  },
  dailylog: {
    entries: [
      { id: "d1", date: "2026-08-24", weather: "Clear, 78°F", crew: "12 (Concrete crew of 8, Laborers 4)", workPerformed: "Set foundation forms, placed rebar for footings", delays: "None" },
      { id: "d2", date: "2026-08-25", weather: "Partly cloudy, 74°F", crew: "10 (Concrete crew of 8, PM on site)", workPerformed: "Poured footings north side", delays: "1hr delay waiting on concrete truck" },
      { id: "d3", date: "2026-08-26", weather: "Rain, 65°F", crew: "4 (Laborers only)", workPerformed: "Site cleanup, material staging under cover", delays: "Concrete pour postponed due to rain" },
    ],
  },
  submittals: {
    items: [
      { id: "s1", number: "RFI-014", type: "RFI", subject: "Beam-to-column connection detail at grid line C-4 unclear on S-201", ballInCourt: "Structural Engineer", dueDate: "2026-09-02", status: "Open" },
      { id: "s2", number: "SUB-022", type: "Submittal", subject: "Rooftop HVAC unit shop drawings", ballInCourt: "Architect", dueDate: "2026-09-05", status: "Revise & Resubmit" },
      { id: "s3", number: "RFI-013", type: "RFI", subject: "Confirm waterproofing membrane at below-grade wall", ballInCourt: "Contractor", dueDate: "2026-08-28", status: "Answered" },
      { id: "s4", number: "SUB-021", type: "Submittal", subject: "Structural steel mill certificates", ballInCourt: "Architect", dueDate: "2026-08-20", status: "Approved" },
    ],
  },
  punchlist: {
    items: [
      { id: "p1", location: "Unit 204 — Kitchen", description: "Touch up paint around window trim", trade: "Painting", assignedTo: "ABC Painting Co.", status: "Open" },
      { id: "p2", location: "Lobby", description: "Adjust misaligned entry door closer", trade: "Doors & Hardware", assignedTo: "XYZ Door Systems", status: "In Progress" },
      { id: "p3", location: "Unit 108 — Bathroom", description: "Re-caulk tub surround", trade: "Plumbing", assignedTo: "Reliable Plumbing", status: "Complete" },
      { id: "p4", location: "Roof", description: "Confirm flashing seal at HVAC curb", trade: "Roofing", assignedTo: "Summit Roofing", status: "Verified" },
    ],
  },
  budget: {
    items: [
      { id: "b1", category: "Sitework", description: "Excavation & grading", estimated: 38000, actual: 41200 },
      { id: "b2", category: "Concrete", description: "Foundation & footings", estimated: 62000, actual: 59800 },
      { id: "b3", category: "Framing", description: "Rough carpentry labor & material", estimated: 95000, actual: 0 },
      { id: "b4", category: "MEP", description: "Mechanical, electrical, plumbing rough-in", estimated: 110000, actual: 0 },
    ],
  },
};

// ===== Page navigation =====
function showPage(id) { PAGES.forEach((pid) => { document.getElementById(pid).style.display = pid === id ? "block" : "none"; }); }
function showApp() { showPage("appView"); }
function showLanding() { showPage("landingView"); }

// ===== New Project modal =====
let modalCallback = null;
function promptNewProject(onCreate) {
  document.getElementById("modalProjectName").value = "";
  document.getElementById("modalProjectType").value = "Residential";
  document.getElementById("newProjectModalOverlay").style.display = "flex";
  document.getElementById("modalProjectName").focus();
  modalCallback = onCreate;
}
function closeNewProjectModal() { document.getElementById("newProjectModalOverlay").style.display = "none"; modalCallback = null; }
document.getElementById("modalCancel").addEventListener("click", closeNewProjectModal);
document.getElementById("modalCreate").addEventListener("click", () => {
  const name = document.getElementById("modalProjectName").value.trim();
  const type = document.getElementById("modalProjectType").value;
  if (!name) { alert("Please enter a project name."); return; }
  const cb = modalCallback;
  closeNewProjectModal();
  if (cb) cb(name, type);
});
document.getElementById("modalProjectName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("modalCreate").click(); }
});

// ===== Add Item modal (manual entry, all modules) =====
function fieldRow(label, inputHtml) { return `<label>${label}</label>${inputHtml}`; }

function ensureCollection(type) {
  if (type === "gantt" && !state.gantt) state.gantt = [];
  if (type === "kanban" && !state.kanban) state.kanban = { columns: [{ name: "To Do", cards: [] }, { name: "In Progress", cards: [] }, { name: "Done", cards: [] }] };
  if (type === "raid" && !state.raid) state.raid = { items: [] };
  if (type === "dailylog" && !state.dailylog) state.dailylog = { entries: [] };
  if (type === "submittals" && !state.submittals) state.submittals = { items: [] };
  if (type === "punchlist" && !state.punchlist) state.punchlist = { items: [] };
  if (type === "burndown" && !state.burndown) state.burndown = { days: [] };
  if (type === "teammember" && !state.team) state.team = { members: [] };
  if (type === "timesheet") {
    if (!state.team) state.team = { members: [] };
    if (!state.timesheets) state.timesheets = { entries: [] };
  }
  if (type === "budget" && !state.budget) state.budget = { items: [] };
}

const ADD_TITLES = {
  gantt: "Add Task", kanban: "Add Card", raid: "Add RAID Item", dailylog: "Add Daily Log Entry",
  submittals: "Add Submittal / RFI", punchlist: "Add Punch List Item", burndown: "Add Day",
  teammember: "Add Team Member", timesheet: "Log Hours", budget: "Add Budget Line Item",
};

const FIELD_BUILDERS = {
  gantt: () => `
    ${fieldRow("Task name", `<input type="text" id="af-name" placeholder="e.g. Rough-in electrical">`)}
    ${fieldRow("Start date", `<input type="date" id="af-start">`)}
    ${fieldRow("End date", `<input type="date" id="af-end">`)}
    ${fieldRow("Progress (%)", `<input type="number" id="af-progress" min="0" max="100" value="0">`)}
  `,
  kanban: () => {
    const cols = state.kanban.columns.map((c) => c.name);
    return `${fieldRow("Card title", `<input type="text" id="af-title" placeholder="e.g. Pour footings">`)}
    ${fieldRow("Column", `<select id="af-column">${cols.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>`)}`;
  },
  raid: () => `
    ${fieldRow("Type", `<select id="af-type"><option>Risk</option><option>Assumption</option><option>Issue</option><option>Dependency</option></select>`)}
    ${fieldRow("Description", `<textarea id="af-description" rows="3" placeholder="e.g. Steel delivery could slip past framing start"></textarea>`)}
    ${fieldRow("Owner", `<input type="text" id="af-owner" placeholder="e.g. PM">`)}
    ${fieldRow("Impact", `<select id="af-impact"><option>Low</option><option selected>Medium</option><option>High</option></select>`)}
    ${fieldRow("Status", `<select id="af-status"><option selected>Open</option><option>Monitoring</option><option>Mitigated</option><option>Closed</option></select>`)}
  `,
  dailylog: () => `
    ${fieldRow("Date", `<input type="date" id="af-date" value="${todayISO()}">`)}
    ${fieldRow("Weather", `<input type="text" id="af-weather" placeholder="e.g. Clear, 75°F">`)}
    ${fieldRow("Crew", `<input type="text" id="af-crew" placeholder="e.g. 10 (Framing crew)">`)}
    ${fieldRow("Work performed", `<textarea id="af-workPerformed" rows="3"></textarea>`)}
    ${fieldRow("Delays", `<input type="text" id="af-delays" value="None">`)}
  `,
  submittals: () => `
    ${fieldRow("Number", `<input type="text" id="af-number" placeholder="e.g. RFI-015 or SUB-010">`)}
    ${fieldRow("Type", `<select id="af-type"><option>RFI</option><option>Submittal</option></select>`)}
    ${fieldRow("Subject", `<textarea id="af-subject" rows="3"></textarea>`)}
    ${fieldRow("Ball-in-Court", `<input type="text" id="af-ballInCourt" placeholder="e.g. Architect">`)}
    ${fieldRow("Due date", `<input type="date" id="af-dueDate">`)}
    ${fieldRow("Status", `<select id="af-status"><option selected>Open</option><option>Answered</option><option>Approved</option><option>Rejected</option><option>Revise &amp; Resubmit</option></select>`)}
  `,
  punchlist: () => `
    ${fieldRow("Location", `<input type="text" id="af-location" placeholder="e.g. Unit 204 — Kitchen">`)}
    ${fieldRow("Description", `<textarea id="af-description" rows="3"></textarea>`)}
    ${fieldRow("Trade", `<input type="text" id="af-trade" placeholder="e.g. Painting">`)}
    ${fieldRow("Assigned to", `<input type="text" id="af-assignedTo" placeholder="e.g. ABC Painting Co.">`)}
    ${fieldRow("Status", `<select id="af-status"><option selected>Open</option><option>In Progress</option><option>Complete</option><option>Verified</option></select>`)}
  `,
  burndown: () => {
    const nextDay = state.burndown.days.length;
    const lastActual = nextDay > 0 ? state.burndown.days[nextDay - 1].actual : 0;
    const lastIdeal = nextDay > 0 ? state.burndown.days[nextDay - 1].ideal : 0;
    return `${fieldRow("Day #", `<input type="number" id="af-day" value="${nextDay}">`)}
    ${fieldRow("Planned remaining", `<input type="number" id="af-ideal" value="${lastIdeal}">`)}
    ${fieldRow("Actual remaining", `<input type="number" id="af-actual" value="${lastActual}">`)}`;
  },
  teammember: () => `
    ${fieldRow("Name", `<input type="text" id="af-name" placeholder="e.g. John Smith">`)}
    ${fieldRow("Role", `<input type="text" id="af-role" placeholder="e.g. Site Superintendent">`)}
  `,
  timesheet: () => {
    const members = state.team.members;
    const options = members.length
      ? members.map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join("")
      : `<option value="">Add a team member first</option>`;
    return `${fieldRow("Team member", `<select id="af-memberName">${options}</select>`)}
    ${fieldRow("Date", `<input type="date" id="af-date" value="${todayISO()}">`)}
    ${fieldRow("Task / activity", `<input type="text" id="af-taskName" placeholder="e.g. Framing 2nd floor">`)}
    ${fieldRow("Hours", `<input type="number" id="af-hours" min="0" max="24" step="0.5" value="8">`)}`;
  },
  budget: () => `
    ${fieldRow("Category", `<input type="text" id="af-category" placeholder="e.g. Concrete">`)}
    ${fieldRow("Description", `<input type="text" id="af-description" placeholder="e.g. Foundation & footings">`)}
    ${fieldRow("Estimated ($)", `<input type="number" id="af-estimated" min="0" step="1" value="0">`)}
    ${fieldRow("Actual ($)", `<input type="number" id="af-actual" min="0" step="1" value="0">`)}
  `,
};

function openAddModal(type) {
  ensureCollection(type);
  document.getElementById("addItemModalTitle").textContent = ADD_TITLES[type];
  document.getElementById("addItemModalFields").innerHTML = FIELD_BUILDERS[type]();
  document.getElementById("addItemModalOverlay").dataset.type = type;
  document.getElementById("addItemModalOverlay").style.display = "flex";
  const firstInput = document.querySelector("#addItemModalFields input, #addItemModalFields select, #addItemModalFields textarea");
  if (firstInput) firstInput.focus();
}
function closeAddModal() { document.getElementById("addItemModalOverlay").style.display = "none"; }
document.getElementById("addItemCancel").addEventListener("click", closeAddModal);
document.querySelectorAll("[data-add-type]").forEach((btn) => { btn.addEventListener("click", () => openAddModal(btn.dataset.addType)); });

document.getElementById("addItemSubmit").addEventListener("click", () => {
  const type = document.getElementById("addItemModalOverlay").dataset.type;
  const val = (id) => { const el = document.getElementById(`af-${id}`); return el ? el.value.trim() : ""; };

  if (type === "gantt") {
    const name = val("name"), start = val("start"), end = val("end");
    if (!name || !start || !end) { alert("Please fill in task name, start date, and end date."); return; }
    const nextId = state.gantt.length ? Math.max(...state.gantt.map((t) => Number(t.id) || 0)) + 1 : 1;
    state.gantt.push({ id: nextId, name, start, end, progress: Number(val("progress")) || 0 });
    renderGantt(state.gantt);
  } else if (type === "kanban") {
    const title = val("title"), columnName = val("column");
    if (!title) { alert("Please enter a card title."); return; }
    const col = state.kanban.columns.find((c) => c.name === columnName) || state.kanban.columns[0];
    col.cards.push({ id: "c" + Date.now(), title });
    renderKanban(state.kanban);
  } else if (type === "raid") {
    const description = val("description");
    if (!description) { alert("Please enter a description."); return; }
    state.raid.items.push({ id: "r" + Date.now(), type: val("type"), description, owner: val("owner"), impact: val("impact"), status: val("status") });
    renderRaid(state.raid);
  } else if (type === "dailylog") {
    const date = val("date");
    if (!date) { alert("Please choose a date."); return; }
    state.dailylog.entries.push({ id: "d" + Date.now(), date, weather: val("weather"), crew: val("crew"), workPerformed: val("workPerformed"), delays: val("delays") || "None" });
    renderDailyLog(state.dailylog);
  } else if (type === "submittals") {
    const number = val("number"), subject = val("subject");
    if (!number || !subject) { alert("Please enter a number and subject."); return; }
    state.submittals.items.push({ id: "s" + Date.now(), number, type: val("type"), subject, ballInCourt: val("ballInCourt"), dueDate: val("dueDate"), status: val("status") });
    renderSubmittals(state.submittals);
  } else if (type === "punchlist") {
    const location = val("location"), description = val("description");
    if (!location || !description) { alert("Please enter a location and description."); return; }
    state.punchlist.items.push({ id: "p" + Date.now(), location, description, trade: val("trade"), assignedTo: val("assignedTo"), status: val("status") });
    renderPunchlist(state.punchlist);
  } else if (type === "burndown") {
    const day = Number(val("day")), ideal = Number(val("ideal")), actual = Number(val("actual"));
    state.burndown.days = state.burndown.days.filter((d) => d.day !== day);
    state.burndown.days.push({ day, ideal, actual });
    state.burndown.days.sort((a, b) => a.day - b.day);
    renderBurndown(state.burndown);
  } else if (type === "teammember") {
    const name = val("name");
    if (!name) { alert("Please enter a name."); return; }
    state.team.members.push({ id: "m" + Date.now(), name, role: val("role") });
    renderTeam();
  } else if (type === "timesheet") {
    const memberName = val("memberName"), date = val("date");
    if (!memberName) { alert("Add a team member first."); return; }
    if (!date) { alert("Please choose a date."); return; }
    state.timesheets.entries.push({ id: "t" + Date.now(), memberName, date, taskName: val("taskName"), hours: Number(val("hours")) || 0 });
    renderTeam();
  } else if (type === "budget") {
    const description = val("description");
    if (!description) { alert("Please enter a description."); return; }
    state.budget.items.push({ id: "b" + Date.now(), category: val("category"), description, estimated: Number(val("estimated")) || 0, actual: Number(val("actual")) || 0 });
    renderBudget(state.budget);
  }

  persistActiveProject();
  closeAddModal();
});

// ===== Delete row/card (event delegation) =====
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".row-delete-btn");
  if (!btn) return;
  const [type, id] = btn.dataset.del.split(":");
  deleteItem(type, id);
});
function deleteItem(type, id) {
  if (type === "gantt") { state.gantt = state.gantt.filter((t) => String(t.id) !== id); renderGantt(state.gantt); }
  else if (type === "kanban") { state.kanban.columns.forEach((col) => { col.cards = col.cards.filter((c) => c.id !== id); }); renderKanban(state.kanban); }
  else if (type === "raid") { state.raid.items = state.raid.items.filter((i) => i.id !== id); renderRaid(state.raid); }
  else if (type === "dailylog") { state.dailylog.entries = state.dailylog.entries.filter((i) => i.id !== id); renderDailyLog(state.dailylog); }
  else if (type === "submittals") { state.submittals.items = state.submittals.items.filter((i) => i.id !== id); renderSubmittals(state.submittals); }
  else if (type === "punchlist") { state.punchlist.items = state.punchlist.items.filter((i) => i.id !== id); renderPunchlist(state.punchlist); }
  else if (type === "burndown") { state.burndown.days = state.burndown.days.filter((d) => String(d.day) !== id); renderBurndown(state.burndown); }
  else if (type === "teammember") { state.team.members = state.team.members.filter((m) => m.id !== id); renderTeam(); }
  else if (type === "timesheet") { state.timesheets.entries = state.timesheets.entries.filter((t) => t.id !== id); renderTeam(); }
  else if (type === "budget") { state.budget.items = state.budget.items.filter((i) => i.id !== id); renderBudget(state.budget); }
  persistActiveProject();
}

// ===== Projects (localStorage) =====
function loadAllProjects() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function saveAllProjects(projects) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch (e) { console.error("Storage save failed", e); } }
function newProjectState(name, type) {
  return {
    name, type: type || "",
    charts: { gantt: null, burndown: null, kanban: null, raid: null, dailylog: null, submittals: null, punchlist: null, team: null, timesheets: null, budget: null },
    apiHistory: [], chatLog: [], updatedAt: Date.now(),
  };
}
function initProjects() {
  let projects = loadAllProjects();
  let active = localStorage.getItem(ACTIVE_KEY);
  if (!active || !projects[active]) {
    const id = "p_" + Date.now();
    projects[id] = newProjectState("My Project", "Residential");
    saveAllProjects(projects);
    localStorage.setItem(ACTIVE_KEY, id);
    active = id;
  }
  activeProjectId = active;
  loadProjectIntoApp(projects[active]);
  renderProjectSelector();
}
function loadProjectIntoApp(project) {
  state.gantt = project.charts.gantt;
  state.burndown = project.charts.burndown;
  state.kanban = project.charts.kanban;
  state.raid = project.charts.raid;
  state.dailylog = project.charts.dailylog || null;
  state.submittals = project.charts.submittals || null;
  state.punchlist = project.charts.punchlist || null;
  state.team = project.charts.team || null;
  state.timesheets = project.charts.timesheets || null;
  state.budget = project.charts.budget || null;
  history = project.apiHistory ? [...project.apiHistory] : [];
  chatLogData = project.chatLog ? [...project.chatLog] : [];

  renderGantt(state.gantt);
  renderBurndown(state.burndown);
  renderKanban(state.kanban);
  renderRaid(state.raid);
  renderDailyLog(state.dailylog);
  renderSubmittals(state.submittals);
  renderPunchlist(state.punchlist);
  renderTeam();
  renderBudget(state.budget);
  renderDashboard();
  renderCalendar();
  rebuildChatLogDom();

  const badge = document.getElementById("projectTypeBadge");
  if (badge) badge.textContent = project.type || "";
}
function persistActiveProject() {
  const projects = loadAllProjects();
  if (!activeProjectId || !projects[activeProjectId]) return;
  projects[activeProjectId].charts = {
    gantt: state.gantt, burndown: state.burndown, kanban: state.kanban, raid: state.raid,
    dailylog: state.dailylog, submittals: state.submittals, punchlist: state.punchlist,
    team: state.team, timesheets: state.timesheets, budget: state.budget,
  };
  projects[activeProjectId].apiHistory = history;
  projects[activeProjectId].chatLog = chatLogData;
  projects[activeProjectId].updatedAt = Date.now();
  saveAllProjects(projects);
}
function renderProjectSelector() {
  const projects = loadAllProjects();
  const select = document.getElementById("projectSelect");
  select.innerHTML = Object.entries(projects)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .map(([id, p]) => `<option value="${id}" ${id === activeProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");
}
function switchActiveProject(id) {
  persistActiveProject();
  activeProjectId = id;
  localStorage.setItem(ACTIVE_KEY, id);
  const projects = loadAllProjects();
  loadProjectIntoApp(projects[id]);
  renderProjectSelector();
}

document.getElementById("projectSelect").addEventListener("change", (e) => { switchActiveProject(e.target.value); setTicker("SYSTEM READY · SWITCHED PROJECT"); });
document.getElementById("btnNewProject").addEventListener("click", () => {
  const currentTab = document.querySelector(".tab.active")?.dataset.view || "dashboard";
  promptNewProject((name, type) => createProjectAndOpen(name, type, currentTab, false));
});
document.getElementById("btnRenameProject").addEventListener("click", () => {
  const projects = loadAllProjects();
  const current = projects[activeProjectId];
  if (!current) return;
  const name = prompt("Rename project:", current.name);
  if (!name) return;
  current.name = name;
  saveAllProjects(projects);
  renderProjectSelector();
});
document.getElementById("btnDeleteProject").addEventListener("click", () => {
  const projects = loadAllProjects();
  const ids = Object.keys(projects);
  if (ids.length <= 1) { alert("You need at least one project — create a new one before deleting this."); return; }
  if (!confirm(`Delete "${projects[activeProjectId].name}"? This can't be undone.`)) return;
  delete projects[activeProjectId];
  saveAllProjects(projects);
  const nextId = Object.keys(projects)[0];
  activeProjectId = nextId;
  localStorage.setItem(ACTIVE_KEY, nextId);
  loadProjectIntoApp(projects[nextId]);
  renderProjectSelector();
});

function createProjectAndOpen(name, type, tab, goToApp = true) {
  persistActiveProject();
  const projects = loadAllProjects();
  const id = "p_" + Date.now();
  projects[id] = newProjectState(name, type);
  saveAllProjects(projects);
  activeProjectId = id;
  localStorage.setItem(ACTIVE_KEY, id);
  loadProjectIntoApp(projects[id]);
  renderProjectSelector();
  if (goToApp) { showApp(); switchView(tab); }
}

// ===== Tabs =====
document.querySelectorAll(".tab").forEach((tab) => { tab.addEventListener("click", () => switchView(tab.dataset.view)); });
function switchView(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.view === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "dashboard") renderDashboard();
  if (name === "calendar") renderCalendar();
}

// ===== Sample loaders =====
document.querySelectorAll("[data-sample]").forEach((btn) => { btn.addEventListener("click", () => loadSample(btn.dataset.sample)); });
function loadSample(kind) {
  if (kind === "gantt") state.gantt = SAMPLES.gantt, renderGantt(state.gantt);
  if (kind === "burndown") state.burndown = SAMPLES.burndown, renderBurndown(state.burndown);
  if (kind === "kanban") state.kanban = SAMPLES.kanban, renderKanban(state.kanban);
  if (kind === "raid") state.raid = SAMPLES.raid, renderRaid(state.raid);
  if (kind === "dailylog") state.dailylog = SAMPLES.dailylog, renderDailyLog(state.dailylog);
  if (kind === "submittals") state.submittals = SAMPLES.submittals, renderSubmittals(state.submittals);
  if (kind === "punchlist") state.punchlist = SAMPLES.punchlist, renderPunchlist(state.punchlist);
  if (kind === "budget") state.budget = SAMPLES.budget, renderBudget(state.budget);
  persistActiveProject();
}

// ===== Export: PNG via html2canvas =====
document.querySelectorAll("[data-export-png]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const el = document.getElementById(btn.dataset.exportPng);
    if (!el) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Exporting…";
    try {
      const canvas = await html2canvas(el, { backgroundColor: "#232326", scale: 2 });
      downloadCanvas(canvas, btn.dataset.exportName || "chart");
    } catch (e) { alert("Export failed — try the Export PDF option instead."); }
    finally { btn.disabled = false; btn.textContent = original; }
  });
});
document.querySelectorAll("[data-export-png-canvas]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const canvas = document.getElementById(btn.dataset.exportPngCanvas);
    if (!canvas) return;
    downloadCanvas(canvas, btn.dataset.exportName || "chart");
  });
});
function downloadCanvas(canvas, name) {
  const link = document.createElement("a");
  link.download = `${name}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
document.querySelectorAll("[data-export-print]").forEach((btn) => { btn.addEventListener("click", () => window.print()); });

// ===== Gantt rendering =====
function renderGantt(tasks) {
  state.gantt = tasks;
  const wrap = document.getElementById("ganttWrap");
  if (!tasks || !tasks.length) {
    wrap.innerHTML = `<div class="empty-state" id="ganttEmpty"><p>No schedule yet.</p><button class="btn-ghost" data-sample="gantt">Load a sample schedule</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  const dates = tasks.flatMap((t) => [new Date(t.start), new Date(t.end)]);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const totalDays = Math.max(1, Math.round((maxDate - minDate) / 86400000) + 1);
  const weekCount = Math.ceil(totalDays / 7);
  let scaleHtml = "";
  for (let w = 0; w < weekCount; w++) scaleHtml += `<span>Wk ${w + 1}</span>`;

  let rows = "";
  tasks.forEach((t) => {
    const startOffset = Math.round((new Date(t.start) - minDate) / 86400000);
    const durDays = Math.max(1, Math.round((new Date(t.end) - new Date(t.start)) / 86400000) + 1);
    const leftPct = (startOffset / totalDays) * 100;
    const widthPct = (durDays / totalDays) * 100;
    rows += `
      <div class="gantt-row">
        <div class="gantt-task-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
        <div class="gantt-track">
          <div class="gantt-track-bg"></div>
          <div class="gantt-bar" style="left:${leftPct}%; width:${widthPct}%;"><div class="gantt-bar-fill" style="width:${t.progress || 0}%;"></div></div>
          <div class="gantt-bar-label" style="left:calc(${leftPct}% + 8px)">${escapeHtml(t.name)} · ${t.progress || 0}%</div>
        </div>
        <button class="row-delete-btn" data-del="gantt:${t.id}" title="Delete task">×</button>
      </div>`;
  });
  wrap.innerHTML = `<div class="gantt-header"><div>Task</div><div class="gantt-scale">${scaleHtml}</div><div></div></div>${rows}`;
}

// ===== Burndown rendering =====
function renderBurndown(data) {
  state.burndown = data;
  const emptyEl = document.getElementById("burndownEmpty");
  const canvas = document.getElementById("burndownChart");
  const tableEl = document.getElementById("burndownTable");
  if (!data || !data.days || !data.days.length) {
    emptyEl.style.display = "block"; canvas.style.display = "none"; tableEl.innerHTML = "";
    return;
  }
  emptyEl.style.display = "none"; canvas.style.display = "block";
  const labels = data.days.map((d) => `Day ${d.day}`);
  const ideal = data.days.map((d) => d.ideal);
  const actual = data.days.map((d) => d.actual);
  if (burndownChartInstance) burndownChartInstance.destroy();
  burndownChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [
      { label: "Planned", data: ideal, borderColor: "#6B6B72", borderDash: [5, 4], pointRadius: 0, tension: 0 },
      { label: "Actual", data: actual, borderColor: "#F2B705", backgroundColor: "rgba(242,183,5,0.12)", fill: true, pointRadius: 3, tension: 0.25 },
    ]},
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#A6A6AC", font: { family: "IBM Plex Mono", size: 11 } } } },
      scales: {
        x: { ticks: { color: "#6B6B72" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#6B6B72" }, grid: { color: "rgba(255,255,255,0.05)" }, title: { display: true, text: "Work remaining", color: "#A6A6AC" } },
      },
    },
  });
  const rows = [...data.days].sort((a, b) => a.day - b.day).map((d) => `
      <tr><td>Day ${d.day}</td><td>${d.ideal}</td><td>${d.actual}</td>
      <td class="col-delete"><button class="row-delete-btn" data-del="burndown:${d.day}" title="Delete day">×</button></td></tr>`).join("");
  tableEl.innerHTML = `<table class="log-table"><thead><tr><th>Day</th><th>Planned</th><th>Actual</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ===== Kanban rendering =====
function renderKanban(data) {
  state.kanban = data;
  const wrap = document.getElementById("kanbanWrap");
  if (!data || !data.columns || !data.columns.length) {
    wrap.innerHTML = `<div class="empty-state" id="kanbanEmpty"><p>No task board yet.</p><button class="btn-ghost" data-sample="kanban">Load a sample board</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  wrap.innerHTML = data.columns.map((col, ci) => `
    <div class="kanban-col" data-col="${ci}">
      <div class="kanban-col-head"><span>${escapeHtml(col.name)}</span><span class="kanban-count">${col.cards.length}</span></div>
      <div class="kanban-cards" data-col-cards="${ci}">
        ${col.cards.map((card) => `<div class="kanban-card" draggable="true" data-card-id="${card.id}">${escapeHtml(card.title)}<button class="row-delete-btn" data-del="kanban:${card.id}" title="Delete card">×</button></div>`).join("")}
      </div>
    </div>`).join("");
  attachDragEvents();
}
function attachDragEvents() {
  let draggedId = null;
  document.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", () => { draggedId = card.dataset.cardId; card.classList.add("dragging"); });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  document.querySelectorAll(".kanban-col").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", () => { col.classList.remove("drag-over"); moveCard(draggedId, Number(col.dataset.col)); });
  });
}
function moveCard(cardId, targetColIdx) {
  if (!state.kanban) return;
  let moved = null;
  state.kanban.columns.forEach((col) => { const idx = col.cards.findIndex((c) => c.id === cardId); if (idx > -1) moved = col.cards.splice(idx, 1)[0]; });
  if (moved) state.kanban.columns[targetColIdx].cards.push(moved);
  renderKanban(state.kanban);
  persistActiveProject();
}

// ===== RAID rendering =====
function renderRaid(data) {
  state.raid = data;
  const wrap = document.getElementById("raidWrap");
  if (!data || !data.items || !data.items.length) {
    wrap.innerHTML = `<div class="empty-state" id="raidEmpty"><p>No RAID log yet.</p><button class="btn-ghost" data-sample="raid">Load a sample log</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  const rows = data.items.map((item) => `
      <tr><td><span class="raid-badge type-${slug(item.type)}">${escapeHtml(item.type)}</span></td>
      <td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.owner || "—")}</td>
      <td><span class="raid-badge impact-${slug(item.impact)}">${escapeHtml(item.impact || "—")}</span></td>
      <td><span class="raid-badge status-${slug(item.status)}">${escapeHtml(item.status || "—")}</span></td>
      <td class="col-delete"><button class="row-delete-btn" data-del="raid:${item.id}" title="Delete item">×</button></td></tr>`).join("");
  wrap.innerHTML = `<table class="raid-table"><thead><tr><th>Type</th><th>Description</th><th>Owner</th><th>Impact</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ===== Daily Log rendering =====
function renderDailyLog(data) {
  state.dailylog = data;
  const wrap = document.getElementById("dailylogWrap");
  if (!data || !data.entries || !data.entries.length) {
    wrap.innerHTML = `<div class="empty-state" id="dailylogEmpty"><p>No site reports yet.</p><button class="btn-ghost" data-sample="dailylog">Load sample entries</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  const rows = [...data.entries].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => `
      <tr><td>${escapeHtml(e.date)}</td><td>${escapeHtml(e.weather || "—")}</td><td>${escapeHtml(e.crew || "—")}</td>
      <td>${escapeHtml(e.workPerformed || "—")}</td><td>${escapeHtml(e.delays || "None")}</td>
      <td class="col-delete"><button class="row-delete-btn" data-del="dailylog:${e.id}" title="Delete entry">×</button></td></tr>`).join("");
  wrap.innerHTML = `<table class="log-table"><thead><tr><th>Date</th><th>Weather</th><th>Crew</th><th>Work Performed</th><th>Delays</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ===== Submittals & RFI rendering =====
function renderSubmittals(data) {
  state.submittals = data;
  const wrap = document.getElementById("submittalsWrap");
  if (!data || !data.items || !data.items.length) {
    wrap.innerHTML = `<div class="empty-state" id="submittalsEmpty"><p>No submittals or RFIs logged yet.</p><button class="btn-ghost" data-sample="submittals">Load a sample log</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  const rows = data.items.map((item) => `
      <tr><td><span class="log-badge type-${slug(item.type)}">${escapeHtml(item.number)}</span></td>
      <td>${escapeHtml(item.subject)}</td><td>${escapeHtml(item.ballInCourt || "—")}</td><td>${escapeHtml(item.dueDate || "—")}</td>
      <td><span class="log-badge status-${slug(item.status)}">${escapeHtml(item.status || "—")}</span></td>
      <td class="col-delete"><button class="row-delete-btn" data-del="submittals:${item.id}" title="Delete item">×</button></td></tr>`).join("");
  wrap.innerHTML = `<table class="log-table"><thead><tr><th>Number</th><th>Subject</th><th>Ball-in-Court</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ===== Punch List rendering =====
function renderPunchlist(data) {
  state.punchlist = data;
  const wrap = document.getElementById("punchlistWrap");
  if (!data || !data.items || !data.items.length) {
    wrap.innerHTML = `<div class="empty-state" id="punchlistEmpty"><p>No punch list yet.</p><button class="btn-ghost" data-sample="punchlist">Load a sample list</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  const rows = data.items.map((item) => `
      <tr><td>${escapeHtml(item.location)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.trade || "—")}</td>
      <td>${escapeHtml(item.assignedTo || "—")}</td><td><span class="log-badge status-${slug(item.status)}">${escapeHtml(item.status || "—")}</span></td>
      <td class="col-delete"><button class="row-delete-btn" data-del="punchlist:${item.id}" title="Delete item">×</button></td></tr>`).join("");
  wrap.innerHTML = `<table class="log-table"><thead><tr><th>Location</th><th>Description</th><th>Trade</th><th>Assigned To</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ===== Team & Timesheets rendering =====
function renderTeam() {
  const wrap = document.getElementById("teamWrap");
  if (!wrap) return;
  const members = (state.team && state.team.members) || [];
  const entries = (state.timesheets && state.timesheets.entries) || [];

  const rosterRows = members.length
    ? members.map((m) => `
      <tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.role || "—")}</td>
      <td class="col-delete"><button class="row-delete-btn" data-del="teammember:${m.id}" title="Remove member">×</button></td></tr>`).join("")
    : `<tr><td colspan="3" style="color:var(--text-faint)">No crew added yet.</td></tr>`;

  const sortedEntries = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const timesheetRows = sortedEntries.length
    ? sortedEntries.map((t) => `
      <tr><td>${escapeHtml(t.memberName)}</td><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.taskName || "—")}</td><td>${t.hours}</td>
      <td class="col-delete"><button class="row-delete-btn" data-del="timesheet:${t.id}" title="Delete entry">×</button></td></tr>`).join("")
    : `<tr><td colspan="5" style="color:var(--text-faint)">No hours logged yet.</td></tr>`;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const workloadMap = {};
  members.forEach((m) => { workloadMap[m.name] = 0; });
  entries.forEach((t) => {
    const d = new Date(t.date);
    if (d >= weekAgo && d <= now) workloadMap[t.memberName] = (workloadMap[t.memberName] || 0) + Number(t.hours || 0);
  });
  const workloadRows = members.length
    ? members.map((m) => {
        const hrs = workloadMap[m.name] || 0;
        const pct = Math.min(100, (hrs / 40) * 100);
        const cls = hrs > 45 ? "bad" : hrs > 40 ? "warn" : "";
        return `<div class="workload-row"><div class="workload-name">${escapeHtml(m.name)}</div>
          <div class="workload-bar-track"><div class="workload-bar-fill ${cls}" style="width:${pct}%"></div></div>
          <div class="workload-hours">${hrs}h / 40h</div></div>`;
      }).join("")
    : `<p style="color:var(--text-faint); font-size:13px; margin:0;">Add crew members to see weekly workload.</p>`;

  wrap.innerHTML = `
    <div class="team-panel">
      <h2>Crew</h2>
      <table class="log-table"><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>${rosterRows}</tbody></table>
    </div>
    <div class="team-panel">
      <h2>Weekly Workload (last 7 days)</h2>
      ${workloadRows}
    </div>
    <div class="team-panel">
      <h2>Timesheets</h2>
      <table class="log-table"><thead><tr><th>Member</th><th>Date</th><th>Task</th><th>Hours</th><th></th></tr></thead><tbody>${timesheetRows}</tbody></table>
    </div>
  `;
}

// ===== Budget rendering =====
function renderBudget(data) {
  state.budget = data;
  const wrap = document.getElementById("budgetWrap");
  if (!data || !data.items || !data.items.length) {
    wrap.innerHTML = `<div class="empty-state" id="budgetEmpty"><p>No budget line items yet.</p><button class="btn-ghost" data-sample="budget">Load a sample budget</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  const rows = data.items.map((item) => {
    const variance = item.actual - item.estimated;
    const varClass = item.actual === 0 ? "" : variance > 0 ? "cost-over" : "cost-under";
    const varText = item.actual === 0 ? "—" : `${variance > 0 ? "+" : ""}$${variance.toLocaleString()}`;
    return `<tr><td>${escapeHtml(item.category || "—")}</td><td>${escapeHtml(item.description)}</td>
      <td>$${Number(item.estimated).toLocaleString()}</td><td>${item.actual ? "$" + Number(item.actual).toLocaleString() : "—"}</td>
      <td class="${varClass}">${varText}</td>
      <td class="col-delete"><button class="row-delete-btn" data-del="budget:${item.id}" title="Delete item">×</button></td></tr>`;
  }).join("");
  const totalEst = data.items.reduce((n, i) => n + Number(i.estimated || 0), 0);
  const totalAct = data.items.reduce((n, i) => n + Number(i.actual || 0), 0);
  const totalVar = totalAct - totalEst;
  wrap.innerHTML = `
    <table class="log-table">
      <thead><tr><th>Category</th><th>Description</th><th>Estimated</th><th>Actual</th><th>Variance</th><th></th></tr></thead>
      <tbody>${rows}
        <tr class="totals-row"><td colspan="2">TOTAL</td><td>$${totalEst.toLocaleString()}</td><td>$${totalAct.toLocaleString()}</td>
        <td class="${totalVar > 0 ? "cost-over" : totalVar < 0 ? "cost-under" : ""}">${totalVar === 0 ? "—" : (totalVar > 0 ? "+" : "") + "$" + totalVar.toLocaleString()}</td><td></td></tr>
      </tbody>
    </table>`;
}

// ===== Dashboard rendering (computed, read-only) =====
function renderDashboard() {
  const wrap = document.getElementById("dashboardWrap");
  if (!wrap) return;

  const tasks = state.gantt || [];
  const avgProgress = tasks.length ? Math.round(tasks.reduce((n, t) => n + (t.progress || 0), 0) / tasks.length) : null;
  const today = todayISO();
  const overdue = tasks.filter((t) => t.end < today && (t.progress || 0) < 100).length;

  const budgetItems = (state.budget && state.budget.items) || [];
  const totalEst = budgetItems.reduce((n, i) => n + Number(i.estimated || 0), 0);
  const totalAct = budgetItems.reduce((n, i) => n + Number(i.actual || 0), 0);
  const budgetVar = totalAct - totalEst;

  const raidOpen = ((state.raid && state.raid.items) || []).filter((i) => i.status === "Open" || i.status === "Monitoring").length;
  const punchOpen = ((state.punchlist && state.punchlist.items) || []).filter((i) => i.status === "Open" || i.status === "In Progress").length;
  const subOpen = ((state.submittals && state.submittals.items) || []).filter((i) => i.status === "Open" || i.status === "Revise & Resubmit").length;

  const kanbanCols = (state.kanban && state.kanban.columns) || [];
  const kanbanTotal = kanbanCols.reduce((n, c) => n + c.cards.length, 0);

  const members = (state.team && state.team.members) || [];
  const entries = (state.timesheets && state.timesheets.entries) || [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const totalHoursThisWeek = entries.filter((t) => { const d = new Date(t.date); return d >= weekAgo && d <= now; }).reduce((n, t) => n + Number(t.hours || 0), 0);

  wrap.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card${overdue > 0 ? " bad" : ""}">
        <div class="stat-label">Schedule</div>
        <div class="stat-value">${avgProgress === null ? "—" : avgProgress + "%"}</div>
        <div class="stat-sub">${tasks.length} task${tasks.length === 1 ? "" : "s"}${overdue ? ` · ${overdue} overdue` : ""}</div>
      </div>
      <div class="stat-card${budgetVar > 0 ? " bad" : budgetVar < 0 ? " good" : ""}">
        <div class="stat-label">Budget Variance</div>
        <div class="stat-value">${budgetItems.length ? (budgetVar >= 0 ? "+" : "") + "$" + budgetVar.toLocaleString() : "—"}</div>
        <div class="stat-sub">$${totalAct.toLocaleString()} actual of $${totalEst.toLocaleString()} estimated</div>
      </div>
      <div class="stat-card${raidOpen > 0 ? " warn" : ""}">
        <div class="stat-label">Open RAID Items</div>
        <div class="stat-value">${raidOpen}</div>
        <div class="stat-sub">Risks, issues &amp; assumptions being tracked</div>
      </div>
      <div class="stat-card${subOpen > 0 ? " warn" : ""}">
        <div class="stat-label">Open Submittals/RFIs</div>
        <div class="stat-value">${subOpen}</div>
        <div class="stat-sub">Awaiting response</div>
      </div>
      <div class="stat-card${punchOpen > 0 ? " warn" : ""}">
        <div class="stat-label">Open Punch Items</div>
        <div class="stat-value">${punchOpen}</div>
        <div class="stat-sub">Not yet complete or verified</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Site Tasks</div>
        <div class="stat-value">${kanbanTotal}</div>
        <div class="stat-sub">${kanbanCols.map((c) => `${c.name}: ${c.cards.length}`).join(" · ") || "No board yet"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Crew Hours (7 days)</div>
        <div class="stat-value">${totalHoursThisWeek}</div>
        <div class="stat-sub">${members.length} team member${members.length === 1 ? "" : "s"}</div>
      </div>
    </div>
    <div class="dashboard-section-title">Weekly Workload</div>
    <div class="team-panel">${renderWorkloadRowsOnly(members, entries)}</div>
  `;
}
function renderWorkloadRowsOnly(members, entries) {
  if (!members.length) return `<p style="color:var(--text-faint); font-size:13px; margin:0;">No crew added yet — add team members on the Team tab.</p>`;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const workloadMap = {};
  members.forEach((m) => { workloadMap[m.name] = 0; });
  entries.forEach((t) => { const d = new Date(t.date); if (d >= weekAgo && d <= now) workloadMap[t.memberName] = (workloadMap[t.memberName] || 0) + Number(t.hours || 0); });
  return members.map((m) => {
    const hrs = workloadMap[m.name] || 0;
    const pct = Math.min(100, (hrs / 40) * 100);
    const cls = hrs > 45 ? "bad" : hrs > 40 ? "warn" : "";
    return `<div class="workload-row"><div class="workload-name">${escapeHtml(m.name)}</div>
      <div class="workload-bar-track"><div class="workload-bar-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="workload-hours">${hrs}h / 40h</div></div>`;
  }).join("");
}

// ===== Calendar rendering (computed, read-only) =====
function renderCalendar() {
  const wrap = document.getElementById("calendarWrap");
  if (!wrap) return;
  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayISO();

  const eventsByDate = {};
  const addEvent = (dateStr, label, cls) => {
    if (!dateStr) return;
    if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
    eventsByDate[dateStr].push({ label, cls });
  };
  (state.gantt || []).forEach((t) => { addEvent(t.start, `▶ ${t.name}`, "ev-gantt-start"); addEvent(t.end, `■ ${t.name}`, "ev-gantt-end"); });
  ((state.dailylog && state.dailylog.entries) || []).forEach((e) => addEvent(e.date, "Site report", "ev-dailylog"));
  ((state.submittals && state.submittals.items) || []).forEach((s) => addEvent(s.dueDate, `${s.number} due`, "ev-submittal"));

  let cellsHtml = "";
  for (let i = 0; i < startWeekday; i++) cellsHtml += `<div class="calendar-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const events = eventsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    cellsHtml += `<div class="calendar-cell${isToday ? " today" : ""}">
      <div class="calendar-date">${d}</div>
      ${events.slice(0, 3).map((e) => `<div class="calendar-event ${e.cls}" title="${escapeHtml(e.label)}">${escapeHtml(e.label)}</div>`).join("")}
      ${events.length > 3 ? `<div class="calendar-event" style="background:var(--border-strong)">+${events.length - 3} more</div>` : ""}
    </div>`;
  }

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  wrap.innerHTML = `
    <div class="calendar-month-label">${monthLabel}</div>
    <div class="calendar-grid">
      ${dowLabels.map((d) => `<div class="calendar-dow">${d}</div>`).join("")}
      ${cellsHtml}
    </div>`;
}
document.getElementById("calPrev").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
document.getElementById("calNext").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
document.getElementById("calToday").addEventListener("click", () => { calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(); });

function slug(s) { return String(s || "").toLowerCase().replace(/&/g, "and").replace(/\s+/g, "-"); }
function rebindSampleButton(container) { container.querySelectorAll("[data-sample]").forEach((btn) => { btn.addEventListener("click", () => loadSample(btn.dataset.sample)); }); }
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function setTicker(text, live = false) { const el = document.getElementById("tickerText"); el.textContent = text; el.classList.toggle("live", live); }

// ===================== BROWSE PAGES (7 field modules) =====================
const CHART_META = {
  gantt: { label: "Project Schedules", sub: "All projects with a schedule", empty: "No schedules yet." },
  kanban: { label: "Site Task Boards", sub: "All projects with a site task board", empty: "No task boards yet." },
  burndown: { label: "Schedule Burndowns", sub: "All projects with a burndown chart", empty: "No burndown charts yet." },
  raid: { label: "RAID Logs", sub: "All projects with a RAID log", empty: "No RAID logs yet." },
  dailylog: { label: "Daily Logs", sub: "All projects with site reports", empty: "No daily logs yet." },
  submittals: { label: "Submittals & RFIs", sub: "All projects with submittals or RFIs logged", empty: "No submittals or RFIs yet." },
  punchlist: { label: "Punch Lists", sub: "All projects with a punch list", empty: "No punch lists yet." },
};
let currentBrowseType = "gantt";

function chartStat(type, chart) {
  if (type === "gantt") return `${chart.length} task${chart.length === 1 ? "" : "s"}`;
  if (type === "kanban") { const total = chart.columns.reduce((n, c) => n + c.cards.length, 0); return `${chart.columns.length} columns · ${total} cards`; }
  if (type === "burndown") return `${chart.days.length}-day sprint`;
  if (type === "raid" || type === "submittals" || type === "punchlist") return `${chart.items.length} item${chart.items.length === 1 ? "" : "s"}`;
  if (type === "dailylog") return `${chart.entries.length} entr${chart.entries.length === 1 ? "y" : "ies"}`;
  return "";
}
function hasChart(type, chart) {
  if (!chart) return false;
  if (type === "gantt") return Array.isArray(chart) && chart.length > 0;
  if (type === "kanban") return Array.isArray(chart.columns) && chart.columns.length > 0;
  if (type === "burndown") return Array.isArray(chart.days) && chart.days.length > 0;
  if (type === "raid" || type === "submittals" || type === "punchlist") return Array.isArray(chart.items) && chart.items.length > 0;
  if (type === "dailylog") return Array.isArray(chart.entries) && chart.entries.length > 0;
  return false;
}
function openBrowse(type) {
  currentBrowseType = type;
  const meta = CHART_META[type];
  document.getElementById("browseTitle").textContent = meta.label;
  document.getElementById("browseSub").textContent = meta.sub;
  renderBrowseGrid(type);
  showPage("browseView");
}
function renderBrowseGrid(type) {
  const projects = loadAllProjects();
  const grid = document.getElementById("browseGrid");
  const matches = Object.entries(projects).filter(([, p]) => hasChart(type, p.charts[type]));
  matches.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  if (!matches.length) {
    grid.innerHTML = `<div class="browse-empty"><p>${CHART_META[type].empty}</p><button class="btn-primary" id="browseEmptyAdd"><span>＋</span> Add New Project</button></div>`;
    document.getElementById("browseEmptyAdd").addEventListener("click", () => { promptNewProject((name, ptype) => createProjectAndOpen(name, ptype, type, true)); });
    return;
  }
  grid.innerHTML = matches.map(([id, p]) => `
      <div class="browse-card" data-project-id="${id}">
        <div class="browse-card-name">${escapeHtml(p.name)}</div>
        <div class="browse-card-meta">${escapeHtml(p.type || "")}${p.type ? " · " : ""}Updated ${timeAgo(p.updatedAt)}</div>
        <div class="browse-card-stat">${chartStat(type, p.charts[type])}</div>
        <div class="browse-card-open">Open →</div>
      </div>`).join("");
  grid.querySelectorAll(".browse-card").forEach((card) => {
    card.addEventListener("click", () => { switchActiveProject(card.dataset.projectId); showApp(); switchView(type); });
  });
}
document.getElementById("browseAddNew").addEventListener("click", () => { promptNewProject((name, type) => createProjectAndOpen(name, type, currentBrowseType, true)); });
document.querySelectorAll('[data-browse]').forEach((card) => {
  card.addEventListener("click", () => openBrowse(card.dataset.browse));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter") openBrowse(card.dataset.browse); });
});
document.getElementById("backToLandingFromBrowse").addEventListener("click", (e) => { e.preventDefault(); showLanding(); });
document.getElementById("brandHomeBrowse").addEventListener("click", () => showLanding());

// ===================== Team / Budget / Calendar landing cards (deep-link into current project) =====================
document.getElementById("cardTeam").addEventListener("click", () => { showApp(); switchView("team"); });
document.getElementById("cardBudget").addEventListener("click", () => { showApp(); switchView("budget"); });
document.getElementById("cardCalendar").addEventListener("click", () => { showApp(); switchView("calendar"); });
[["cardTeam", "team"], ["cardBudget", "budget"], ["cardCalendar", "calendar"]].forEach(([id, tab]) => {
  document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") { showApp(); switchView(tab); } });
});

// ===================== PORTFOLIO (all-projects overview) =====================
function openPortfolio() { renderPortfolioGrid(); showPage("portfolioView"); }
function projectStats(p) {
  const c = p.charts || {};
  const tasks = c.gantt || [];
  const avgProgress = tasks.length ? Math.round(tasks.reduce((n, t) => n + (t.progress || 0), 0) / tasks.length) : null;
  const budgetItems = (c.budget && c.budget.items) || [];
  const totalEst = budgetItems.reduce((n, i) => n + Number(i.estimated || 0), 0);
  const totalAct = budgetItems.reduce((n, i) => n + Number(i.actual || 0), 0);
  const budgetVar = totalAct - totalEst;
  const raidOpen = ((c.raid && c.raid.items) || []).filter((i) => i.status === "Open" || i.status === "Monitoring").length;
  const punchOpen = ((c.punchlist && c.punchlist.items) || []).filter((i) => i.status === "Open" || i.status === "In Progress").length;
  const subOpen = ((c.submittals && c.submittals.items) || []).filter((i) => i.status === "Open" || i.status === "Revise & Resubmit").length;
  return { avgProgress, totalEst, totalAct, budgetVar, openItems: raidOpen + punchOpen + subOpen };
}
function renderPortfolioGrid() {
  const projects = loadAllProjects();
  const grid = document.getElementById("portfolioGrid");
  const entries = Object.entries(projects).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  if (!entries.length) {
    grid.innerHTML = `<div class="portfolio-empty"><p>No projects yet.</p><button class="btn-primary" id="portfolioEmptyAdd"><span>＋</span> Add New Project</button></div>`;
    document.getElementById("portfolioEmptyAdd").addEventListener("click", () => { promptNewProject((name, type) => createProjectAndOpen(name, type, "dashboard", true)); });
    return;
  }
  grid.innerHTML = entries.map(([id, p]) => {
    const s = projectStats(p);
    const pills = [
      `<span class="portfolio-stat-pill">${s.avgProgress === null ? "No schedule" : s.avgProgress + "% complete"}</span>`,
      `<span class="portfolio-stat-pill ${s.totalEst ? (s.budgetVar > 0 ? "bad" : "good") : ""}">${s.totalEst ? (s.budgetVar >= 0 ? "+" : "") + "$" + s.budgetVar.toLocaleString() + " var" : "No budget"}</span>`,
      `<span class="portfolio-stat-pill ${s.openItems > 0 ? "warn" : ""}">${s.openItems} open item${s.openItems === 1 ? "" : "s"}</span>`,
    ].join("");
    return `<div class="portfolio-card" data-project-id="${id}">
      <div class="portfolio-card-name">${escapeHtml(p.name)}</div>
      <div class="portfolio-card-meta">${escapeHtml(p.type || "")}${p.type ? " · " : ""}Updated ${timeAgo(p.updatedAt)}</div>
      <div class="portfolio-stat-row">${pills}</div>
      <div class="portfolio-card-open">Open Dashboard →</div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".portfolio-card").forEach((card) => {
    card.addEventListener("click", () => { switchActiveProject(card.dataset.projectId); showApp(); switchView("dashboard"); });
  });
}
document.getElementById("portfolioAddNew").addEventListener("click", () => { promptNewProject((name, type) => createProjectAndOpen(name, type, "dashboard", true)); });
document.getElementById("navPortfolio").addEventListener("click", (e) => { e.preventDefault(); openPortfolio(); });
document.getElementById("backToLandingFromPortfolio").addEventListener("click", (e) => { e.preventDefault(); showLanding(); });
document.getElementById("brandHomePortfolio").addEventListener("click", () => showLanding());

// ===================== DEDICATED CHAT PAGE =====================
function openChatPage() { renderChatHistoryList(); showPage("chatPageView"); }
function renderChatHistoryList() {
  const projects = loadAllProjects();
  const list = document.getElementById("chatHistoryList");
  const entries = Object.entries(projects).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  list.innerHTML = entries.map(([id, p]) => {
    const lastMsg = [...(p.chatLog || [])].reverse().find((m) => m.kind === "user" || m.kind === "assistant");
    const snippet = lastMsg ? lastMsg.text.slice(0, 46) + (lastMsg.text.length > 46 ? "…" : "") : "No messages yet";
    return `<div class="chat-history-item ${id === activeProjectId ? "active" : ""}" data-project-id="${id}">
        <div class="chat-history-name">${escapeHtml(p.name)}</div>
        <div class="chat-history-meta">${escapeHtml(snippet)}</div></div>`;
  }).join("");
  list.querySelectorAll(".chat-history-item").forEach((item) => { item.addEventListener("click", () => { switchActiveProject(item.dataset.projectId); renderChatHistoryList(); }); });
}
document.getElementById("btnNewChat").addEventListener("click", () => { createProjectAndOpen("New chat", "", "dashboard", false); renderChatHistoryList(); });
document.getElementById("backToLandingFromChat").addEventListener("click", (e) => { e.preventDefault(); showLanding(); });
document.getElementById("brandHomeChat").addEventListener("click", () => showLanding());
document.getElementById("cardAiAssistant").addEventListener("click", () => openChatPage());
document.getElementById("cardAiAssistant").addEventListener("keydown", (e) => { if (e.key === "Enter") openChatPage(); });

// ===================== CHAT (shared logic, two mount points) =====================
const CHAT_MOUNTS = [
  { log: "chatLog", form: "chatForm", input: "chatInput", send: "chatSend" },
  { log: "chatLogPage", form: "chatFormPage", input: "chatInputPage", send: "chatSendPage" },
];
const VIEW_LABELS = { gantt: "Schedule", kanban: "Site Tasks", burndown: "Progress", raid: "RAID Log", dailylog: "Daily Log", submittals: "Submittals/RFI", punchlist: "Punch List", team: "Team", budget: "Budget", calendar: "Calendar", dashboard: "Dashboard" };

function addMessage(role, text) { chatLogData.push({ kind: role, text }); CHAT_MOUNTS.forEach((m) => renderChatBubble(document.getElementById(m.log), role, text)); }
function addNote(text, viewTab) { chatLogData.push({ kind: "note", text, viewTab }); CHAT_MOUNTS.forEach((m) => renderChatBubble(document.getElementById(m.log), "note", text, viewTab)); }
function renderChatBubble(container, kind, text, viewTab) {
  if (!container) return;
  const div = document.createElement("div");
  div.className = kind === "note" ? "msg-note" : `msg msg-${kind}`;
  div.textContent = text;
  if (kind === "note" && viewTab) {
    const link = document.createElement("span");
    link.className = "chat-view-link";
    link.textContent = `View in ${VIEW_LABELS[viewTab] || viewTab} →`;
    link.addEventListener("click", () => { showApp(); switchView(viewTab); });
    div.appendChild(document.createElement("br"));
    div.appendChild(link);
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
function rebuildChatLogDom() {
  CHAT_MOUNTS.forEach((m) => { const el = document.getElementById(m.log); if (el) el.innerHTML = ""; });
  if (!chatLogData.length) {
    CHAT_MOUNTS.forEach((m) => renderChatBubble(document.getElementById(m.log), "assistant",
      "Hi — I'm your construction project management assistant. Ask me anything about scheduling, RFIs, change orders, safety, budget, or crew coordination, or ask me to draft or edit your schedule, site task board, burndown, RAID log, daily log, submittals/RFI log, punch list, team, or budget. You can also add anything manually with the \"+ Add\" button on each page."));
    return;
  }
  chatLogData.forEach((m) => CHAT_MOUNTS.forEach((mount) => renderChatBubble(document.getElementById(mount.log), m.kind, m.text, m.viewTab)));
}

function extractJsonAction(reply) {
  const match = reply.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}
function handleAssistantReply(reply) {
  const action = extractJsonAction(reply);
  const spokenText = reply.replace(/```json\s*[\s\S]*?```/i, "").trim();
  if (spokenText) addMessage("assistant", spokenText);

  if (action && action.action) {
    if (action.action === "gantt" && action.data) { renderGantt(action.data); addNote(`✓ Schedule updated (${action.data.length} tasks)`, "gantt"); setTicker(`DRAFTED SCHEDULE · ${action.data.length} TASKS`, true); }
    else if (action.action === "burndown" && action.data) { renderBurndown(action.data); addNote(`✓ Burndown chart updated`, "burndown"); setTicker(`DRAFTED BURNDOWN · ${action.data.days.length} DAYS`, true); }
    else if (action.action === "kanban" && action.data) { renderKanban(action.data); const total = action.data.columns.reduce((n, c) => n + c.cards.length, 0); addNote(`✓ Site task board updated (${total} cards)`, "kanban"); setTicker(`DRAFTED TASK BOARD · ${total} CARDS`, true); }
    else if (action.action === "raid" && action.data) { renderRaid(action.data); const total = (action.data.items || []).length; addNote(`✓ RAID log updated (${total} items)`, "raid"); setTicker(`DRAFTED RAID LOG · ${total} ITEMS`, true); }
    else if (action.action === "dailylog" && action.data) { renderDailyLog(action.data); const total = (action.data.entries || []).length; addNote(`✓ Daily log updated (${total} entries)`, "dailylog"); setTicker(`DRAFTED DAILY LOG · ${total} ENTRIES`, true); }
    else if (action.action === "submittals" && action.data) { renderSubmittals(action.data); const total = (action.data.items || []).length; addNote(`✓ Submittals/RFI log updated (${total} items)`, "submittals"); setTicker(`DRAFTED SUBMITTALS LOG · ${total} ITEMS`, true); }
    else if (action.action === "punchlist" && action.data) { renderPunchlist(action.data); const total = (action.data.items || []).length; addNote(`✓ Punch list updated (${total} items)`, "punchlist"); setTicker(`DRAFTED PUNCH LIST · ${total} ITEMS`, true); }
    else if (action.action === "team" && action.data) { state.team = action.data; renderTeam(); const total = (action.data.members || []).length; addNote(`✓ Team updated (${total} members)`, "team"); setTicker(`DRAFTED TEAM · ${total} MEMBERS`, true); }
    else if (action.action === "timesheet" && action.data) { state.timesheets = action.data; renderTeam(); const total = (action.data.entries || []).length; addNote(`✓ Timesheets updated (${total} entries)`, "team"); setTicker(`DRAFTED TIMESHEETS · ${total} ENTRIES`, true); }
    else if (action.action === "budget" && action.data) { renderBudget(action.data); const total = (action.data.items || []).length; addNote(`✓ Budget updated (${total} line items)`, "budget"); setTicker(`DRAFTED BUDGET · ${total} ITEMS`, true); }
    persistActiveProject();
  } else {
    setTicker("SYSTEM READY · ASK THE ASSISTANT TO PLAN, TRACK, OR CHART YOUR PROJECT");
  }
}

async function sendChatMessage(text) {
  addMessage("user", text);
  history.push({ role: "user", content: text });
  CHAT_MOUNTS.forEach((m) => { const btn = document.getElementById(m.send); if (btn) btn.disabled = true; });
  setTicker("ASSISTANT THINKING…", true);
  try {
    const trimmedHistory = history.slice(-MAX_API_HISTORY);
    const projects = loadAllProjects();
    const projectType = (projects[activeProjectId] && projects[activeProjectId].type) || "";
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: trimmedHistory, charts: state, projectType }),
    });
    const data = await res.json();
    if (!res.ok) { addMessage("assistant", `Error: ${data.error || "the assistant is unavailable right now."}`); setTicker("SYSTEM ERROR · CHECK API KEY CONFIGURATION"); return; }
    const reply = data.reply || "";
    history.push({ role: "assistant", content: reply });
    handleAssistantReply(reply);
    persistActiveProject();
    renderChatHistoryList();
  } catch (err) {
    addMessage("assistant", "Error: couldn't reach the server. Check your connection and try again.");
    setTicker("SYSTEM ERROR · REQUEST FAILED");
  } finally {
    CHAT_MOUNTS.forEach((m) => { const btn = document.getElementById(m.send); if (btn) btn.disabled = false; });
  }
}
CHAT_MOUNTS.forEach((m) => {
  const form = document.getElementById(m.form);
  const input = document.getElementById(m.input);
  if (!form || !input) return;
  form.addEventListener("submit", (e) => { e.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ""; sendChatMessage(text); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
});

// ===== Landing page misc =====
document.getElementById("btnAddProject").addEventListener("click", () => { promptNewProject((name, type) => createProjectAndOpen(name, type, "dashboard", true)); });
document.getElementById("btnViewProjects").addEventListener("click", () => showApp());
document.getElementById("navDashboard").addEventListener("click", (e) => { e.preventDefault(); showApp(); });
document.getElementById("navHelp").addEventListener("click", (e) => { e.preventDefault(); document.getElementById("helpPanel").classList.toggle("open"); });
document.getElementById("brandHome").addEventListener("click", () => { persistActiveProject(); showLanding(); });

// ===== API key status check =====
(async function checkStatus() {
  const dot = document.getElementById("apiDot");
  const text = document.getElementById("apiStatusText");
  try {
    const res = await fetch("/api/chat", { method: "GET" });
    const data = await res.json();
    if (data.configured) { dot.classList.add("ok"); text.textContent = "Assistant online"; }
    else { dot.classList.add("bad"); text.textContent = "API key missing"; }
  } catch { dot.classList.add("bad"); text.textContent = "Server unreachable"; }
})();

// ===== Boot =====
initProjects();
