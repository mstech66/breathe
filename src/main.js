// Breathe: work–rest rhythm and guided breathing for people who work from home.
// Plain JS, no build step. Talks to the Tauri backend through window.__TAURI__ when present,
// and still runs in a normal browser for quick UI work.

/* =========================================================================
   Settings and today's progress (persisted in localStorage)
   ========================================================================= */

const DEFAULTS = {
  mode: 'deep',            // 'deep' | 'pomo' | 'micro' | 'custom'
  customFocus: 45,
  customBreak: 15,
  microMinutes: 20,
  goalMode: 'auto',        // 'auto' | 'manual' | 'none'
  goalManual: 4,
  goalCelebrate: true,
  launchAtLogin: false,
  autoStart: false,
  closeBehavior: 'tray',   // 'tray' | 'quit'
  workStart: '11:00',
  workEnd: '19:00',
  respectHours: false,
  notifications: true,
  chime: true,
  volume: 0.6,
  pattern: 'box',          // 'box' | 'relax' | 'steady'
  showTips: true
};

const SETTINGS_KEY = 'breathe.settings.v1';
const TODAY_KEY = 'breathe.today.v1';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const settings = load(SETTINGS_KEY, DEFAULTS);
const saveSettings = () => save(SETTINGS_KEY, settings);

const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let today = load(TODAY_KEY, { date: dateKey(), sessions: 0, celebrated: false });
if (today.date !== dateKey()) today = { date: dateKey(), sessions: 0, celebrated: false };
const saveToday = () => save(TODAY_KEY, today);

/* =========================================================================
   Rhythms
   ========================================================================= */

const MODES = {
  deep: { label: 'Deep Work', status: 'Deep focus' },
  pomo: { label: 'Pomodoro', status: 'Pomodoro sprint' },
  micro: { label: 'Micro-Pause', status: 'Mindful reminders' },
  custom: { label: 'Custom', status: 'Custom rhythm' }
};

function rhythm(mode = settings.mode) {
  switch (mode) {
    case 'pomo': return { work: 25, rest: 5 };
    case 'custom': return { work: settings.customFocus, rest: settings.customBreak };
    case 'micro': return { work: Number(settings.microMinutes), rest: 0 };
    default: return { work: 50, rest: 10 };
  }
}

function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function workdayMinutes() {
  let span = minutesOf(settings.workEnd) - minutesOf(settings.workStart);
  if (span <= 0) span += 24 * 60;
  return span;
}

function autoGoal() {
  const r = settings.mode === 'micro' ? rhythm('deep') : rhythm();
  return Math.max(1, Math.floor(workdayMinutes() / (r.work + r.rest)));
}

function dailyGoal() {
  if (settings.goalMode === 'none') return 0;
  if (settings.goalMode === 'manual') return settings.goalManual;
  return autoGoal();
}

