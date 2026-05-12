import { parseAppleUrl, parseGoogleUrl, buildAppleUrl, buildGoogleUrl, cleanPlace, extractUrlFromText } from './maps.js';

document.getElementById('cy').textContent = new Date().getFullYear();

const GOOGLE_SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co'];
let pendingRedirectUrl = '';
const inputEl = document.getElementById('input-url');
const pasteBtn = document.querySelector('.paste-btn');
let debounceTimer;
let currentStops = [];
let currentMode  = 'driving';

inputEl.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(tryConvert, 380);
});

inputEl.addEventListener('paste', e => {
  clearTimeout(debounceTimer);
  const raw = (e.clipboardData || window.clipboardData).getData('text');
  const extracted = extractUrlFromText(raw);
  if (extracted && extracted !== raw.trim()) {
    e.preventDefault();
    inputEl.value = extracted;
    tryConvert();
    return;
  }
  setTimeout(tryConvert, 0);
});

(function loadFromParam() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('url');
  if (!shared) return;

  inputEl.value = shared;
  inputEl.readOnly = true;
  pasteBtn.style.display = 'none';
  if (params.get('shared') === 'true') {
    document.getElementById('shared-banner').classList.add('visible');
  }

  if (window.__SSR_DATA__) {
    // Worker already rendered the HTML — just hydrate state
    const { stops, mode } = window.__SSR_DATA__;
    currentStops = stops;
    currentMode  = mode;
    document.title = stops.length >= 2 ? `${cleanPlace(stops[0])} to ${cleanPlace(stops[stops.length - 1])}` : 'Maps URL Converter';
    return;
  }

  tryConvert();
})();

window.pasteFromClipboard = async function() {
  try {
    const text = await navigator.clipboard.readText();
    const extracted = extractUrlFromText(text);
    inputEl.value = extracted || text;
    clearTimeout(debounceTimer);
    tryConvert();
  } catch { inputEl.focus(); }
};

