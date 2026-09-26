// Breathe Desktop - WFH Work-Rest Rhythm Controller
// Modern Tauri v2 Controller

// State
let currentMode = '50-10'; // '50-10' | '25-5' | 'micro'
let currentPhase = 'work'; // 'work' | 'break'
let sessionCount = 1;

let workMinutes = 50;
let breakMinutes = 10;
let microMinutes = 20;

let remainingSeconds = workMinutes * 60;
let isPaused = false;
let soundEnabled = true;
let timerId = null;
let lastTickAt = Date.now();

// DOM Elements
const appShell = document.querySelector('.app-shell');
const modeTabs = document.querySelectorAll('.mode-tab');
const modeDescription = document.getElementById('modeDescription');
const statusDotEl = document.getElementById('statusDot');
const statusTextEl = document.getElementById('statusText');
const cycleCountEl = document.getElementById('cycleCount');
const countdownValEl = document.getElementById('countdownVal');
const countdownLabelEl = document.getElementById('countdownLabel');
const progressEl = document.getElementById('progress');
const progressFillEl = document.getElementById('progressFill');
const microIntervalGroup = document.getElementById('microIntervalGroup');
const chips = document.querySelectorAll('.chip');

const toggleBtn = document.getElementById('toggleBtn');
const toggleBtnText = document.getElementById('toggleBtnText');
const toggleIconPath = document.getElementById('toggleIconPath');
const breatheNowBtn = document.getElementById('breatheNowBtn');
const skipPhaseBtn = document.getElementById('skipPhaseBtn');
const skipBtnText = document.getElementById('skipBtnText');
const testNotifyBtn = document.getElementById('testNotifyBtn');
const soundToggle = document.getElementById('soundToggle');

const guidePhaseEl = document.getElementById('guidePhase');
const guideSubtextEl = document.getElementById('guideSubtext');
const flowerEl = document.getElementById('flower');
const ergoTextEl = document.getElementById('ergoText');

// WFH Ergonomic Health & Posture Prompts
const ergoTips = [
  'Drop your shoulders away from your ears',
  'Drink a glass of water',
  'Look at something 20 feet away for 20 seconds',
  'Unclench your jaw and soften your forehead',
  'Stand up and gently stretch your hamstrings',
  'Check your posture: feet flat, back supported',
  'Take a long, slow belly breath through your nose'
];

let tipIndex = 0;
setInterval(() => {
  tipIndex = (tipIndex + 1) % ergoTips.length;
  ergoTextEl.style.opacity = '0';
  setTimeout(() => {
    ergoTextEl.textContent = ergoTips[tipIndex];
    ergoTextEl.style.opacity = '1';
  }, 300);
}, 12000);

// Web Audio API: Synthesized Tibetan Singing Bowl & Welcoming Chimes
function playChime(type = 'bell') {
  if (!soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'break-start') {
      // Gentle, deep relaxing 2-harmonic bowl
      [320, 640].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(idx === 0 ? 0.3 : 0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 3.9);
      });
    } else if (type === 'work-start') {
      // Uplifting, crisp welcome-back chime (F#5 -> A5)
      [740, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const start = ctx.currentTime + idx * 0.25;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 2.6);
      });
    } else {
      // Standard harmonic bell
      [370, 740, 1110].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime([0.25, 0.1, 0.04][idx], ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 3.1);
      });
    }
  } catch (e) {
    console.warn('Audio error:', e);
  }
}