function withinWorkingHours(date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutesOf(settings.workStart);
  const end = minutesOf(settings.workEnd);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

/* =========================================================================
   Content
   ========================================================================= */

const TIPS = [
  ['Posture', 'Drop your shoulders away from your ears'],
  ['Eyes', 'Look at something 20 feet away for 20 seconds'],
  ['Water', 'Have a few sips of water'],
  ['Posture', 'Feet flat on the floor, back against the chair'],
  ['Face', 'Unclench your jaw and soften your forehead'],
  ['Breath', 'Take one slow breath into your belly']
];

const BREAK_IDEAS = [
  'Stand up, roll your shoulders back, and look out a window for 20 seconds',
  'Refill your water and drink a full glass',
  'Reach both arms overhead and hold for 10 seconds, then fold forward gently',
  'Walk to another room and back, slowly',
  'Close your eyes and listen to the sounds around you for one minute',
  'Stretch your neck: ear to shoulder, five breaths each side'
];

const PATTERNS = {
  box: { breaths: 4, steps: [['in', 4], ['hold', 4], ['out', 4], ['rest', 4]] },
  relax: { breaths: 3, steps: [['in', 4], ['hold', 7], ['out', 8]] },
  steady: { breaths: 5, steps: [['in', 5.5], ['out', 5.5]] }
};

const STEP_TEXT = {
  in: ['Breathe in', 'Fill your belly first, then your chest', 'In'],
  hold: ['Hold', 'Keep your shoulders soft', 'Hold'],
  out: ['Breathe out', 'Slowly, and let everything go', 'Out'],
  rest: ['Rest', 'Stay empty for a moment', 'Hold']
};

/* =========================================================================
   DOM
   ========================================================================= */

const $ = (id) => document.getElementById(id);
const app = $('app');

const el = {
  modeTabs: document.querySelectorAll('.mode-tab'),
  counter: $('counter'), counterDots: $('counterDots'), counterBar: $('counterBar'),
  counterBarFill: $('counterBarFill'), counterCheck: $('counterCheck'), counterText: $('counterText'),
  views: { focus: $('viewFocus'), break: $('viewBreak'), breath: $('viewBreath'), settings: $('viewSettings') },
  ringFill: $('ringFill'), focusStatus: $('focusStatus'), focusTime: $('focusTime'), focusLabel: $('focusLabel'),
  pauseBtn: $('pauseBtn'), pauseIcon: $('pauseIcon'), pauseText: $('pauseText'),
  primaryBtn: $('primaryBtn'), primaryIcon: $('primaryIcon'), primaryText: $('primaryText'),
  breakNowBtn: $('breakNowBtn'),
  tipCard: $('tipCard'), tipLabel: $('tipLabel'), tipText: $('tipText'),
  breakCue: $('breakCue'), breakTime: $('breakTime'), breakLen: $('breakLen'), breakBar: $('breakBar'), breakIdea: $('breakIdea'),
  breathCount: $('breathCount'), breathCue: $('breathCue'), breathSub: $('breathSub'), breathBar: $('breathBar'),
  breathSteps: $('breathSteps'), endBreathBtn: $('endBreathBtn'),
  toast: $('toast')
};

const ICON = {
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10.5-6.5z',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7'
};

const RING_LENGTH = 879.65;

/* =========================================================================
   Tauri bridge (no-ops in a plain browser)
   ========================================================================= */

const tauri = window.__TAURI__;
const isDesktop = Boolean(tauri && tauri.core);

async function invoke(cmd, args) {
  if (!isDesktop) throw new Error('Not running in the desktop app');
  return tauri.core.invoke(cmd, args);
}

/* =========================================================================
   Sound: one shared AudioContext (browsers cap how many can exist)
   ========================================================================= */

let audioCtx = null;

function playChime(type = 'bell', force = false) {
  if (!settings.chime && !force) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    const vol = Math.max(0, Math.min(1, Number(settings.volume)));
    const tones = {
      'break-start': { freqs: [320, 640], gains: [0.3, 0.15], len: 3.8, stagger: 0 },
      'work-start': { freqs: [740, 880], gains: [0.25, 0.25], len: 2.5, stagger: 0.25 },
      bell: { freqs: [370, 740, 1110], gains: [0.25, 0.1, 0.04], len: 3.0, stagger: 0 }
    }[type] || null;
    if (!tones || vol === 0) return;
    tones.freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * tones.stagger;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(Math.max(0.0001, tones.gains[i] * vol), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tones.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tones.len + 0.1);
    });
  } catch (e) {
    console.warn('Audio error:', e);
  }
}

/* =========================================================================
   Notifications. Resolves to null on success, or an error message.
   ========================================================================= */

async function notify(title, body, { force = false } = {}) {
  if (!settings.notifications && !force) return null;
  if (isDesktop) {
    try {
      await invoke('trigger_native_toast', { title, body });
      return null;
    } catch (e) {
      console.warn('Notification failed:', e);
      return String(e);
    }
  }
  if ('Notification' in window) {
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
      return null;
    }
  }
  return 'Notifications are not available here.';
}

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
}

/* =========================================================================
   Timer state
   ========================================================================= */