window.resetAll = function() {
  hideOutput();
  hideError();
  hideRedirectBox();
  setTimeout(() => {
    pendingRedirectUrl = '';
    document.title = 'Maps URL Converter';
    inputEl.value = '';
    inputEl.readOnly = false;
    pasteBtn.style.display = '';
    const wrap = document.querySelector('.input-wrap');
    wrap.style.opacity = '0';
    wrap.style.transition = 'none';
    wrap.style.display = '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrap.style.transition = 'opacity 0.3s ease';
      wrap.style.opacity = '1';
    }));
    document.getElementById('route-rail').innerHTML = '';
    document.getElementById('map-cards').innerHTML = '';
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.classList.remove('copied');
      shareBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Copy share link`;
    }
    document.getElementById('shared-banner').classList.remove('visible');
    history.replaceState(null, '', location.pathname);
    inputEl.focus();
  }, 250);
};

window.toggleStops = function() {
  const pill   = document.getElementById('stops-pill');
  const detail = document.getElementById('waypoints-detail');
  if (!pill || !detail) return;
  const isOpen = detail.classList.contains('open');
  detail.classList.toggle('open', !isOpen);
  pill.classList.toggle('open', !isOpen);
  const n = detail.querySelectorAll('.rail-dot.via').length;
  document.getElementById('stops-pill-label').textContent =
    isOpen ? `${n} stop${n > 1 ? 's' : ''}` : 'Collapse';
};

window.copyCard = function(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
  });
};

window.shareRoute = function() {
  const raw = inputEl.value.trim();
  if (!raw) return;
  const shareUrl = `${location.origin}${location.pathname}?url=${encodeURIComponent(raw)}&shared=true`;
  const btn = document.getElementById('share-btn');
  const title = currentStops.length >= 2
    ? `${cleanPlace(currentStops[0])} to ${cleanPlace(currentStops[currentStops.length - 1])}`
    : 'Shared Maps route';
  const orig = btn.innerHTML;

  const markCopied = (label) => {
    btn.textContent = label;
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  };

  (async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url: shareUrl });
        markCopied('Shared!');
        return;
      }
    } catch {}
    navigator.clipboard.writeText(`${title}\n${shareUrl}`).then(() => markCopied('Copied with title!'));
  })();
};

function showError(msg) {
  const el = document.getElementById('error-box');
  el.textContent = msg;
  el.style.display = 'block';
  hideOutput();
}

function hideError() {
  document.getElementById('error-box').style.display = 'none';
}

function renderMapCards(appleUrl, googleUrl) {
  const container = document.getElementById('map-cards');
  container.innerHTML = '';
  [
    { type: 'apple',  label: 'Apple Maps',  url: appleUrl  },
    { type: 'google', label: 'Google Maps', url: googleUrl },
  ].forEach(({ type, label, url }) => {
    const logo = type === 'apple'
      ? `<img src="https://www.google.com/s2/favicons?domain=maps.apple.com&sz=256" alt="Apple Maps" />`
      : `<img src="https://1000logos.net/wp-content/uploads/2020/05/Google-Maps-Logo-1.png" alt="Google Maps" />`;

    const card = document.createElement('div');
    card.className = 'map-card';
    card.innerHTML = `
      <div class="map-card-logo ${type}">${logo}</div>
      <div class="map-card-url">
        <div class="map-card-platform">${label}</div>
        <span class="map-card-link">${url}</span>
      </div>
      <div class="map-card-actions">
        <button class="map-card-btn" onclick="copyCard(this, '${escAttr(url)}')">Copy</button>
        <a class="map-card-btn" href="${escAttr(url)}" target="_blank" rel="noopener">
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>`;
    container.appendChild(card);
  });
}

function renderRoute(stops) {
  stops = stops.map(cleanPlace);
  const origin    = stops[0];
  const dest      = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);
  const rail      = document.getElementById('route-rail');
  rail.innerHTML  = '';

  function makeRow(dotClass, label, name, { showTop = false, showBottom = false, isLast = false, noBottomPad = false } = {}) {
    const row = document.createElement('div');
    row.className = 'rail-row';
    const contentClass = isLast ? ' last' : noBottomPad ? ' no-pad' : '';
    row.innerHTML = `
      <div class="rail-track">
        <div class="rail-line top${showTop ? '' : ' hidden'}"></div>
        <div class="rail-dot ${dotClass}"></div>
        <div class="rail-line bottom${showBottom ? '' : ' hidden'}"></div>
      </div>
      <div class="rail-content${contentClass}">
        <div class="rail-label">${label}</div>
        <div class="rail-name">${name}</div>
      </div>`;
    return row;
  }

  if (waypoints.length === 0) {
    rail.appendChild(makeRow('origin', 'From', origin, { showBottom: true }));
    rail.appendChild(makeRow('dest',   'To',   dest,   { showTop: true, isLast: true }));
  } else if (waypoints.length === 1) {
    rail.appendChild(makeRow('origin', 'From', origin, { showBottom: true }));
    const inner = document.createElement('div');
    inner.className = 'rail-row';
    inner.innerHTML = `
      <div class="rail-track">
        <div class="rail-line top"></div>
        <div class="rail-dot via"></div>
        <div class="rail-line bottom"></div>
      </div>
      <div class="rail-content">
        <div class="rail-name">${waypoints[0]}</div>
      </div>`;
    rail.appendChild(inner);
    rail.appendChild(makeRow('dest', 'To', dest, { showTop: true, isLast: true }));
  } else {
    rail.appendChild(makeRow('origin', 'From', origin, { showBottom: true, noBottomPad: true }));

    const n = waypoints.length;
    const pillRow = document.createElement('div');
    pillRow.className = 'rail-stops-row';
    pillRow.innerHTML = `
      <div class="rail-stops-track rail-track-node">
        <div class="rail-line top"></div>
        <div class="rail-node"></div>
        <div class="rail-line bottom"></div>
      </div>
      <button class="rail-stops-pill" id="stops-pill" onclick="toggleStops()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span id="stops-pill-label">${n} stop${n > 1 ? 's' : ''}</span>
      </button>`;
    rail.appendChild(pillRow);

    const waypointsEl = document.createElement('div');
    waypointsEl.className = 'rail-waypoints';
    waypointsEl.id = 'waypoints-detail';
    waypoints.forEach(wp => {
      const inner = document.createElement('div');
      inner.className = 'rail-row';
      inner.innerHTML = `
        <div class="rail-track">
          <div class="rail-line top"></div>
          <div class="rail-dot via"></div>
          <div class="rail-line bottom"></div>
        </div>
        <div class="rail-content">
          <div class="rail-name">${wp}</div>
        </div>`;
      waypointsEl.appendChild(inner);
    });
    rail.appendChild(waypointsEl);
    rail.appendChild(makeRow('dest', 'To', dest, { showTop: true, isLast: true }));
  }
}

function escAttr(s) {
  return s.replace(/'/g, '%27').replace(/"/g, '&quot;');
}

function showOutput() {
  const el = document.getElementById('output-section');
  el.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
}

function hideOutput() {
  const el = document.getElementById('output-section');
  el.classList.remove('visible');
  setTimeout(() => { if (!el.classList.contains('visible')) el.style.display = 'none'; }, 300);
}

function isGoogleMaps(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return (h === 'google.com' || h.endsWith('.google.com')) && u.pathname.includes('/maps');
  } catch { return false; }
}

function isAppleHostname(hostname) {
  const h = (hostname || '').toLowerCase();
  return h === 'maps.apple.com' || h === 'maps.apple';
}

function isFullAppleMaps(url) {
  try {
    const u = new URL(url);
    return isAppleHostname(u.hostname) && (
      u.pathname.includes('directions') ||
      u.searchParams.has('source') || u.searchParams.has('destination') ||
      u.searchParams.has('saddr')  || u.searchParams.has('daddr')
    );
  } catch { return false; }
}

function isAppleShortLink(url) {
  try { return isAppleHostname(new URL(url).hostname) && !isFullAppleMaps(url); } catch { return false; }
}

function isGoogleShortLink(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return GOOGLE_SHORT_HOSTS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

function looksLikeUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

function extractNestedMapsUrl(value, depth = 0) {
  if (!value || depth > 6) return null;
  const candidate = value.replace(/[),.;]+$/g, '').trim();
  if (!candidate) return null;
  if (isGoogleMaps(candidate) || isFullAppleMaps(candidate)) return candidate;
  try {
    const decoded = decodeURIComponent(candidate).replace(/[),.;]+$/g, '').trim();
    if (decoded !== candidate) {
      const r = extractNestedMapsUrl(decoded, depth + 1);
      if (r) return r;
    }
  } catch {}
  try {
    const u = new URL(candidate);
    for (const key of ['url', 'link', 'deep_link_id', 'target', 'redirect', 'dest', 'destination']) {
      const v = u.searchParams.get(key);
      if (!v) continue;
      const r = extractNestedMapsUrl(v, depth + 1);
      if (r) return r;
    }
  } catch {}
  const urls = candidate.match(/https?:\/\/[^\s"'<>\\]+/ig) || [];
  for (const u of urls) {
    const cleaned = u.replace(/[),.;]+$/g, '').trim();
    if (isGoogleMaps(cleaned) || isFullAppleMaps(cleaned)) return cleaned;
  }
  return null;
}

function hideRedirectBox() { setRedirectLoading(false); }

function setRedirectLoading(isLoading) {
  document.getElementById('input-corner-spinner')?.classList.toggle('visible', !!isLoading);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function autoFollowRedirect(raw) {
  pendingRedirectUrl = raw;
  hideError();
  hideOutput();
  setRedirectLoading(true);

  const direct = extractNestedMapsUrl(raw);
  if (direct) {
    inputEl.value = direct;
    tryConvert();
    return;
  }

  try {
    const res = await fetchWithTimeout(`/api/resolve?url=${encodeURIComponent(raw)}`, {}, 15000);
    const data = await res.json();
    if (data.url && (isGoogleMaps(data.url) || isFullAppleMaps(data.url))) {
      setRedirectLoading(false);
      inputEl.value = data.url;
      tryConvert();
      return;
    }
  } catch {}

  setRedirectLoading(false);
  showError('No route detected from this link.');
}

function tryConvert() {
  hideError();
  hideRedirectBox();
  const raw = inputEl.value.trim();
  if (!raw) { hideOutput(); return; }

  try {
    const inner = new URL(raw).searchParams.get('url');
    if (inner) { inputEl.value = inner; tryConvert(); return; }
  } catch {}

  if (isGoogleShortLink(raw)) { autoFollowRedirect(raw); return; }
  if (isAppleShortLink(raw))  { autoFollowRedirect(raw); return; }

  const isApple  = isFullAppleMaps(raw);
  const isGoogle = isGoogleMaps(raw);
  if (!isApple && !isGoogle) {
    if (looksLikeUrl(raw)) { pendingRedirectUrl = raw; setRedirectLoading(true); autoFollowRedirect(raw); }
    return;
  }

  try {
    let stops, mode, appleUrl, googleUrl;
    if (isApple) {
      ({ stops, mode } = parseAppleUrl(raw));
      googleUrl = buildGoogleUrl(stops, mode);
      appleUrl  = raw;
    } else {
      ({ stops, mode } = parseGoogleUrl(raw));
      appleUrl  = buildAppleUrl(stops, mode);
      googleUrl = raw;
    }

    currentStops = stops;
    currentMode  = mode;
    renderRoute(stops);
    renderMapCards(appleUrl, googleUrl);
    document.title = stops.length >= 2 ? `${cleanPlace(stops[0])} to ${cleanPlace(stops[stops.length - 1])}` : 'Maps URL Converter';
    history.replaceState(null, '', `${location.pathname}?url=${encodeURIComponent(raw)}`);
    document.querySelector('.input-wrap').style.display = 'none';
    showOutput();
  } catch(e) {
    showError(e.message);
  }
}
