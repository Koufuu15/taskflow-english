const KEYS = {
  tasks: "taskflow_tasks_v1",
  milestones: "taskflow_milestones_v1",
  timer: "taskflow_timer_v1",
  metronome: "taskflow_metronome_v1",
};
const read = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};
let tasks = read(KEYS.tasks, []),
  milestones = read(KEYS.milestones, [5, 10, 30]),
  timer = read(KEYS.timer, null),
  metronome = read(KEYS.metronome, { enabled: false, bpm: 80 }),
  currentPage = "home",
  carouselIndex = 0,
  toastTimer = null;
let audioContext = null,
  metronomeSource = null,
  metronomeBuffer = null,
  metronomeStarting = false;
const pages = {
  home: "Home",
  deadlines: "Task deadlines",
  timer: "Focus timer",
  tasks: "Task settings",
  reminders: "Reminder settings",
};
const icons = {
  home: "⌂",
  deadlines: "▣",
  timer: "◷",
  tasks: "☷",
  reminders: "◉",
};
function persist() {
  localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
}

function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function go(id) {
  currentPage = id;
  document
    .querySelectorAll(".page")
    .forEach((x) => x.classList.toggle("active", x.id === id));
  document
    .querySelectorAll("#sideNav button,#mobileNav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === id));
  document.getElementById("crumb").textContent = "WORKSPACE / " + pages[id];
  if (id === "deadlines") renderDeadlines();
  if (id === "timer") renderTimer();
  if (id === "tasks") renderTaskSettings();
  if (id === "reminders") renderReminderSettings();
  if (id === "timer" && timer?.running && metronome.enabled && !metronomeSource)
    startMetronome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function initNav() {
  for (const [id, title] of Object.entries(pages)) {
    const html = `<button data-page="${id}" onclick="go('${id}')">
<span class="ico">${icons[id]}</span>
<span class="navtxt">${title}</span>
</button>`;
    document.getElementById("sideNav").insertAdjacentHTML("beforeend", html);
    document.getElementById("mobileNav").insertAdjacentHTML("beforeend", html);
  }
}
function dateFormat(value, withTime = true) {
  if (!value) return "No deadline set";
  const d = new Date(value);
  if (Number.isNaN(+d)) return "No deadline set";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
function getCountdown(due) {
  if (!due) {
    return {
      value: "No deadline set",
      state: "unset",
      note: "Add a deadline in Task settings.",
    };
  }

  const diff = new Date(due).getTime() - Date.now();
  if (!Number.isFinite(diff)) {
    return {
      value: "No deadline set",
      state: "unset",
      note: "Check the deadline date and time.",
    };
  }
  if (diff <= 0) {
    return {
      value: "The deadline has passed.",
      state: "overdue",
      note: "The deadline has passed.",
    };
  }

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const value =
    days > 0
      ? `in ${days}d ${hours}h ${minutes}m`
      : hours > 0
        ? `in ${hours}h ${minutes}m`
        : `in ${minutes}m`;

  let state = "normal";
  let note = "Plan your time wisely.";
  if (diff <= 60 * 60 * 1000) {
    state = "critical";
    note = "Time until deadline1hours remaining.";
  } else if (diff <= 24 * 60 * 60 * 1000) {
    state = "urgent";
    note = "The deadline is today.";
  } else if (diff <= 3 * 24 * 60 * 60 * 1000) {
    state = "soon";
    note = "The deadline is approaching.";
  }

  return { value, state, note };
}

function countdownColor(state) {
  return (
    {
      normal: "#6077ee",
      soon: "#c58a32",
      urgent: "#d97736",
      critical: "#d64e59",
      overdue: "#c74652",
      unset: "#858da0",
    }[state] || "#6077ee"
  );
}

function updateVisibleCountdowns() {
  document.querySelectorAll(".countdown-value[data-due]").forEach((el) => {
    const countdown = getCountdown(el.dataset.due);
    el.textContent = countdown.value;
    el.style.setProperty("--countdown-color", countdownColor(countdown.state));
    const card = el.closest(".deadline-countdown");
    if (card) {
      card.classList.toggle(
        "urgent",
        ["urgent", "critical", "overdue"].includes(countdown.state),
      );
      const note = card.querySelector(".countdown-note");
      if (note) note.textContent = countdown.note;
    }
  });
}

function sortedTasks() {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
  });
}
function taskStatus(t) {
  if (t.done) return "Complete";
  if (!t.due) return "Not set";
  const diff = new Date(t.due) - Date.now();
  if (diff < 0) return "Overdue";
  if (diff < 86400000) return "Due today";
  return "Open";
}
function taskRow(t, compact = false) {
  const status = taskStatus(t);
  return `<div class="task-row">
<button class="check ${t.done ? "checked" : ""}" aria-label="Mark complete" onclick="toggleTask('${t.id}')">${t.done ? "✓" : ""}</button>
<div class="task-copy">
<strong>${esc(t.name)}</strong>
<small>${esc(t.memo || "No notes")}</small>
</div>
<span class="badge ${status === "Overdue" ? "red" : ""}">${status}</span>${compact ? "" : `<span class="due">${dateFormat(t.due)}</span>`}<button class="icon-btn" title="Edit" onclick="editTask('${t.id}')">✎</button>
<button class="icon-btn" title="Delete" onclick="deleteTask('${t.id}')">×</button>
</div>`;
}
function renderHome() {
  const open = tasks.filter((t) => !t.done);
  document.getElementById("statOpen").innerHTML =
    `${open.length}<span class="unit">tasks</span>`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextday = today.getTime() + 86400000;
  const todayTasks = open.filter(
    (t) =>
      t.due &&
      new Date(t.due).getTime() >= today.getTime() &&
      new Date(t.due).getTime() < nextday,
  );
  document.getElementById("statToday").innerHTML =
    `${todayTasks.length}<span class="unit">tasks</span>`;
  document.getElementById("statTimer").innerHTML = timer?.running
    ? 'Running<span class="unit">◷</span>'
    : 'Stopped<span class="unit">◷</span>';
  const box = document.getElementById("homeTasks");
  const list = sortedTasks()
    .filter((t) => !t.done)
    .slice(0, 4);
  box.innerHTML = list.length
    ? list.map((t) => taskRow(t, true)).join("")
    : '<div class="empty">No tasks yet. Add your first task to get started.</div>';
}
function renderDeadlines() {
  const all = document.getElementById("deadlineFilter").value === "all";
  const list = sortedTasks().filter((t) => all || !t.done);
  const cards = list.filter((t) => !t.done && t.mode === "card");
  const lists = list.filter((t) => t.mode === "list" || (all && t.done));
  document.getElementById("deadlineCount").textContent = `${list.length} tasks`;
  const content = document.getElementById("deadlineContent");
  if (!list.length) {
    content.innerHTML = '<div class="empty">No tasks to display.</div>';
    document.getElementById("carouselDots").innerHTML = "";
    return;
  }
  let html = "";
  if (cards.length) {
    carouselIndex = carouselIndex % cards.length;
    const t = cards[carouselIndex];
    html += `<div class="deadline-stage">
<article class="deadline-card" id="carouselCard">
<span class="badge blue">Deadline card ${carouselIndex + 1} / ${cards.length}</span>
<h2>${esc(t.name)}</h2>
<p>${esc(t.memo || "No notes added.")}</p>
<div class="deadline-countdown">
<span class="countdown-label">Time until deadline</span>
<strong class="countdown-value" data-due="${esc(t.due || "")}">
</strong>
<span class="countdown-note">
</span>
</div>
<div class="deadline-date">◷　${dateFormat(t.due)}</div>
<div style="display:flex;justify-content:flex-end;margin-top:18px">
<button class="secondary" onclick="toggleTask('${t.id}')">✓ Mark complete</button>
</div>
</article>
</div>`;
  }
  if (lists.length) {
    html += `<div class="section-title row">
<h2>List view</h2>
<span>${lists.length} tasks</span>
</div>
<div class="list-layout">${lists.map((t) => taskRow(t)).join("")}</div>`;
  }
  content.innerHTML = html;
  updateVisibleCountdowns();
  const dots = document.getElementById("carouselDots");
  dots.innerHTML = cards
    .map(
      (_, i) => `<span class="dot ${i === carouselIndex ? "on" : ""}">
</span>`,
    )
    .join("");
  dots.style.display = cards.length > 1 ? "flex" : "none";
}
function renderTaskSettings() {
  document.getElementById("taskCount").textContent = `${tasks.length} tasks`;
  document.getElementById("taskSettingsList").innerHTML = tasks.length
    ? sortedTasks()
        .map((t) => taskRow(t))
        .join("")
    : '<div class="empty">No saved tasks yet.</div>';
}
function toggleTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  persist();
  refresh();
  toast(t.done ? "Task marked complete." : "Marked as open again.");
}
function editTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  go("tasks");
  document.getElementById("taskId").value = t.id;
  document.getElementById("taskName").value = t.name;
  document.getElementById("taskMemo").value = t.memo || "";
  document.getElementById("taskDue").value = t.due || "";
  document.getElementById("taskMode").value = t.mode || "card";
  document.getElementById("taskFormTitle").textContent = "Edit task";
  document.getElementById("cancelEdit").style.display = "inline-block";
  document.getElementById("taskName").focus();
}
function resetTaskForm() {
  document.getElementById("taskForm").reset();
  document.getElementById("taskId").value = "";
  document.getElementById("taskFormTitle").textContent = "New task";
  document.getElementById("cancelEdit").style.display = "none";
  document.getElementById("taskMode").value = "card";
}
function deleteTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  if (!confirm(`Delete “${t.name}”?`)) return;
  tasks = tasks.filter((x) => x.id !== id);
  persist();
  refresh();
  toast("Task deleted.");
}
document.getElementById("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("taskId").value;
  const data = {
    id: id || crypto.randomUUID(),
    name: document.getElementById("taskName").value.trim(),
    memo: document.getElementById("taskMemo").value.trim(),
    due: document.getElementById("taskDue").value,
    mode: document.getElementById("taskMode").value,
    done: false,
  };
  if (id) {
    const old = tasks.find((t) => t.id === id);
    data.done = old?.done || false;
    tasks = tasks.map((t) => (t.id === id ? data : t));
  } else tasks.push(data);
  persist();
  resetTaskForm();
  refresh();
  toast("Task saved.");
});
function renderReminderSettings() {
  document.getElementById("milestoneCount").textContent =
    `${milestones.length} tasks`;
  document.getElementById("settingsMilestones").innerHTML = milestones.length
    ? milestones
        .map(
          (
            m,
            i,
          ) => `<span class="milestone">${m} min later <button aria-label="Delete" onclick="removeMilestone(${i})">×</button>
</span>`,
        )
        .join("")
    : '<span style="font-size:12px;color:var(--muted)">No reminder intervals added.</span>';
}
function renderMilestoneViews() {
  const html =
    milestones
      .map((m) => `<span class="milestone">${m} min later</span>`)
      .join("") ||
    '<span style="font-size:12px;color:var(--muted)">Not configured</span>';
  document.getElementById("timerMilestones").innerHTML = html;
}
function saveMilestones() {
  milestones = [
    ...new Set(
      milestones.map(Number).filter((x) => Number.isFinite(x) && x > 0),
    ),
  ].sort((a, b) => a - b);
  localStorage.setItem(KEYS.milestones, JSON.stringify(milestones));
  renderReminderSettings();
  renderMilestoneViews();
}
function addMilestone() {
  const m = Number(document.getElementById("milestoneMinutes").value);
  if (!Number.isInteger(m) || m < 1 || m > 1440) {
    toast("1〜1440Enter a value from 1 to 1440 minutes.");
    return;
  }
  if (milestones.includes(m)) {
    toast("That interval is already set.");
    return;
  }
  milestones.push(m);
  saveMilestones();
  toast(`${m}minute reminder added.`);
}

