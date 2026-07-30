// ===== Constants =====
const STORAGE_KEY = "trackline_projects_v1";
const ACTIVE_KEY = "trackline_active_project_v1";
const MAX_API_HISTORY = 10; // trim to last N messages (~5 turns) sent to the API to control cost
const PAGES = ["landingView", "appView", "browseView", "chatPageView"];

// ===== State =====
let state = {
  gantt: null,     // [{id,name,start,end,progress}]
  burndown: null,  // {days:[{day,ideal,actual}]}
  kanban: null,    // {columns:[{name,cards:[{id,title}]}]}
  raid: null,      // {items:[{id,type,description,owner,impact,status}]}
};
let history = [];      // full API-role history: [{role, content}]
let chatLogData = [];  // display log: [{kind:'user'|'assistant'|'note', text, viewTab?}]
let burndownChartInstance = null;
let activeProjectId = null;

// ===== Sample data =====
const SAMPLES = {
  gantt: [
    { id: 1, name: "Discovery & requirements", start: "2026-08-03", end: "2026-08-09", progress: 100 },
    { id: 2, name: "UX wireframes", start: "2026-08-10", end: "2026-08-16", progress: 80 },
    { id: 3, name: "Backend build", start: "2026-08-10", end: "2026-08-30", progress: 40 },
    { id: 4, name: "Frontend build", start: "2026-08-17", end: "2026-09-06", progress: 15 },
    { id: 5, name: "QA & bug bash", start: "2026-09-07", end: "2026-09-13", progress: 0 },
    { id: 6, name: "Launch", start: "2026-09-14", end: "2026-09-14", progress: 0 },
  ],
  burndown: {
    days: Array.from({ length: 11 }, (_, i) => ({
      day: i,
      ideal: 60 - i * 6,
      actual: i === 0 ? 60 : i <= 4 ? 60 - i * 5 : i <= 7 ? 40 - (i - 4) * 7 : 19 - (i - 7) * 6,
    })),
  },
  kanban: {
    columns: [
      { name: "To Do", cards: [{ id: "c1", title: "Draft onboarding checklist" }, { id: "c2", title: "Set up client Slack channel" }] },
      { name: "In Progress", cards: [{ id: "c3", title: "Collect brand assets" }] },
      { name: "Done", cards: [{ id: "c4", title: "Send welcome email" }, { id: "c5", title: "Kickoff call scheduled" }] },
    ],
  },
  raid: {
    items: [
      { id: "r1", type: "Risk", description: "Vendor migration could slip past go-live date", owner: "PM", impact: "High", status: "Open" },
      { id: "r2", type: "Assumption", description: "Current vendor will provide a full data export", owner: "Vendor lead", impact: "Medium", status: "Monitoring" },
      { id: "r3", type: "Issue", description: "Legacy API docs are outdated", owner: "Tech lead", impact: "Medium", status: "Open" },
      { id: "r4", type: "Dependency", description: "Security review must complete before launch", owner: "Security team", impact: "High", status: "Open" },
    ],
  },
};

// ===== Page navigation =====
function showPage(id) {
  PAGES.forEach((pid) => {
    document.getElementById(pid).style.display = pid === id ? "block" : "none";
  });
}
function showApp() { showPage("appView"); }
function showLanding() { showPage("landingView"); }

