// ===== State =====
let state = {
  gantt: null,      // [{id,name,start,end,progress}]
  burndown: null,   // {days:[{day,ideal,actual}]}
  kanban: null,      // {columns:[{name,cards:[{id,title}]}]}
};
let burndownChartInstance = null;
let history = []; // {role, content} for API context

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
};

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
    if (kind === "gantt") renderGantt(SAMPLES.gantt);
    if (kind === "burndown") renderBurndown(SAMPLES.burndown);
    if (kind === "kanban") renderKanban(SAMPLES.kanban);
  });
});

// ===== Gantt rendering =====
function renderGantt(tasks) {
  state.gantt = tasks;
  const wrap = document.getElementById("ganttWrap");
  if (!tasks || !tasks.length) {
    wrap.innerHTML = `<div class="empty-state" id="ganttEmpty"><p>No timeline yet.</p><button class="btn-ghost" data-sample="gantt">Load a sample plan</button></div>`;
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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
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
  } catch (err) {
    addMessage("assistant", "Error: couldn't reach the server. Check your connection and try again.");
    setTicker("SYSTEM ERROR · REQUEST FAILED");
  } finally {
    sendBtn.disabled = false;
  }
});

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg msg-${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function addNote(text) {
  const div = document.createElement("div");
  div.className = "msg-note";
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
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
