// ===== Constants =====
const STORAGE_KEY = "trackline_projects_v1";
const ACTIVE_KEY = "trackline_active_project_v1";
const MAX_API_HISTORY = 10; // trim to last N messages (~5 turns) sent to the API to control cost

// ===== State =====
let state = {
  gantt: null,     // [{id,name,start,end,progress}]
  burndown: null,  // {days:[{day,ideal,actual}]}
  kanban: null,    // {columns:[{name,cards:[{id,title}]}]}
  raid: null,      // {items:[{id,type,description,owner,impact,status}]}
};
let history = [];      // full API-role history: [{role, content}]
let chatLogData = [];  // display log: [{kind:'user'|'assistant'|'note', text}]
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

document.getElementById("projectSelect").addEventListener("change", (e) => {
  persistActiveProject();
  activeProjectId = e.target.value;
  localStorage.setItem(ACTIVE_KEY, activeProjectId);
  const projects = loadAllProjects();
  loadProjectIntoApp(projects[activeProjectId]);
  setTicker("SYSTEM READY · SWITCHED PROJECT");
});
document.getElementById("btnNewProject").addEventListener("click", () => {
  const name = prompt("New project name:", "Untitled project");
  if (!name) return;
  persistActiveProject();
  const projects = loadAllProjects();
  const id = "p_" + Date.now();
  projects[id] = newProjectState(name);
  saveAllProjects(projects);
  activeProjectId = id;
  localStorage.setItem(ACTIVE_KEY, id);
  loadProjectIntoApp(projects[id]);
  renderProjectSelector();
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
      const canvas = await html2canvas(el, { backgroundColor: "#16212C", scale: 2 });
      downloadCanvas(canvas, btn.dataset.exportName || "chart");
    } catch (e) {
      alert("Export failed — try the Export PDF option instead.");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
});
// ===== Export: PNG directly from a <canvas> (burndown) =====
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
// ===== Export: PDF via browser print =====
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
        { label: "Ideal", data: ideal, borderColor: "#8CA0B3", borderDash: [5, 4], pointRadius: 0, tension: 0 },
        { label: "Actual", data: actual, borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.12)", fill: true, pointRadius: 3, tension: 0.25 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#8CA0B3", font: { family: "IBM Plex Mono", size: 11 } } } },
      scales: {
        x: { ticks: { color: "#576A7B" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#576A7B" }, grid: { color: "rgba(255,255,255,0.05)" }, title: { display: true, text: "Points remaining", color: "#8CA0B3" } },
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

// ===== Ticker =====
function setTicker(text, live = false) {
  const el = document.getElementById("tickerText");
  el.textContent = text;
  el.classList.toggle("live", live);
}

// ===== Chat =====
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatLog = document.getElementById("chatLog");
const sendBtn = document.getElementById("chatSend");

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage("user", text);
  history.push({ role: "user", content: text });
  chatInput.value = "";
  sendBtn.disabled = true;
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
  } catch (err) {
    addMessage("assistant", "Error: couldn't reach the server. Check your connection and try again.");
    setTicker("SYSTEM ERROR · REQUEST FAILED");
  } finally {
    sendBtn.disabled = false;
  }
});

function addMessage(role, text) {
  chatLogData.push({ kind: role, text });
  renderChatBubble(role, text);
}
function addNote(text) {
  chatLogData.push({ kind: "note", text });
  renderChatBubble("note", text);
}
function renderChatBubble(kind, text) {
  const div = document.createElement("div");
  div.className = kind === "note" ? "msg-note" : `msg msg-${kind}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function rebuildChatLogDom() {
  chatLog.innerHTML = "";
  if (!chatLogData.length) {
    renderChatBubble(
      "assistant",
      "Hi — I'm your project management assistant. Ask me anything about scheduling, risk, agile ceremonies, or estimation, or ask me to draft or edit a Gantt chart, burndown, kanban board, or RAID log."
    );
    return;
  }
  chatLogData.forEach((m) => renderChatBubble(m.kind, m.text));
}

// Parses a fenced ```json ... ``` block out of the reply, if present.
function extractJsonAction(reply) {
  const match = reply.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function handleAssistantReply(reply) {
  const action = extractJsonAction(reply);
  const spokenText = reply.replace(/```json\s*[\s\S]*?```/i, "").trim();

  if (spokenText) addMessage("assistant", spokenText);

  if (action && action.action) {
    if (action.action === "gantt" && action.data) {
      renderGantt(action.data);
      switchView("gantt");
      addNote(`✓ Gantt chart updated (${action.data.length} tasks)`);
      setTicker(`DRAFTED GANTT · ${action.data.length} TASKS`, true);
    } else if (action.action === "burndown" && action.data) {
      renderBurndown(action.data);
      switchView("burndown");
      addNote(`✓ Burndown chart updated`);
      setTicker(`DRAFTED BURNDOWN · ${action.data.days.length} DAYS`, true);
    } else if (action.action === "kanban" && action.data) {
      renderKanban(action.data);
      switchView("kanban");
      const total = action.data.columns.reduce((n, c) => n + c.cards.length, 0);
      addNote(`✓ Kanban board updated (${total} cards)`);
      setTicker(`DRAFTED KANBAN · ${total} CARDS`, true);
    } else if (action.action === "raid" && action.data) {
      renderRaid(action.data);
      switchView("raid");
      const total = (action.data.items || []).length;
      addNote(`✓ RAID log updated (${total} items)`);
      setTicker(`DRAFTED RAID LOG · ${total} ITEMS`, true);
    }
  } else {
    setTicker("SYSTEM READY · ASK THE ASSISTANT TO PLAN, TRACK, OR CHART YOUR PROJECT");
  }
}

// Enter to send, Shift+Enter for newline
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

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