// ===== Projects (localStorage) =====
function loadAllProjects() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveAllProjects(projects) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch (e) { console.error("Storage save failed", e); }
}
function newProjectState(name) {
  return { name, charts: { gantt: null, burndown: null, kanban: null, raid: null }, apiHistory: [], chatLog: [], updatedAt: Date.now() };
}
function initProjects() {
  let projects = loadAllProjects();
  let active = localStorage.getItem(ACTIVE_KEY);
  if (!active || !projects[active]) {
    const id = "p_" + Date.now();
    projects[id] = newProjectState("My Project");
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
  history = project.apiHistory ? [...project.apiHistory] : [];
  chatLogData = project.chatLog ? [...project.chatLog] : [];

  renderGantt(state.gantt);
  renderBurndown(state.burndown);
  renderKanban(state.kanban);
  renderRaid(state.raid);
  rebuildChatLogDom();
}
function persistActiveProject() {
  const projects = loadAllProjects();
  if (!activeProjectId || !projects[activeProjectId]) return;
  projects[activeProjectId].charts = { gantt: state.gantt, burndown: state.burndown, kanban: state.kanban, raid: state.raid };
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

document.getElementById("projectSelect").addEventListener("change", (e) => {
  switchActiveProject(e.target.value);
  setTicker("SYSTEM READY · SWITCHED PROJECT");
});
document.getElementById("btnNewProject").addEventListener("click", () => {
  const name = prompt("New project name:", "Untitled project");
  if (!name) return;
  createProjectAndOpen(name, "gantt", false);
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

function createProjectAndOpen(name, tab, goToApp = true) {
  persistActiveProject();
  const projects = loadAllProjects();
  const id = "p_" + Date.now();
  projects[id] = newProjectState(name);
  saveAllProjects(projects);
  activeProjectId = id;
  localStorage.setItem(ACTIVE_KEY, id);
  loadProjectIntoApp(projects[id]);
  renderProjectSelector();
  if (goToApp) {
    showApp();
    switchView(tab);
  }
}

// ===== Tabs =====
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});
function switchView(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.view === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
}

// ===== Sample loaders =====
document.querySelectorAll("[data-sample]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.sample;
    if (kind === "gantt") state.gantt = SAMPLES.gantt, renderGantt(state.gantt);
    if (kind === "burndown") state.burndown = SAMPLES.burndown, renderBurndown(state.burndown);
    if (kind === "kanban") state.kanban = SAMPLES.kanban, renderKanban(state.kanban);
    if (kind === "raid") state.raid = SAMPLES.raid, renderRaid(state.raid);
    persistActiveProject();
  });
});

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
    } catch (e) {
      alert("Export failed — try the Export PDF option instead.");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
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
document.querySelectorAll("[data-export-print]").forEach((btn) => {
  btn.addEventListener("click", () => window.print());
});

// ===== Gantt rendering =====
function renderGantt(tasks) {
  state.gantt = tasks;
  const wrap = document.getElementById("ganttWrap");
  if (!tasks || !tasks.length) {
    wrap.innerHTML = `<div class="empty-state" id="ganttEmpty"><p>No timeline yet.</p><button class="btn-ghost" data-sample="gantt">Load a sample plan</button></div>`;
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
          <div class="gantt-bar" style="left:${leftPct}%; width:${widthPct}%;">
            <div class="gantt-bar-fill" style="width:${t.progress || 0}%;"></div>
          </div>
          <div class="gantt-bar-label" style="left:calc(${leftPct}% + 8px)">${escapeHtml(t.name)} · ${t.progress || 0}%</div>
        </div>
      </div>`;
  });

  wrap.innerHTML = `
    <div class="gantt-header">
      <div>Task</div>
      <div class="gantt-scale">${scaleHtml}</div>
    </div>
    ${rows}
  `;
}

// ===== Burndown rendering =====
function renderBurndown(data) {
  state.burndown = data;
  const emptyEl = document.getElementById("burndownEmpty");
  const canvas = document.getElementById("burndownChart");
  if (!data || !data.days || !data.days.length) {
    emptyEl.style.display = "block";
    canvas.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  canvas.style.display = "block";

  const labels = data.days.map((d) => `Day ${d.day}`);
  const ideal = data.days.map((d) => d.ideal);
  const actual = data.days.map((d) => d.actual);

  if (burndownChartInstance) burndownChartInstance.destroy();
  burndownChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ideal", data: ideal, borderColor: "#6B6B72", borderDash: [5, 4], pointRadius: 0, tension: 0 },
        { label: "Actual", data: actual, borderColor: "#F2B705", backgroundColor: "rgba(242,183,5,0.12)", fill: true, pointRadius: 3, tension: 0.25 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#A6A6AC", font: { family: "IBM Plex Mono", size: 11 } } } },
      scales: {
        x: { ticks: { color: "#6B6B72" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#6B6B72" }, grid: { color: "rgba(255,255,255,0.05)" }, title: { display: true, text: "Points remaining", color: "#A6A6AC" } },
      },
    },
  });
}

// ===== Kanban rendering =====
function renderKanban(data) {
  state.kanban = data;
  const wrap = document.getElementById("kanbanWrap");
  if (!data || !data.columns || !data.columns.length) {
    wrap.innerHTML = `<div class="empty-state" id="kanbanEmpty"><p>No board yet.</p><button class="btn-ghost" data-sample="kanban">Load a sample board</button></div>`;
    rebindSampleButton(wrap);
    return;
  }
  wrap.innerHTML = data.columns
    .map(
      (col, ci) => `
    <div class="kanban-col" data-col="${ci}">
      <div class="kanban-col-head"><span>${escapeHtml(col.name)}</span><span class="kanban-count">${col.cards.length}</span></div>
      <div class="kanban-cards" data-col-cards="${ci}">
        ${col.cards.map((card) => `<div class="kanban-card" draggable="true" data-card-id="${card.id}">${escapeHtml(card.title)}</div>`).join("")}
      </div>
    </div>`
    )
    .join("");

  attachDragEvents();
}

function attachDragEvents() {
  let draggedId = null;
  document.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedId = card.dataset.cardId;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  document.querySelectorAll(".kanban-col").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", () => {
      col.classList.remove("drag-over");
      const targetIdx = Number(col.dataset.col);
      moveCard(draggedId, targetIdx);
    });
  });
}

function moveCard(cardId, targetColIdx) {
  if (!state.kanban) return;
  let moved = null;
  state.kanban.columns.forEach((col) => {
    const idx = col.cards.findIndex((c) => c.id === cardId);
    if (idx > -1) moved = col.cards.splice(idx, 1)[0];
  });
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
  const rows = data.items
    .map(
      (item) => `
      <tr>
        <td><span class="raid-badge type-${slug(item.type)}">${escapeHtml(item.type)}</span></td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.owner || "—")}</td>
        <td><span class="raid-badge impact-${slug(item.impact)}">${escapeHtml(item.impact || "—")}</span></td>
        <td><span class="raid-badge status-${slug(item.status)}">${escapeHtml(item.status || "—")}</span></td>
      </tr>`
    )
    .join("");
  wrap.innerHTML = `
    <table class="raid-table">
      <thead><tr><th>Type</th><th>Description</th><th>Owner</th><th>Impact</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
function slug(s) { return String(s || "").toLowerCase().replace(/\s+/g, "-"); }

function rebindSampleButton(container) {
  container.querySelectorAll("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.sample;
      if (kind === "gantt") renderGantt(SAMPLES.gantt);
      if (kind === "burndown") renderBurndown(SAMPLES.burndown);
      if (kind === "kanban") renderKanban(SAMPLES.kanban);
      if (kind === "raid") renderRaid(SAMPLES.raid);
      persistActiveProject();
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ===== Ticker =====
function setTicker(text, live = false) {
  const el = document.getElementById("tickerText");
  el.textContent = text;
  el.classList.toggle("live", live);
}

// ===================== BROWSE PAGES =====================
const CHART_META = {
  gantt: { label: "Gantt Timelines", sub: "All projects with a Gantt chart", empty: "No Gantt charts yet." },
  kanban: { label: "Kanban Boards", sub: "All projects with a Kanban board", empty: "No Kanban boards yet." },
  burndown: { label: "Sprint Burndowns", sub: "All projects with a burndown chart", empty: "No burndown charts yet." },
  raid: { label: "RAID Logs", sub: "All projects with a RAID log", empty: "No RAID logs yet." },
};
let currentBrowseType = "gantt";

function chartStat(type, chart) {
  if (type === "gantt") return `${chart.length} task${chart.length === 1 ? "" : "s"}`;
  if (type === "kanban") {
    const total = chart.columns.reduce((n, c) => n + c.cards.length, 0);
    return `${chart.columns.length} columns · ${total} cards`;
  }
  if (type === "burndown") return `${chart.days.length}-day sprint`;
  if (type === "raid") return `${chart.items.length} item${chart.items.length === 1 ? "" : "s"}`;
  return "";
}
function hasChart(type, chart) {
  if (!chart) return false;
  if (type === "gantt") return Array.isArray(chart) && chart.length > 0;
  if (type === "kanban") return Array.isArray(chart.columns) && chart.columns.length > 0;
  if (type === "burndown") return Array.isArray(chart.days) && chart.days.length > 0;
  if (type === "raid") return Array.isArray(chart.items) && chart.items.length > 0;
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
    grid.innerHTML = `
      <div class="browse-empty">
        <p>${CHART_META[type].empty}</p>
        <button class="btn-primary" id="browseEmptyAdd"><span>＋</span> Add New Project</button>
      </div>`;
    document.getElementById("browseEmptyAdd").addEventListener("click", () => {
      const name = prompt("Name your new project:", "Untitled project");
      if (!name) return;
      createProjectAndOpen(name, type, true);
    });
    return;
  }

  grid.innerHTML = matches
    .map(
      ([id, p]) => `
      <div class="browse-card" data-project-id="${id}">
        <div class="browse-card-name">${escapeHtml(p.name)}</div>
        <div class="browse-card-meta">Updated ${timeAgo(p.updatedAt)}</div>
        <div class="browse-card-stat">${chartStat(type, p.charts[type])}</div>
        <div class="browse-card-open">Open →</div>
      </div>`
    )
    .join("");

  grid.querySelectorAll(".browse-card").forEach((card) => {
    card.addEventListener("click", () => {
      switchActiveProject(card.dataset.projectId);
      showApp();
      switchView(type);
    });
  });
}

document.getElementById("browseAddNew").addEventListener("click", () => {
  const name = prompt("Name your new project:", "Untitled project");
  if (!name) return;
  createProjectAndOpen(name, currentBrowseType, true);
});
document.querySelectorAll('[data-browse]').forEach((card) => {
  card.addEventListener("click", () => openBrowse(card.dataset.browse));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter") openBrowse(card.dataset.browse); });
});
document.getElementById("backToLandingFromBrowse").addEventListener("click", (e) => { e.preventDefault(); showLanding(); });
document.getElementById("brandHomeBrowse").addEventListener("click", () => showLanding());

// ===================== DEDICATED CHAT PAGE =====================
function openChatPage() {
  renderChatHistoryList();
  showPage("chatPageView");
}
function renderChatHistoryList() {
  const projects = loadAllProjects();
  const list = document.getElementById("chatHistoryList");
  const entries = Object.entries(projects).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  list.innerHTML = entries
    .map(([id, p]) => {
      const lastMsg = [...(p.chatLog || [])].reverse().find((m) => m.kind === "user" || m.kind === "assistant");
      const snippet = lastMsg ? lastMsg.text.slice(0, 46) + (lastMsg.text.length > 46 ? "…" : "") : "No messages yet";
      return `
      <div class="chat-history-item ${id === activeProjectId ? "active" : ""}" data-project-id="${id}">
        <div class="chat-history-name">${escapeHtml(p.name)}</div>
        <div class="chat-history-meta">${escapeHtml(snippet)}</div>
      </div>`;
    })
    .join("");
  list.querySelectorAll(".chat-history-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchActiveProject(item.dataset.projectId);
      renderChatHistoryList();
    });
  });
}
document.getElementById("btnNewChat").addEventListener("click", () => {
  createProjectAndOpen("New chat", "gantt", false);
  renderChatHistoryList();
});
document.getElementById("backToLandingFromChat").addEventListener("click", (e) => { e.preventDefault(); showLanding(); });
document.getElementById("brandHomeChat").addEventListener("click", () => showLanding());
document.getElementById("cardAiAssistant").addEventListener("click", () => openChatPage());
document.getElementById("cardAiAssistant").addEventListener("keydown", (e) => { if (e.key === "Enter") openChatPage(); });

