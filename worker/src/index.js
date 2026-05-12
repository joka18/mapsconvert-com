export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/resolve') {
      return handleResolve(url);
    }

    // Serve static asset, injecting OG tags into HTML responses
    const assetRes = await env.ASSETS.fetch(request);
    const ct = assetRes.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return assetRes;

    const mapUrl = url.searchParams.get('url');
    const { title, description } = getOgMeta(mapUrl);

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
            `<meta name="twitter:title" content="${esc(title)}">`,
            { html: true }
          );
        }
      })
      .transform(assetRes);
  }
};

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

function getOgMeta(mapUrl) {
  const fallback = {
    title: 'Maps URL Converter',
    description: 'Convert between Apple Maps and Google Maps links'
  };
  if (!mapUrl) return fallback;

  try {
    const u = new URL(mapUrl);

    // Apple Maps full directions URL
    if (u.hostname === 'maps.apple.com') {
      const source = u.searchParams.get('source') || u.searchParams.get('saddr');
      const dest   = u.searchParams.get('destination') || u.searchParams.get('daddr');
      if (source) {
        const from = clean(source);
        const to   = dest ? clean(dest) : null;
        return {
          title: to ? `${from} to ${to}` : `From ${from}`,
          description: 'Open in Apple Maps or Google Maps'
        };
      }
    }

    // Google Maps /dir/ URL
    if (u.hostname.includes('google.com') && mapUrl.includes('/maps/dir/')) {
      const match = mapUrl.match(/\/maps\/dir\/([^?#]+)/);
      if (match) {
        const parts = match[1]
          .split('/')
          .map(s => clean(decodeURIComponent(s)))
          .filter(s => s && !/^@/.test(s) && !/^\d{1,2}z$/.test(s));
        parts.pop(); // remove ghost last dest
        if (parts.length >= 2) {
          return {
            title: `${parts[0]} to ${parts[parts.length - 1]}`,
            description: 'Open in Apple Maps or Google Maps'
          };
        }
      }
    }
  } catch {}

  return fallback;
}

function clean(s) {
  return s.replace(/\+/g, ' ').trim();
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