const timer = {
  phase: 'work',        // 'work' | 'break'
  started: false,       // the user has started their day
  paused: false,
  hoursPaused: false,   // paused automatically outside working hours
  snoozeUntil: 0,
  remaining: rhythm().work * 60,
  total: rhythm().work * 60,
  lastTick: Date.now()
};

let view = 'focus';       // 'focus' | 'break' | 'breath' | 'settings'
let returnView = 'focus'; // where Settings / Take a breath go back to

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function clockTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function resetPhase(phase) {
  const r = rhythm();
  timer.phase = phase;
  timer.total = (phase === 'work' ? r.work : r.rest) * 60;
  timer.remaining = timer.total;
  timer.lastTick = Date.now();
}

function startDay() {
  timer.started = true;
  timer.paused = false;
  timer.lastTick = Date.now();
  playChime('work-start');
  render();
}

function setPaused(paused) {
  timer.paused = paused;
  timer.snoozeUntil = 0;
  timer.hoursPaused = false;
  timer.lastTick = Date.now();
  render();
}

function snooze(minutes) {
  if (!timer.started) timer.started = true;
  timer.paused = true;
  timer.hoursPaused = false;
  timer.snoozeUntil = Date.now() + minutes * 60 * 1000;
  toast(`Reminders snoozed until ${clockTime(timer.snoozeUntil)}`);
  render();
}

function countSession() {
  today.sessions += 1;
  const goal = dailyGoal();
  if (settings.goalCelebrate && goal > 0 && today.sessions === goal && !today.celebrated) {
    today.celebrated = true;
    notify('🌿 Daily goal reached', `${goal} focus sessions done today. Nice work. Keep going or call it a day.`);
    toast(`Daily goal reached: ${goal} sessions`);
  }
  saveToday();
}

function beginBreak({ early = false } = {}) {
  if (settings.mode === 'micro') return;
  const elapsedShare = 1 - timer.remaining / timer.total;
  if (!early || elapsedShare >= 0.5) countSession();
  resetPhase('break');
  timer.started = true;
  timer.paused = false;
  timer.snoozeUntil = 0;
  pickBreakIdea();
  playChime('break-start');
  notify(`☕ Time for your ${rhythm().rest}-minute break`, 'Step away from the screen, stretch, and grab some water.');
  if (view !== 'settings') showView('break');
  else returnView = 'break';
  render();
}

function beginFocus({ fromUser = false } = {}) {
  resetPhase('work');
  timer.started = true;
  timer.paused = false;
  timer.snoozeUntil = 0;
  playChime('work-start');
  if (!fromUser) notify('⚡ Break is over', 'Next focus session starts now. Pick one thing to work on.');
  if (view === 'break' || view === 'breath') showView('focus');
  else if (view === 'settings') returnView = 'focus';
  render();
}

function microReminder() {
  playChime('bell');
  notify('🌿 Mindful pause', 'Take three slow breaths. Relax your shoulders and soften your gaze.');
  resetPhase('work');
}

function phaseComplete() {
  if (settings.mode === 'micro') microReminder();
  else if (timer.phase === 'work') beginBreak();
  else beginFocus();
}

// Intervals are throttled or suspended while the window is hidden, so count
// real wall-clock time instead of assuming one second per tick.
function tick() {
  const now = Date.now();

  if (today.date !== dateKey()) {
    today = { date: dateKey(), sessions: 0, celebrated: false };
    saveToday();
  }

  if (timer.snoozeUntil && now >= timer.snoozeUntil) {
    timer.snoozeUntil = 0;
    timer.paused = false;
    timer.lastTick = now;
  }

  if (settings.respectHours && timer.started) {
    const inside = withinWorkingHours();
    if (!inside && !timer.paused) { timer.paused = true; timer.hoursPaused = true; }
    if (inside && timer.hoursPaused) { timer.paused = false; timer.hoursPaused = false; timer.lastTick = now; }
  }

  if (!timer.started || timer.paused) {
    timer.lastTick = now;
    render();
    return;
  }

  const elapsed = Math.floor((now - timer.lastTick) / 1000);
  if (elapsed <= 0) return;
  timer.lastTick += elapsed * 1000;

  if (elapsed >= timer.remaining) {
    const overshoot = elapsed - timer.remaining;
    phaseComplete();
    timer.remaining = Math.max(1, timer.remaining - overshoot);
  } else {
    timer.remaining -= elapsed;
  }
  render();
}

