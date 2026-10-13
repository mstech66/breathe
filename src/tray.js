// Tray popover: a small window that mirrors the main window's timer.
// The timer itself lives in the main window (main.js); this page only displays
// the 'timer-state' it publishes and sends button presses back to Rust.

const tauri = window.__TAURI__;
const $ = (id) => document.getElementById(id);

const ICON = {
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10.5-6.5z'
};

let state = null;

function render(s) {
  state = s;
  document.body.dataset.phase = s.phase;
  document.body.classList.toggle('paused', s.started && s.paused);

  $('status').textContent = s.started && s.paused ? 'Paused' : s.status;
  $('time').textContent = s.time;
  $('bar').style.width = `${Math.max(0, Math.min(1, s.share)) * 100}%`;
  $('label').textContent = s.label;
  $('endsAt').textContent = s.endsAt;

  // Sessions: dots for small goals, plain text otherwise
  const dots = $('dots');
  if (s.goal > 0 && s.goal <= 8) {
    const n = Math.max(s.goal, Math.min(s.done, 8));
    dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < s.done ? 'done' : ''}"></i>`).join('');
    dots.hidden = false;
  } else {
    dots.hidden = true;
  }
  if (s.goal === 0) $('sessions').textContent = `${s.done} ${s.done === 1 ? 'session' : 'sessions'} today`;
  else if (s.done >= s.goal) $('sessions').textContent = `${s.done} today · goal met`;
  else $('sessions').textContent = `${s.done} of ${s.goal} today`;

  // First tile: Start when the day hasn't started, otherwise Pause / Resume
  const showPlay = !s.started || s.paused;
  $('pauseIcon').setAttribute('d', showPlay ? ICON.play : ICON.pause);
  $('pauseText').textContent = !s.started ? 'Start' : s.paused ? 'Resume' : 'Pause';
  $('pauseTile').dataset.action = s.started ? 'toggle-pause' : 'start';

  $('breakTile').disabled = s.micro || s.phase === 'break';
}

async function act(action) {
  if (!tauri?.core) return;
  try {
    await tauri.core.invoke('tray_action', { action });
  } catch (e) {
    console.warn('Tray action failed:', e);
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (btn && !btn.disabled) act(btn.dataset.action);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') act('hide');
});

if (tauri?.event) {
  tauri.event.listen('timer-state', ({ payload }) => render(payload));
  tauri.event.emit('tray-request-state').catch(() => {});
} else {
  // Opened in a normal browser: show sample data so the layout can be checked
  render({
    phase: 'work', micro: false, started: true, paused: false, status: 'Deep focus',
    time: '32:14', share: 0.36, label: 'until your 10-minute break', endsAt: 'Break at 8:12 PM',
    goal: 4, done: 2
  });
}
