import { parseAppleUrl, parseGoogleUrl, buildAppleUrl, buildGoogleUrl, cleanPlace } from '../public/maps.js';

const APPLE_LOGO = `<img src="https://www.google.com/s2/favicons?domain=maps.apple.com&sz=256" alt="Apple Maps" />`;
const GOOGLE_LOGO = `<img src="https://1000logos.net/wp-content/uploads/2020/05/Google-Maps-Logo-1.png" alt="Google Maps" />`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/resolve') {
      return handleResolve(url);
    }

    const assetRes = await env.ASSETS.fetch(request);

    const ct = assetRes.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return assetRes;

    const mapUrl = url.searchParams.get('url');
    if (!mapUrl) return assetRes;

    let ssrData = null;
    try {
      ssrData = resolveRoute(mapUrl);
    } catch {}

    if (!ssrData) return assetRes;

    const { stops, mode, appleUrl, googleUrl } = ssrData;
    const title = routeTitle(stops);
    const description = 'Open in Apple Maps or Google Maps';
    const isShared = url.searchParams.get('shared') === 'true';

    return new HTMLRewriter()
      .on('title', {
        element(el) { el.setInnerContent(title); }
      })
      .on('head', {
        element(el) {
          const origin = new URL(request.url).origin;
          el.append(
            `<meta property="og:title" content="${esc(title)}">` +
            `<meta property="og:description" content="${esc(description)}">` +
            `<meta property="og:type" content="website">` +
            `<meta property="og:image" content="${origin}/og-image.svg">` +
            `<meta name="twitter:card" content="summary_large_image">` +
            `<meta name="twitter:title" content="${esc(title)}">` +
            `<meta name="twitter:image" content="${origin}/og-image.svg">` +
            `<script>window.__SSR_DATA__=${JSON.stringify(ssrData)};</script>`,
            { html: true }
          );
        }
      })
      .on('#shared-banner', {
        element(el) {
          if (isShared) el.setAttribute('class', 'shared-banner visible');
        }
      })
      .on('.input-wrap', {
        element(el) { el.setAttribute('style', 'display:none'); }
      })
      .on('#route-rail', {
        element(el) { el.setInnerContent(renderRouteHtml(stops), { html: true }); }
      })
      .on('#map-cards', {
        element(el) { el.setInnerContent(renderMapCardsHtml(appleUrl, googleUrl), { html: true }); }
      })
      .on('#output-section', {
        element(el) {
          el.setAttribute('style', 'display:block;opacity:1;transform:translateY(0)');
          el.setAttribute('class', 'visible');
        }
      })
      .transform(assetRes);
  }
};

// ── Server-side HTML rendering ─────────────────────────────────────────────

function renderRouteHtml(stops) {
  stops = stops.map(cleanPlace);
  const origin    = stops[0];
  const dest      = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);

  function row(dotClass, label, name, { showTop = false, showBottom = false, isLast = false, noBottomPad = false } = {}) {
    const contentClass = isLast ? ' last' : noBottomPad ? ' no-pad' : '';
    return `<div class="rail-row">
      <div class="rail-track">
        <div class="rail-line top${showTop ? '' : ' hidden'}"></div>
        <div class="rail-dot ${dotClass}"></div>
        <div class="rail-line bottom${showBottom ? '' : ' hidden'}"></div>
      </div>
      <div class="rail-content${contentClass}">
        <div class="rail-label">${esc(label)}</div>
        <div class="rail-name">${esc(name)}</div>
      </div>
    </div>`;
  }

  if (waypoints.length === 0) {
    return row('origin', 'From', origin, { showBottom: true }) +
           row('dest',   'To',   dest,   { showTop: true, isLast: true });
  }

  if (waypoints.length === 1) {
    return row('origin', 'From', origin, { showBottom: true }) +
      `<div class="rail-row">
        <div class="rail-track">
          <div class="rail-line top"></div>
          <div class="rail-dot via"></div>
          <div class="rail-line bottom"></div>
        </div>
        <div class="rail-content"><div class="rail-name">${esc(waypoints[0])}</div></div>
      </div>` +
      row('dest', 'To', dest, { showTop: true, isLast: true });
  }

  const n = waypoints.length;
  const waypointRows = waypoints.map(wp => `
    <div class="rail-row">
      <div class="rail-track">
        <div class="rail-line top"></div>
        <div class="rail-dot via"></div>
        <div class="rail-line bottom"></div>
      </div>
      <div class="rail-content"><div class="rail-name">${esc(wp)}</div></div>
    </div>`).join('');

  return row('origin', 'From', origin, { showBottom: true, noBottomPad: true }) +
    `<div class="rail-stops-row">
      <div class="rail-stops-track rail-track-node">
        <div class="rail-line top"></div>
        <div class="rail-node"></div>
        <div class="rail-line bottom"></div>
      </div>
      <button class="rail-stops-pill" id="stops-pill" onclick="toggleStops()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span id="stops-pill-label">${n} stop${n > 1 ? 's' : ''}</span>
      </button>
    </div>
    <div class="rail-waypoints" id="waypoints-detail">${waypointRows}</div>` +
    row('dest', 'To', dest, { showTop: true, isLast: true });
}

function renderMapCardsHtml(appleUrl, googleUrl) {
  return [
    { type: 'apple',  label: 'Apple Maps',  logo: APPLE_LOGO,  url: appleUrl  },
    { type: 'google', label: 'Google Maps', logo: GOOGLE_LOGO, url: googleUrl },
  ].map(({ type, label, logo, url }) => `
    <div class="map-card">
      <div class="map-card-logo ${type}">${logo}</div>
      <div class="map-card-url">
        <div class="map-card-platform">${label}</div>
        <span class="map-card-link">${esc(url)}</span>
      </div>
      <div class="map-card-actions">
        <button class="map-card-btn" onclick="copyCard(this, '${escAttr(url)}')">Copy</button>
        <a class="map-card-btn" href="${escAttr(url)}" target="_blank" rel="noopener">
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>
    </div>`).join('');
}

function routeTitle(stops) {
  const from = cleanPlace(stops[0]);
  const to   = cleanPlace(stops[stops.length - 1]);
  const n    = stops.length - 2;
  return n > 0 ? `${from} to ${to} with ${n} stop${n > 1 ? 's' : ''}` : `${from} to ${to}`;
}

// ── Routing ────────────────────────────────────────────────────────────────

function resolveRoute(mapUrl) {
  const u = new URL(mapUrl);
  const h = u.hostname.toLowerCase();
  const isApple  = h === 'maps.apple.com' || h === 'maps.apple';
  const isGoogle = h === 'google.com' || h.endsWith('.google.com');
  if (!isApple && !isGoogle) throw new Error('Not a maps URL');

  const { stops, mode } = isApple ? parseAppleUrl(mapUrl) : parseGoogleUrl(mapUrl);
  return { stops, mode, appleUrl: buildAppleUrl(stops, mode), googleUrl: buildGoogleUrl(stops, mode) };
}

async function handleResolve(url) {
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'Missing url param' }, 400);
  try {
    const res = await fetch(target, { redirect: 'follow' });
    return json({ url: res.url });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s).replace(/'/g, '%27').replace(/"/g, '&quot;');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