// Native Notification Dispatcher
async function triggerNotification(title, body) {
  // 1. Tauri native Rust backend
  if (window.__TAURI__ && window.__TAURI__.core) {
    try {
      await window.__TAURI__.core.invoke('trigger_native_toast', {
        title: title || '🌿 Breathe Reminder',
        body: body || 'Time to pause, release tension, and take a deep breath.'
      });
      return;
    } catch (e) {
      console.warn('Tauri invoke error:', e);
    }
  }

  // 2. Browser fallback
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

// Time Formatter
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function phaseTotalSeconds() {
  if (currentMode === 'micro') return microMinutes * 60;
  return (currentPhase === 'work' ? workMinutes : breakMinutes) * 60;
}

// Countdown + progress bar
function renderTime() {
  countdownValEl.textContent = formatTime(remainingSeconds);
  const total = phaseTotalSeconds();
  const pct = Math.min(100, Math.max(0, ((total - remainingSeconds) / total) * 100));
  progressFillEl.style.width = `${pct}%`;
  progressEl.setAttribute('aria-valuenow', Math.round(pct));
}

// Switch Session Phase (Work <-> Break)
function transitionPhase() {
  if (currentMode === 'micro') {
    // In micro mode, just repeat reminder
    playChime('bell');
    triggerNotification(
      '🌿 Mindful Pause',
      'Take 3 deep breaths. Relax your shoulders and soften your gaze.'
    );
    remainingSeconds = microMinutes * 60;
    return;
  }

  if (currentPhase === 'work') {
    // Work completed -> Start Break
    currentPhase = 'break';
    remainingSeconds = breakMinutes * 60;
    appShell.classList.add('break-mode');

    playChime('break-start');
    triggerNotification(
      `☕ Time for your ${breakMinutes}-Minute Break!`,
      'Step away from your monitor, stretch your legs, and grab some water.'
    );

    statusTextEl.textContent = 'Rest & Recharge Break';
    countdownLabelEl.textContent = 'until deep focus resumes';
    skipBtnText.textContent = 'End Break Early';
  } else {
    // Break completed -> Resume Work
    currentPhase = 'work';
    sessionCount++;
    remainingSeconds = workMinutes * 60;
    appShell.classList.remove('break-mode');

    playChime('work-start');
    triggerNotification(
      '⚡ Break Complete!',
      `Session ${sessionCount} begins. Clear distractions and focus on your priority.`
    );

    statusTextEl.textContent = 'Focus Session Active';
    countdownLabelEl.textContent = `until ${breakMinutes}-minute break`;
    skipBtnText.textContent = 'Start Break Early';
    cycleCountEl.textContent = `Session ${sessionCount}`;
  }
}

// Timer Tick
// Intervals get throttled or suspended when the window is minimized/hidden,
// so count real elapsed wall-clock time instead of assuming 1s per tick.
function tick() {
  const now = Date.now();
  if (isPaused) {
    lastTickAt = now;
    return;
  }

  const elapsed = Math.floor((now - lastTickAt) / 1000);
  if (elapsed <= 0) return;
  lastTickAt += elapsed * 1000; // keep the sub-second remainder

  if (elapsed >= remainingSeconds) {
    // Carry any overshoot into the next phase (at most one transition per tick)
    const overshoot = elapsed - remainingSeconds;
    transitionPhase();
    remainingSeconds = Math.max(0, remainingSeconds - overshoot);
  } else {
    remainingSeconds -= elapsed;
  }
  renderTime();
}

// Start Timer
function startTimer() {
  if (timerId) clearInterval(timerId);
  lastTickAt = Date.now();
  renderTime();
  timerId = setInterval(tick, 1000);
}

// Catch up immediately when the window is restored
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

// Mode Selection Handler
function applyMode(mode) {
  currentMode = mode;
  currentPhase = 'work';
  appShell.classList.remove('break-mode');

  if (mode === '50-10') {
    workMinutes = 50;
    breakMinutes = 10;
    remainingSeconds = workMinutes * 60;
    modeDescription.textContent = '50 min focus, then a 10 min break';
    statusTextEl.textContent = 'Focus Session Active';
    countdownLabelEl.textContent = 'until 10-minute break';
  } else if (mode === '25-5') {
    workMinutes = 25;
    breakMinutes = 5;
    remainingSeconds = workMinutes * 60;
    modeDescription.textContent = '25 min sprint, then a 5 min break';
    statusTextEl.textContent = 'Pomodoro Sprint';
    countdownLabelEl.textContent = 'until 5-minute break';
  } else if (mode === 'micro') {
    remainingSeconds = microMinutes * 60;
    modeDescription.textContent = 'A gentle reminder to pause and take a few breaths';
    statusTextEl.textContent = 'Mindful Reminders';
    countdownLabelEl.textContent = 'until next breathing pause';
  }

  microIntervalGroup.hidden = mode !== 'micro';
  skipPhaseBtn.hidden = mode === 'micro';
  skipBtnText.textContent = 'Start Break Early';

  renderTime();
}

// Pause / Resume Toggle
function togglePause() {
  isPaused = !isPaused;

  if (isPaused) {
    statusDotEl.classList.add('paused');
    statusTextEl.textContent += ' (Paused)';
    toggleBtn.classList.add('paused');
    toggleBtnText.textContent = 'Resume Timer';
    toggleIconPath.setAttribute('d', 'M8 5v14l11-7z');
  } else {
    lastTickAt = Date.now(); // don't count paused time
    statusDotEl.classList.remove('paused');
    statusTextEl.textContent = statusTextEl.textContent.replace(' (Paused)', '');
    toggleBtn.classList.remove('paused');
    toggleBtnText.textContent = 'Pause Session';
    toggleIconPath.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
  }
}

// Breathing guide, driven by the flower animation so the words match the motion.
// Each alternate iteration of the flower is one half-breath (expand = in, contract = out).
const phases = [
  { text: 'Breathe in', subtext: 'Slowly, through your nose' },
  { text: 'Breathe out', subtext: 'Let your shoulders soften' }
];

let currentPhaseIdx = 0;
flowerEl.addEventListener('animationiteration', (e) => {
  if (e.target !== flowerEl) return; // ignore bubbling from the circles
  currentPhaseIdx = (currentPhaseIdx + 1) % phases.length;
  guidePhaseEl.style.opacity = '0';
  guideSubtextEl.style.opacity = '0';

  setTimeout(() => {
    guidePhaseEl.textContent = phases[currentPhaseIdx].text;
    guideSubtextEl.textContent = phases[currentPhaseIdx].subtext;
    guidePhaseEl.style.opacity = '1';
    guideSubtextEl.style.opacity = '1';
  }, 250);
});

// Segmented controls: one thumb per control that slides under the active segment
function syncThumb(group, animate = true) {
  const thumb = group.querySelector('.segmented-thumb');
  const active = group.querySelector('button.active');
  if (!thumb || !active) return;
  if (!animate) group.classList.add('no-anim');
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  if (!animate) {
    void thumb.offsetWidth; // commit position before re-enabling transitions
    group.classList.remove('no-anim');
  }
}

document.querySelectorAll('.segmented').forEach(group => {
  const thumb = document.createElement('span');
  thumb.className = 'segmented-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  group.prepend(thumb);
  // Also covers the first layout and un-hiding the Micro-Pause interval group
  new ResizeObserver(() => syncThumb(group, false)).observe(group);
});

// Event Listeners
modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modeTabs.forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-pressed', t === tab);
    });
    syncThumb(tab.parentElement);
    applyMode(tab.dataset.mode);
  });
});

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    chips.forEach(c => {
      c.classList.toggle('active', c === chip);
      c.setAttribute('aria-pressed', c === chip);
    });
    syncThumb(chip.parentElement);

    microMinutes = parseInt(chip.dataset.minutes, 10);
    remainingSeconds = microMinutes * 60;
    renderTime();
  });
});

toggleBtn.addEventListener('click', togglePause);

skipPhaseBtn.addEventListener('click', () => {
  transitionPhase();
  renderTime();
});

breatheNowBtn.addEventListener('click', () => {
  playChime('bell');
  const originalText = breatheNowBtn.querySelector('span').textContent;
  breatheNowBtn.querySelector('span').textContent = 'Breathe in rhythm…';
  setTimeout(() => {
    breatheNowBtn.querySelector('span').textContent = originalText;
  }, 4000);
});

testNotifyBtn.addEventListener('click', () => {
  triggerNotification(
    '🌿 Breathe Reminder',
    'Notifications are active! Current rhythm: ' + document.querySelector('.mode-tab.active').textContent
  );
});

soundToggle.addEventListener('change', (e) => {
  soundEnabled = e.target.checked;
  if (soundEnabled) playChime('bell');
});

// Listen for Tauri events (when user clicks "🌸 Breathe Now" inside the Windows toast notification)
if (window.__TAURI__ && window.__TAURI__.event) {
  window.__TAURI__.event.listen('trigger-breathe-now', () => {
    breatheNowBtn.click();
  });
}

// Initialize
applyMode('50-10');
startTimer();