/* =========================================================================
   Rendering
   ========================================================================= */

let lastTooltip = '';

function renderCounter() {
  const goal = dailyGoal();
  const done = today.sessions;
  const met = goal > 0 && done >= goal;

  el.counter.classList.toggle('met', met);
  el.counterCheck.hidden = !met;
  el.counterDots.hidden = !(goal > 0 && goal <= 8);
  el.counterBar.hidden = !(goal > 8);

  if (goal > 0 && goal <= 8) {
    const dots = Math.max(goal, Math.min(done, 8));
    el.counterDots.innerHTML = Array.from({ length: dots }, (_, i) => `<i class="${i < done ? 'done' : ''}"></i>`).join('');
  }
  if (goal > 8) el.counterBarFill.style.width = `${Math.min(100, Math.round((done / goal) * 100))}%`;

  if (goal === 0) el.counterText.textContent = `${done} ${done === 1 ? 'session' : 'sessions'} today`;
  else if (met) el.counterText.innerHTML = `<strong>${done} today</strong> · goal met`;
  else el.counterText.textContent = `${done} of ${goal} today`;
  el.counter.title = goal ? `Daily goal: ${goal} focus sessions` : 'Focus sessions today';
}

function renderFocus() {
  const r = rhythm();
  const mode = MODES[settings.mode];
  const micro = settings.mode === 'micro';

  el.focusTime.textContent = formatTime(timer.remaining);
  const share = timer.started && timer.phase === 'work' ? 1 - timer.remaining / timer.total : 0;
  el.ringFill.style.strokeDashoffset = String(RING_LENGTH * (1 - share));

  let status = mode.status;
  let label = micro ? 'until your next breathing pause' : `until your ${r.rest}-minute break`;
  if (!timer.started) {
    status = 'Ready when you are';
    label = micro ? `A breathing reminder every ${r.work} minutes` : `${r.work} min focus, then a ${r.rest}-minute break`;
  } else if (timer.snoozeUntil) {
    status = 'Snoozed';
    label = `Reminders are back at ${clockTime(timer.snoozeUntil)}`;
  } else if (timer.hoursPaused) {
    status = 'Outside working hours';
    label = `Resumes at ${settings.workStart}`;
  } else if (timer.paused) {
    status = 'Paused';
  }
  el.focusStatus.textContent = status;
  el.focusLabel.textContent = label;
  app.classList.toggle('paused', timer.started && timer.paused);

  // Buttons: idle = [Take a breath] [Start focus]; running = [Pause] [Take a breath] [Break now]
  if (!timer.started) {
    el.pauseIcon.setAttribute('d', ICON.wind);
    el.pauseText.textContent = 'Take a breath';
    el.primaryIcon.setAttribute('d', ICON.play);
    el.primaryText.textContent = micro ? 'Start reminders' : 'Start focus';
    el.breakNowBtn.hidden = true;
  } else {
    el.pauseIcon.setAttribute('d', timer.paused ? ICON.play : ICON.pause);
    el.pauseText.textContent = timer.paused ? 'Resume' : 'Pause';
    el.primaryIcon.setAttribute('d', ICON.wind);
    el.primaryText.textContent = 'Take a breath';
    el.breakNowBtn.hidden = micro;
  }

  el.tipCard.hidden = !settings.showTips;
}

function renderBreak() {
  el.breakTime.textContent = formatTime(timer.remaining);
  el.breakLen.textContent = String(Math.round(timer.total / 60));
  const share = timer.phase === 'break' ? 1 - timer.remaining / timer.total : 0;
  el.breakBar.style.width = `${(share * 100).toFixed(1)}%`;
}

