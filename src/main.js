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

// DOM Elements
const appShell = document.querySelector('.app-shell');
const modeBadge = document.getElementById('modeBadge');
const modeTabs = document.querySelectorAll('.mode-tab');
const modeDescription = document.getElementById('modeDescription');
const statusDotEl = document.getElementById('statusDot');
const statusTextEl = document.getElementById('statusText');
const cycleCountEl = document.getElementById('cycleCount');
const countdownValEl = document.getElementById('countdownVal');
const countdownLabelEl = document.getElementById('countdownLabel');
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
const ergoIconEl = document.getElementById('ergoIcon');
const ergoTextEl = document.getElementById('ergoText');

// WFH Ergonomic Health & Posture Prompts
const ergoTips = [
  { icon: '🧘', text: 'Drop your shoulders away from your ears' },
  { icon: '💧', text: 'Drink a glass of water to hydrate your brain' },
  { icon: '👁️', text: 'Look 20 feet away to relax your eye muscles' },
  { icon: '🦷', text: 'Unclench your jaw and soften your forehead' },
  { icon: '🚶', text: 'Stand up and gently stretch your hamstrings' },
  { icon: '🪑', text: 'Check your posture: feet flat, back supported' },
  { icon: '🌬️', text: 'Take a long, slow belly breath through your nose' }
];

let tipIndex = 0;
setInterval(() => {
  tipIndex = (tipIndex + 1) % ergoTips.length;
  ergoTextEl.style.opacity = '0';
  setTimeout(() => {
    ergoIconEl.textContent = ergoTips[tipIndex].icon;
    ergoTextEl.textContent = ergoTips[tipIndex].text;
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
function tick() {
  if (isPaused) return;

  if (remainingSeconds > 0) {
    remainingSeconds--;
    countdownValEl.textContent = formatTime(remainingSeconds);
  } else {
    transitionPhase();
    countdownValEl.textContent = formatTime(remainingSeconds);
  }
}

// Start Timer
function startTimer() {
  if (timerId) clearInterval(timerId);
  countdownValEl.textContent = formatTime(remainingSeconds);
  timerId = setInterval(tick, 1000);
}

// Mode Selection Handler
function applyMode(mode) {
  currentMode = mode;
  currentPhase = 'work';
  appShell.classList.remove('break-mode');

  if (mode === '50-10') {
    workMinutes = 50;
    breakMinutes = 10;
    remainingSeconds = workMinutes * 60;
    modeBadge.textContent = '50/10 Rhythm';
    modeDescription.textContent = '50 minutes deep focus followed by a 10-minute restorative break';
    statusTextEl.textContent = 'Focus Session Active';
    countdownLabelEl.textContent = 'until 10-minute break';
    microIntervalGroup.style.display = 'none';
    skipPhaseBtn.style.display = 'flex';
    skipBtnText.textContent = 'Start Break Early';
  } else if (mode === '25-5') {
    workMinutes = 25;
    breakMinutes = 5;
    remainingSeconds = workMinutes * 60;
    modeBadge.textContent = 'Pomodoro (25/5)';
    modeDescription.textContent = '25 minutes focused sprint followed by a 5-minute breathing break';
    statusTextEl.textContent = 'Pomodoro Sprint';
    countdownLabelEl.textContent = 'until 5-minute break';
    microIntervalGroup.style.display = 'none';
    skipPhaseBtn.style.display = 'flex';
    skipBtnText.textContent = 'Start Break Early';
  } else if (mode === 'micro') {
    remainingSeconds = microMinutes * 60;
    modeBadge.textContent = 'Micro-Pause';
    modeDescription.textContent = 'Gentle periodic reminders for quick 60-second breathing resets';
    statusTextEl.textContent = 'Mindful Reminders';
    countdownLabelEl.textContent = 'until next breathing pause';
    microIntervalGroup.style.display = 'block';
    skipPhaseBtn.style.display = 'none';
  }

  countdownValEl.textContent = formatTime(remainingSeconds);
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
    statusDotEl.classList.remove('paused');
    statusTextEl.textContent = currentPhase === 'work' ? 'Focus Session Active' : 'Rest & Recharge Break';
    toggleBtn.classList.remove('paused');
    toggleBtnText.textContent = 'Pause Session';
    toggleIconPath.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
  }
}

// Breathing Pacing Guide Cycles (9s full cycle)
const phases = [
  { text: 'Inhale deeply', subtext: 'Fill your lungs and expand your chest' },
  { text: 'Hold gently', subtext: 'Feel the stillness within' },
  { text: 'Exhale slowly', subtext: 'Release all tension and soften your shoulders' },
  { text: 'Rest peacefully', subtext: 'Calm mind, steady body' }
];

let currentPhaseIdx = 0;
setInterval(() => {
  currentPhaseIdx = (currentPhaseIdx + 1) % phases.length;
  guidePhaseEl.style.opacity = '0';
  guideSubtextEl.style.opacity = '0';

  setTimeout(() => {
    guidePhaseEl.textContent = phases[currentPhaseIdx].text;
    guideSubtextEl.textContent = phases[currentPhaseIdx].subtext;
    guidePhaseEl.style.opacity = '1';
    guideSubtextEl.style.opacity = '1';
  }, 400);
}, 4500);

// Event Listeners
modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    applyMode(tab.dataset.mode);
  });
});

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    chips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    microMinutes = parseInt(chip.dataset.minutes, 10);
    remainingSeconds = microMinutes * 60;
    countdownValEl.textContent = formatTime(remainingSeconds);
  });
});

toggleBtn.addEventListener('click', togglePause);

skipPhaseBtn.addEventListener('click', () => {
  transitionPhase();
  countdownValEl.textContent = formatTime(remainingSeconds);
});

breatheNowBtn.addEventListener('click', () => {
  playChime('bell');
  const originalText = breatheNowBtn.querySelector('span').textContent;
  breatheNowBtn.querySelector('span').textContent = 'Breathe in rhythm...';
  setTimeout(() => {
    breatheNowBtn.querySelector('span').textContent = originalText;
  }, 4000);
});

testNotifyBtn.addEventListener('click', () => {
  triggerNotification(
    '🌿 Breathe Reminder',
    'Notifications are active! Current rhythm: ' + modeBadge.textContent
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