function removeMilestone(i) {
  milestones.splice(i, 1);
  saveMilestones();
}

function addPreset() {
  milestones = [...new Set([...milestones, 5, 10, 30])];
  saveMilestones();
  toast("Added 5, 10, and 30 minute reminders.");
}

function resetMilestones() {
  milestones = [5, 10, 30];
  saveMilestones();
  toast("Reminder intervals restored to defaults.");
}
function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function renderTimer() {
  const running = Boolean(timer?.running);
  const elapsed = timer?.startedAt
    ? Math.floor((Date.now() - timer.startedAt) / 1000)
    : 0;
  const ring = document.getElementById("timerRing");
  ring.classList.toggle("running", running);
  ring.classList.toggle("done", !!timer && !running);
  document.getElementById("timerClock").textContent = mmss(elapsed);
  document.getElementById("timerCaption").textContent = running
    ? "Timer running"
    : timer
      ? "Timer stopped"
      : "Timer stopped";
  document.getElementById("timerControls").innerHTML = running
    ? '<button class="primary" onclick="stopTimer()">■　Stop timer</button>'
    : '<button class="primary" onclick="startTimer()">▶　Start timer</button>' +
      (timer
        ? '<button class="secondary" onclick="clearTimer()">Reset</button>'
        : "");
  const next = timer?.running
    ? milestones.find((m) => !timer.fired?.includes(m) && m * 60 > elapsed)
    : null;
  document.getElementById("timerMeta").innerHTML = running
    ? next
      ? `Next reminder in <strong>${mmss(next * 60 - elapsed)}</strong>(elapsed ${next} min)`
      : "All scheduled reminders have fired."
    : "Start the timer to begin the reminder countdown.";
  renderMetronomeControls();
  renderMilestoneViews();
  renderHome();
}
function renderMetronomeControls() {
  const toggle = document.getElementById("metronomeToggle");
  const tempo = document.getElementById("metronomeTempo");
  const output = document.getElementById("metronomeTempoValue");
  if (!toggle || !tempo || !output) return;
  toggle.textContent = metronome.enabled ? "Metronome on" : "Metronome off";
  toggle.setAttribute("aria-pressed", String(metronome.enabled));
  tempo.value = String(metronome.bpm);
  output.textContent = `${metronome.bpm} BPM`;
}
function saveMetronome() {
  localStorage.setItem(KEYS.metronome, JSON.stringify(metronome));
}
function buildMetronomeBuffer(ctx) {
  if (metronomeBuffer && metronomeBuffer.sampleRate === ctx.sampleRate)
    return metronomeBuffer;
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate * 4, sampleRate);
  const samples = buffer.getChannelData(0);
  const clickLength = Math.round(sampleRate * 0.025);
  for (let beat = 0; beat < 4; beat++) {
    const start = beat * sampleRate;
    const frequency = beat === 0 ? 1500 : 1000;
    const amplitude = beat === 0 ? 0.28 : 0.18;
    for (let i = 0; i < clickLength; i++) {
      const decay = Math.exp(-i / (sampleRate * 0.006));
      samples[start + i] =
        Math.sin((2 * Math.PI * frequency * i) / sampleRate) *
        decay *
        amplitude;
    }
  }
  metronomeBuffer = buffer;
  return buffer;
}
async function startMetronome() {
  if (
    !timer?.running ||
    !metronome.enabled ||
    metronomeSource ||
    metronomeStarting
  )
    return;
  metronomeStarting = true;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  try {
    if (!AudioContextType) {
      toast("This browser does not support metronome audio.");
      return;
    }
    if (!audioContext) audioContext = new AudioContextType();
    if (audioContext.state === "suspended") await audioContext.resume();
    if (!timer?.running || !metronome.enabled || metronomeSource) return;
    const source = audioContext.createBufferSource();
    source.buffer = buildMetronomeBuffer(audioContext);
    source.loop = true;
    source.playbackRate.value = metronome.bpm / 60;
    source.connect(audioContext.destination);
    source.start();
    metronomeSource = source;
  } catch {
    toast("Allow audio playback in your browser to use the metronome.");
  } finally {
    metronomeStarting = false;
  }
}
function stopMetronome() {
  if (!metronomeSource) return;
  try {
    metronomeSource.stop();
    metronomeSource.disconnect();
  } catch {}
  metronomeSource = null;
}
function toggleMetronome() {
  metronome.enabled = !metronome.enabled;
  saveMetronome();
  renderMetronomeControls();
  if (metronome.enabled && timer?.running) startMetronome();
  else stopMetronome();
  toast(
    metronome.enabled
      ? "Metronome enabled. It plays while the timer is running."
      : "Metronome disabled.",
  );
}
function updateMetronomeTempo(value) {
  const bpm = Number(value);
  if (!Number.isInteger(bpm) || bpm < 30 || bpm > 240) return;
  metronome.bpm = bpm;
  saveMetronome();
  document.getElementById("metronomeTempoValue").textContent = `${bpm} BPM`;
  if (metronomeSource && audioContext)
    metronomeSource.playbackRate.setTargetAtTime(
      bpm / 60,
      audioContext.currentTime,
      0.025,
    );
}
function startTimer() {
  timer = { startedAt: Date.now(), running: true, fired: [] };
  localStorage.setItem(KEYS.timer, JSON.stringify(timer));
  if (metronome.enabled) startMetronome();
  renderTimer();
  toast("Timer started");
}
function stopTimer() {
  if (!timer) return;
  timer.running = false;
  timer.stoppedAt = Date.now();
  localStorage.setItem(KEYS.timer, JSON.stringify(timer));
  stopMetronome();
  renderTimer();
  toast("Timer stopped");
}
function clearTimer() {
  timer = null;
  localStorage.removeItem(KEYS.timer);
  stopMetronome();
  renderTimer();
  toast("Timer reset");
}
function announce(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 1.05;
  window.speechSynthesis.speak(utter);
}
function fireMilestone(m) {
  timer.fired = timer.fired || [];
  if (timer.fired.includes(m)) return;
  timer.fired.push(m);
  localStorage.setItem(KEYS.timer, JSON.stringify(timer));
  document.getElementById("alertTime").textContent = `Elapsed ${m} min`;
  document.getElementById("alertTitle").textContent = "Reminder time";
  document.getElementById("alertMessage").textContent =
    `Since timer started${m} minutes have passed. Consider taking a short break or reviewing your next task.`;
  document.getElementById("interrupt").classList.add("show");
  announce(`${m} minutes have passed! It’s reminder time!`);
  renderTimer();
}
function dismissAlert() {
  document.getElementById("interrupt").classList.remove("show");
  if (timer?.running) go("timer");
}
function tick() {
  updateVisibleCountdowns();
  if (!timer?.running) return;
  const elapsed = Math.floor((Date.now() - timer.startedAt) / 60000);
  const due = milestones.find(
    (m) => m <= elapsed && !(timer.fired || []).includes(m),
  );
  if (due !== undefined) {
    fireMilestone(due);
    return;
  }
  if (currentPage === "timer") renderTimer();
  else renderHome();
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function refresh() {
  renderHome();
  if (currentPage === "deadlines") renderDeadlines();
  if (currentPage === "tasks") renderTaskSettings();
  if (currentPage === "timer") renderTimer();
}
function init() {
  initNav();
  const now = new Date();
  document.getElementById("today").textContent = new Intl.DateTimeFormat(
    "en-US",
    { year: "numeric", month: "long", day: "numeric", weekday: "short" },
  ).format(now);
  const h = now.getHours();
  document.getElementById("greeting").textContent =
    h < 11 ? "Good morning." : h < 17 ? "Hello." : "Welcome back.";
  renderHome();
  renderReminderSettings();
  renderMilestoneViews();
  renderTimer();
  setInterval(tick, 1000);
  setInterval(() => {
    if (currentPage === "deadlines") advanceCarousel();
  }, 7000);
  if (timer?.running && metronome.enabled)
    document.addEventListener(
      "pointerdown",
      () => {
        if (!metronomeSource) startMetronome();
      },
      { once: true },
    );
  if (timer?.running) {
    const elapsed = Math.floor((Date.now() - timer.startedAt) / 60000);
    const due = milestones.find(
      (m) => m <= elapsed && !(timer.fired || []).includes(m),
    );
    if (due !== undefined) setTimeout(() => fireMilestone(due), 500);
  }
}
function advanceCarousel() {
  if (currentPage !== "deadlines") return;
  const cards = sortedTasks().filter((t) => !t.done && t.mode === "card");
  if (cards.length < 2) return;
  const card = document.getElementById("carouselCard");
  if (!card) return;
  card.classList.add("leaving");
  setTimeout(() => {
    carouselIndex = (carouselIndex + 1) % cards.length;
    renderDeadlines();
  }, 480);
}
init();