function renderTooltip() {
  let text = 'Breathe';
  if (!timer.started) text = 'Breathe · ready to start';
  else if (timer.snoozeUntil) text = `Breathe · snoozed until ${clockTime(timer.snoozeUntil)}`;
  else if (timer.paused) text = 'Breathe · paused';
  else if (settings.mode === 'micro') text = `Breathe · next pause in ${Math.ceil(timer.remaining / 60)} min`;
  else if (timer.phase === 'work') text = `Breathe · break in ${Math.ceil(timer.remaining / 60)} min`;
  else text = `Breathe · break ends in ${Math.ceil(timer.remaining / 60)} min`;
  if (text !== lastTooltip) {
    lastTooltip = text;
    invoke('set_tray_tooltip', { text }).catch(() => {});
  }
}

// The tray popover is a separate window; it mirrors this state and sends its
// button presses back as 'tray-action' events.
function publishState() {
  if (!isDesktop || !tauri.event) return;
  const micro = settings.mode === 'micro';
  const onBreak = timer.phase === 'break' && !micro;
  const r = rhythm();
  const running = timer.started && !timer.paused;
  let endsAt = '';
  if (running) {
    const at = clockTime(Date.now() + timer.remaining * 1000);
    endsAt = micro ? `Next pause at ${at}` : onBreak ? `Back to focus at ${at}` : `Break at ${at}`;
  }
  let label = micro ? 'until your next breathing pause' : onBreak ? 'left in your break' : `until your ${r.rest}-minute break`;
  if (!timer.started) label = micro ? `A breathing reminder every ${r.work} minutes` : `${r.work} min focus, then a ${r.rest}-minute break`;
  else if (timer.snoozeUntil) label = `Snoozed until ${clockTime(timer.snoozeUntil)}`;
  else if (timer.hoursPaused) label = 'Outside working hours';
  else if (timer.paused) label = 'Paused';

  tauri.event.emit('timer-state', {
    phase: onBreak ? 'break' : 'work',
    micro,
    started: timer.started,
    paused: timer.paused,
    status: !timer.started ? 'Ready' : onBreak ? 'Break time' : MODES[settings.mode].status,
    time: formatTime(timer.remaining),
    share: timer.started ? 1 - timer.remaining / timer.total : 0,
    label,
    endsAt,
    goal: dailyGoal(),
    done: today.sessions
  }).catch(() => {});
}

function render() {
  app.dataset.phase = timer.phase === 'break' && settings.mode !== 'micro' ? 'break' : 'work';
  el.modeTabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.mode === settings.mode)));
  renderCounter();
  renderFocus();
  renderBreak();
  renderTooltip();
  publishState();
}

/* =========================================================================
   Views
   ========================================================================= */

function showView(next) {
  if (next === view) return;
  if (next === 'settings' || next === 'breath') returnView = view === 'settings' || view === 'breath' ? returnView : view;
  if (view === 'breath') stopBreathSession();
  view = next;
  app.dataset.view = next;
  Object.entries(el.views).forEach(([name, node]) => { node.hidden = name !== next; });
  if (next === 'break') startBreakBreather(); else stopBreakBreather();
  if (next === 'settings') syncSettingsForm();
}

function leaveOverlay() {
  // Back from Settings or Take a breath: go to whatever fits the current phase
  showView(timer.phase === 'break' && settings.mode !== 'micro' ? 'break' : 'focus');
  render();
}

/* =========================================================================
   Flower breathing
   ========================================================================= */

function flowerIn(viewEl) { return viewEl.querySelector('[data-flower]'); }

function setFlower(flower, open, seconds) {
  flower.style.setProperty('--dur', `${seconds}s`);
  flower.classList.toggle('open', open);
}

function swapText(node, text) {
  if (node.textContent === text) return;
  node.classList.add('fade');
  setTimeout(() => { node.textContent = text; node.classList.remove('fade'); }, 250);
}

