import { parseAppleUrl, parseGoogleUrl, buildAppleUrl, buildGoogleUrl, cleanPlace } from '../public/maps.js';

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

    const title = ssrData
      ? `${ssrData.stops[0]} to ${ssrData.stops[ssrData.stops.length - 1]}`
      : 'Maps URL Converter';
    const description = ssrData
      ? 'Open in Apple Maps or Google Maps'
      : 'Convert between Apple Maps and Google Maps links';

    return new HTMLRewriter()
      .on('title', {
        element(el) { el.setInnerContent(title); }
      })
      .on('head', {
        element(el) {
          el.append(
            `<meta property="og:title" content="${esc(title)}">` +
            `<meta property="og:description" content="${esc(description)}">` +
            `<meta property="og:type" content="website">` +
            `<meta name="twitter:card" content="summary">` +
            `<meta name="twitter:title" content="${esc(title)}">` +
            (ssrData ? `<script>window.__SSR_DATA__=${JSON.stringify(ssrData)};</script>` : ''),
            { html: true }
          );
        }
      })
      .transform(assetRes);
  }
};

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

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
