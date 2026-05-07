// ── Helpers ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

function setStepStatus(stepId, status) {
  const el = $(`${stepId}-status`);
  if (!el) return;
  el.textContent = status === 'done' ? '✓' : status === 'wait' ? '…' : '';
  el.className = `step-status ${status}`;
  $(`step-${stepId.replace('step-', '')}`).classList.toggle('active', status === 'wait');
  $(`step-${stepId.replace('step-', '')}`).classList.toggle('done', status === 'done');
}

// ── Service Worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Namen beheer ─────────────────────────────────────────────────────────────

let names = [];

function renderNames() {
  const list = $('names-list');
  list.innerHTML = '';
  names.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'name-chip';
    chip.innerHTML = `<span>${name}</span><button type="button" data-i="${i}" aria-label="Verwijder ${name}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      names.splice(i, 1);
      renderNames();
    });
    list.appendChild(chip);
  });
}

function addName() {
  const input = $('name-input');
  const val = input.value.trim();
  if (!val) return;
  if (names.includes(val)) { input.value = ''; return; }
  if (names.length >= 12) return;
  names.push(val);
  input.value = '';
  hide('names-error');
  renderNames();
}

$('add-name-btn').addEventListener('click', addName);

$('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addName(); }
});

// ── Stijl presets (snelknoppen die het tekstveld invullen) ───────────────────

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('style-custom-input').value = btn.dataset.style;
  });
});

// ── Auth check bij laden ──────────────────────────────────────────────────────

(async function init() {
  try {
    const res = await fetch('/api/me');
    const { loggedIn } = await res.json();
    if (loggedIn) showScreen('main');
    else showScreen('login');
  } catch {
    showScreen('login');
  }
})();

// ── Login ─────────────────────────────────────────────────────────────────────

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('password-input').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      hide('login-error');
      showScreen('main');
    } else {
      show('login-error');
      $('password-input').value = '';
      $('password-input').focus();
    }
  } catch {
    show('login-error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Inloggen';
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────

$('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  showScreen('login');
  $('password-input').value = '';
  resetUI();
});

// ── Genereer knop ─────────────────────────────────────────────────────────────

$('generate-btn').addEventListener('click', async () => {
  if (names.length < 2) {
    show('names-error');
    $('name-input').focus();
    return;
  }

  const theme = $('theme-input').value.trim();
  const style = $('style-custom-input').value.trim();
  startLoading();

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names, theme, style }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Onbekende fout');
      return;
    }

    showResult(data);
  } catch (err) {
    showError('Netwerkfout: ' + err.message);
  }
});

$('retry-btn').addEventListener('click', () => {
  hide('section-error');
  show('section-form');
});

$('new-song-btn').addEventListener('click', resetUI);

// ── UI state ──────────────────────────────────────────────────────────────────

function startLoading() {
  hide('section-form');
  hide('section-error');
  hide('section-result');
  show('section-loading');

  setStepStatus('step-openai', 'wait');
  setStepStatus('step-suno', '');
  $('loading-text').textContent = 'GPT-4o schrijft de drinkregels…';

  setTimeout(() => {
    setStepStatus('step-openai', 'done');
    setStepStatus('step-suno', 'wait');
    $('loading-text').textContent = 'Suno genereert je liedje…';
  }, 8000);
}

function showError(message) {
  hide('section-loading');
  hide('section-form');
  $('error-message').textContent = message;
  show('section-error');
}

function showResult(data) {
  hide('section-loading');

  const container = $('tracks-container');
  container.innerHTML = '';
  const template = document.getElementById('track-template');

  data.tracks.forEach((track, i) => {
    const clone = template.content.cloneNode(true);

    clone.querySelector('.track-title').textContent =
      `${track.title}${data.tracks.length > 1 ? ` (versie ${i + 1})` : ''}`;
    clone.querySelector('.track-tags').textContent = data.tags;
    clone.querySelector('.track-duration').textContent = track.duration
      ? `⏱ ${formatDuration(track.duration)}`
      : '';

    const cover = clone.querySelector('.track-cover');
    if (track.imageUrl) {
      cover.src = track.imageUrl;
      cover.alt = track.title;
    } else {
      cover.style.display = 'none';
    }

    clone.querySelector('.track-audio').src = track.audioUrl;

    const dl = clone.querySelector('.track-download');
    dl.href = track.audioUrl;
    dl.setAttribute('download', `${track.title}.mp3`);

    container.appendChild(clone);
  });

  // Drinkschema
  $('schedule-display').innerHTML = formatSchedule(data.schedule);

  // Lyrics
  $('lyrics-display').innerHTML = formatLyrics(data.lyrics);

  setStepStatus('step-suno', 'done');
  show('section-result');
}

function resetUI() {
  hide('section-result');
  hide('section-error');
  hide('section-loading');
  show('section-form');
  $('tracks-container').innerHTML = '';
  $('schedule-display').innerHTML = '';
  $('lyrics-display').innerHTML = '';
  setStepStatus('step-openai', '');
  setStepStatus('step-suno', '');
}

// ── Formatteerhulpen ─────────────────────────────────────────────────────────

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatSchedule(schedule) {
  if (!schedule?.length) return '';
  return schedule.map((r, i) => {
    const isGezamenlijk = r.type === 'gezamenlijk';
    const icon = isGezamenlijk ? '🍻' : '🍺';
    const cls = isGezamenlijk ? 'schedule-row gezamenlijk' : 'schedule-row';
    return `<div class="${cls}">
      <span class="schedule-num">Ronde ${i + 1}</span>
      <span class="schedule-punishment">${icon} ${r.punishment}</span>
    </div>`;
  }).join('');
}

function formatLyrics(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      if (/^\[.+\]/.test(line)) {
        return `<span class="lyrics-section">${line}</span>`;
      }
      // Strafregels geel: bevatten "slok", "biertje", of "drink" + een naam/iedereen
      if (/\b(slok(?:ken)?|biertje|heel biertje|half biertje)\b/i.test(line) && line.trim()) {
        return `<span class="lyrics-drink">🍺 ${line}</span>`;
      }
      return line.trim() === '' ? '<br>' : `<span>${line}</span>`;
    })
    .join('\n');
}