// Break: a slow, steady 5.5 s in / 5.5 s out
let breakBreatherTimer = null;
function startBreakBreather() {
  stopBreakBreather();
  const flower = flowerIn(el.views.break);
  let inhale = true;
  const step = () => {
    setFlower(flower, inhale, 5.5);
    swapText(el.breakCue, inhale ? 'Breathe in, slowly' : 'Breathe out, let go');
    inhale = !inhale;
    breakBreatherTimer = setTimeout(step, 5500);
  };
  step();
}
function stopBreakBreather() {
  clearTimeout(breakBreatherTimer);
  breakBreatherTimer = null;
}

let breakIdeaIndex = Math.floor(Math.random() * BREAK_IDEAS.length);
function pickBreakIdea() {
  breakIdeaIndex = (breakIdeaIndex + 1) % BREAK_IDEAS.length;
  el.breakIdea.textContent = BREAK_IDEAS[breakIdeaIndex];
}

// Take a breath: guided session following the chosen pattern
let breathToken = 0;
let breathTimers = [];

function renderPatternButtons() {
  document.querySelectorAll('.pattern').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pattern === settings.pattern)));
}

function renderSteps(pattern, activeIndex = -1) {
  el.breathSteps.innerHTML = pattern.steps
    .map(([kind, secs], i) => `<li class="${i === activeIndex ? 'active' : ''}">${STEP_TEXT[kind][2]} ${secs}</li>`)
    .join('');
}

function stopBreathSession() {
  breathToken += 1;
  breathTimers.forEach(clearTimeout);
  breathTimers = [];
}

function startBreathSession() {
  stopBreathSession();
  const token = breathToken;
  const pattern = PATTERNS[settings.pattern] || PATTERNS.box;
  const flower = flowerIn(el.views.breath);
  const cycle = pattern.steps.reduce((sum, [, s]) => sum + s, 0);
  const total = cycle * pattern.breaths;
  const intro = 2;
  const later = (fn, secs) => breathTimers.push(setTimeout(() => { if (token === breathToken) fn(); }, secs * 1000));

  renderPatternButtons();
  renderSteps(pattern);
  setFlower(flower, false, 0.6);
  el.endBreathBtn.querySelector('span').textContent = 'End early';
  el.breathCount.textContent = 'Take a breath';
  el.breathCue.textContent = 'Get comfortable';
  el.breathSub.textContent = 'Sit back and relax your shoulders';
  el.breathBar.style.transition = 'none';
  el.breathBar.style.width = '0%';

  let t = intro;
  for (let b = 0; b < pattern.breaths; b++) {
    pattern.steps.forEach(([kind, secs], i) => {
      const startAt = t;
      later(() => {
        const [title, sub] = STEP_TEXT[kind];
        el.breathCount.textContent = `Take a breath · Breath ${b + 1} of ${pattern.breaths}`;
        swapText(el.breathCue, title);
        el.breathSub.textContent = sub;
        renderSteps(pattern, i);
        if (kind === 'in') setFlower(flower, true, secs);
        if (kind === 'out') setFlower(flower, false, secs);
        el.breathBar.style.transition = `width ${secs}s linear`;
        el.breathBar.style.width = `${(((startAt - intro) + secs) / total * 100).toFixed(1)}%`;
      }, startAt);
      t += secs;
    });
  }

  later(() => {
    swapText(el.breathCue, 'Nicely done');
    el.breathSub.textContent = 'Carry that calm back into your work';
    el.breathCount.textContent = 'Take a breath · Complete';
    renderSteps(pattern);
    el.endBreathBtn.querySelector('span').textContent = 'Back';
    setFlower(flower, false, 2);
  }, t);
  later(() => { if (view === 'breath') leaveOverlay(); }, t + 4);
}

function openBreath() {
  showView('breath');
  startBreathSession();
}

/* =========================================================================
   Tips on the focus screen
   ========================================================================= */