// ===================== CHAT (shared logic, two mount points) =====================
const CHAT_MOUNTS = [
  { log: "chatLog", form: "chatForm", input: "chatInput", send: "chatSend" },
  { log: "chatLogPage", form: "chatFormPage", input: "chatInputPage", send: "chatSendPage" },
];

function addMessage(role, text) {
  chatLogData.push({ kind: role, text });
  CHAT_MOUNTS.forEach((m) => renderChatBubble(document.getElementById(m.log), role, text));
}
function addNote(text, viewTab) {
  chatLogData.push({ kind: "note", text, viewTab });
  CHAT_MOUNTS.forEach((m) => renderChatBubble(document.getElementById(m.log), "note", text, viewTab));
}
function renderChatBubble(container, kind, text, viewTab) {
  if (!container) return;
  const div = document.createElement("div");
  div.className = kind === "note" ? "msg-note" : `msg msg-${kind}`;
  div.textContent = text;
  if (kind === "note" && viewTab) {
    const link = document.createElement("span");
    link.className = "chat-view-link";
    link.textContent = `View in ${viewTab[0].toUpperCase()}${viewTab.slice(1)} →`;
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
    CHAT_MOUNTS.forEach((m) =>
      renderChatBubble(
        document.getElementById(m.log),
        "assistant",
        "Hi — I'm your project management assistant. Ask me anything about scheduling, risk, agile ceremonies, or estimation, or ask me to draft or edit a Gantt chart, burndown, kanban board, or RAID log."
      )
    );
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
    if (action.action === "gantt" && action.data) {
      renderGantt(action.data);
      addNote(`✓ Gantt chart updated (${action.data.length} tasks)`, "gantt");
      setTicker(`DRAFTED GANTT · ${action.data.length} TASKS`, true);
    } else if (action.action === "burndown" && action.data) {
      renderBurndown(action.data);
      addNote(`✓ Burndown chart updated`, "burndown");
      setTicker(`DRAFTED BURNDOWN · ${action.data.days.length} DAYS`, true);
    } else if (action.action === "kanban" && action.data) {
      renderKanban(action.data);
      const total = action.data.columns.reduce((n, c) => n + c.cards.length, 0);
      addNote(`✓ Kanban board updated (${total} cards)`, "kanban");
      setTicker(`DRAFTED KANBAN · ${total} CARDS`, true);
    } else if (action.action === "raid" && action.data) {
      renderRaid(action.data);
      const total = (action.data.items || []).length;
      addNote(`✓ RAID log updated (${total} items)`, "raid");
      setTicker(`DRAFTED RAID LOG · ${total} ITEMS`, true);
    }
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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: trimmedHistory, charts: state }),
    });
    const data = await res.json();

    if (!res.ok) {
      addMessage("assistant", `Error: ${data.error || "the assistant is unavailable right now."}`);
      setTicker("SYSTEM ERROR · CHECK API KEY CONFIGURATION");
      return;
    }

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
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendChatMessage(text);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
});

// ===== Landing page misc =====
document.getElementById("btnAddProject").addEventListener("click", () => {
  const name = prompt("Name your new project:", "Untitled project");
  if (!name) return;
  createProjectAndOpen(name, "gantt", true);
});
document.getElementById("btnViewProjects").addEventListener("click", () => showApp());
document.getElementById("navDashboard").addEventListener("click", (e) => { e.preventDefault(); showApp(); });
document.getElementById("navHelp").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("helpPanel").classList.toggle("open");
});
document.getElementById("brandHome").addEventListener("click", () => { persistActiveProject(); showLanding(); });

// ===== API key status check =====
(async function checkStatus() {
  const dot = document.getElementById("apiDot");
  const text = document.getElementById("apiStatusText");
  try {
    const res = await fetch("/api/chat", { method: "GET" });
    const data = await res.json();
    if (data.configured) {
      dot.classList.add("ok");
      text.textContent = "Assistant online";
    } else {
      dot.classList.add("bad");
      text.textContent = "API key missing";
    }
  } catch {
    dot.classList.add("bad");
    text.textContent = "Server unreachable";
  }
})();

// ===== Boot =====
initProjects();