let tipIndex = 0;
setInterval(() => {
  if (view !== 'focus' || !settings.showTips) return;
  tipIndex = (tipIndex + 1) % TIPS.length;
  el.tipCard.classList.add('fade');
  setTimeout(() => {
    el.tipLabel.textContent = TIPS[tipIndex][0];
    el.tipText.textContent = TIPS[tipIndex][1];
    el.tipCard.classList.remove('fade');
  }, 300);
}, 15000);

/* =========================================================================
   Settings form
   ========================================================================= */

const settingInputs = document.querySelectorAll('[data-setting]');

function formatOut(key, value) {
  if (key === 'goalManual') return `${value} ${value === 1 ? 'session' : 'sessions'}`;
  return `${value} min`;
}

function syncSettingsForm() {
  settingInputs.forEach((input) => {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
    else input.value = String(settings[key]);
  });
  document.querySelectorAll('input[name="goalMode"]').forEach((r) => { r.checked = r.value === settings.goalMode; });
  document.querySelectorAll('[data-out]').forEach((o) => { o.textContent = formatOut(o.dataset.out, settings[o.dataset.out]); });
  const r = settings.mode === 'micro' ? rhythm('deep') : rhythm();
  const hours = workdayMinutes() / 60;
  const modeName = settings.mode === 'micro' ? 'Deep Work' : MODES[settings.mode].label;
  $('goalAutoSub').textContent =
    `${settings.workStart} – ${settings.workEnd} (${+hours.toFixed(1)} h) with ${modeName} (${r.work}/${r.rest}) comes to about ${autoGoal()} sessions a day`;
}

async function applyLaunchAtLogin(enabled) {
  const sub = $('autostartSub');
  try {
    await invoke(enabled ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
    sub.textContent = 'Keeps your rhythm going without opening the app';
    sub.classList.remove('error');
  } catch (e) {
    settings.launchAtLogin = !enabled;
    saveSettings();
    syncSettingsForm();
    sub.textContent = isDesktop ? `Couldn't change this: ${e}` : 'Available in the desktop app';
    sub.classList.add('error');
  }
}

function applyCloseBehavior() {
  invoke('set_close_to_tray', { enabled: settings.closeBehavior !== 'quit' }).catch(() => {});
}

function onSettingChanged(key) {
  if (key === 'launchAtLogin') applyLaunchAtLogin(settings.launchAtLogin);
  if (key === 'closeBehavior') applyCloseBehavior();
  if (key === 'pattern') renderPatternButtons();
  if (['customFocus', 'customBreak', 'microMinutes'].includes(key) && settings.mode === (key === 'microMinutes' ? 'micro' : 'custom')) {
    // Changing the active rhythm restarts the current phase with the new length
    if (!timer.started || timer.phase === 'work') resetPhase('work');
  }
  syncSettingsForm();
  render();
}

settingInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const key = input.dataset.setting;
    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.type === 'range') value = Number(input.value);
    else if (key === 'microMinutes') value = Number(input.value);
    else value = input.value;
    settings[key] = value;
    saveSettings();
    onSettingChanged(key);
  });
});

document.querySelectorAll('input[name="goalMode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    settings.goalMode = radio.value;
    today.celebrated = today.sessions >= dailyGoal() && dailyGoal() > 0;
    saveSettings();
    saveToday();
    onSettingChanged('goalMode');
  });
});

const STEP_LIMITS = { customFocus: [5, 180], customBreak: [1, 60], goalManual: [1, 24] };
document.querySelectorAll('[data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.step;
    const [min, max] = STEP_LIMITS[key];
    settings[key] = Math.min(max, Math.max(min, settings[key] + Number(btn.dataset.delta)));
    if (key === 'goalManual') settings.goalMode = 'manual';
    saveSettings();
    onSettingChanged(key);
  });
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.removeAttribute('aria-current'));
    item.setAttribute('aria-current', 'page');
    document.querySelectorAll('.settings-section').forEach((s) => { s.hidden = s.dataset.panel !== item.dataset.section; });
  });
});

function openSettings(section) {
  showView('settings');
  if (section) document.querySelector(`.nav-item[data-section="${section}"]`)?.click();
}

$('testNotifyBtn').addEventListener('click', async () => {
  const result = $('testResult');
  const error = await notify('🌿 Breathe test', `Reminders are working. Current rhythm: ${MODES[settings.mode].label}.`, { force: true });
  result.textContent = error || `Last test sent at ${clockTime(Date.now())}. Didn't see it? Check the tips below.`;
  result.classList.toggle('error', Boolean(error));
  result.classList.toggle('ok', !error);
});

document.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => playChime(b.dataset.preview, true)));

$('resetSettingsBtn').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  saveSettings();
  applyLaunchAtLogin(false);
  applyCloseBehavior();
  resetPhase('work');
  syncSettingsForm();
  render();
  toast('Settings reset');
});

$('repoLink').addEventListener('click', (e) => {
  if (!isDesktop) return;
  e.preventDefault();
  invoke('plugin:opener|open_url', { url: e.currentTarget.href }).catch(() => {});
});

/* =========================================================================
   Main controls
   ========================================================================= */

el.modeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode === settings.mode) return;
    settings.mode = tab.dataset.mode;
    saveSettings();
    resetPhase('work');
    if (view === 'break') showView('focus');
    render();
  });
});

el.pauseBtn.addEventListener('click', () => {
  if (!timer.started) openBreath();
  else setPaused(!timer.paused);
});

el.primaryBtn.addEventListener('click', () => {
  if (!timer.started) startDay();
  else openBreath();
});

el.breakNowBtn.addEventListener('click', () => beginBreak({ early: true }));
$('extendBreakBtn').addEventListener('click', () => {
  timer.remaining += 300;
  timer.total += 300;
  toast('Break extended by 5 minutes');
  render();
});
$('endBreakBtn').addEventListener('click', () => beginFocus({ fromUser: true }));
el.endBreathBtn.addEventListener('click', leaveOverlay);
document.querySelectorAll('.pattern').forEach((b) => b.addEventListener('click', () => {
  settings.pattern = b.dataset.pattern;
  saveSettings();
  startBreathSession();
}));

$('openSettings').addEventListener('click', () => openSettings());
$('closeSettings').addEventListener('click', leaveOverlay);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (view === 'settings' || view === 'breath')) leaveOverlay();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

/* =========================================================================
   Desktop integration: tray menu, notification button, autostart, version
   ========================================================================= */

if (isDesktop && tauri.event) {
  tauri.event.listen('trigger-breathe-now', () => openBreath());
  tauri.event.listen('tray-request-state', () => publishState());
  tauri.event.listen('popover-opened', () => publishState());
  tauri.event.listen('tray-action', ({ payload }) => {
    switch (payload) {
      case 'breathe': openBreath(); break;
      case 'start': if (!timer.started) startDay(); break;
      case 'toggle-pause': timer.started ? setPaused(!timer.paused) : startDay(); break;
      case 'break-now':
        if (settings.mode !== 'micro' && timer.phase === 'work') beginBreak({ early: true });
        break;
      case 'snooze-15': snooze(15); break;
      case 'snooze-30': snooze(30); break;
      case 'snooze-60': snooze(60); break;
      case 'settings': openSettings(); break;
      default: break;
    }
  });

  invoke('plugin:autostart|is_enabled')
    .then((enabled) => {
      settings.launchAtLogin = Boolean(enabled);
      saveSettings();
      syncSettingsForm();
    })
    .catch(() => {});

  tauri.app?.getVersion?.().then((v) => { $('appVersion').textContent = v; }).catch(() => {});
  applyCloseBehavior();
}

/* =========================================================================
   Start
   ========================================================================= */

resetPhase('work');
timer.started = settings.autoStart;
el.breakIdea.textContent = BREAK_IDEAS[breakIdeaIndex];
renderPatternButtons();
syncSettingsForm();
render();
setInterval(tick, 1000);
