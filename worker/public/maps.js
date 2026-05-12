export function parseAppleUrl(url) {
  const params = new URL(url).searchParams;
  const source = params.get('source') || params.get('saddr');
  const dest   = params.get('destination') || params.get('daddr');
  if (!source || !dest) throw new Error('Could not find source or destination in the Apple Maps URL.');
  const waypoints = params.getAll('waypoint');
  let mode = params.get('mode') || 'driving';
  if (mode === 'r') mode = 'driving';
  if (mode === 'w') mode = 'walking';
  if (mode === 'c') mode = 'cycling';
  return { stops: [source, ...waypoints, dest], mode };
}

export function parseGoogleUrl(url) {
  const u = new URL(url);
  if (!u.pathname.includes('/maps/dir')) throw new Error('Could not find route in the URL. Make sure it is a /dir/ link.');

  const pathnameMatch = u.pathname.match(/\/maps\/dir\/([^?#]+)/);
  const segments = pathnameMatch
    ? pathnameMatch[1].split('/').map(s => decodeURIComponent(s.trim()))
    : [];

  let stops = segments.filter(s => {
    if (!s) return false;
    if (/^@/i.test(s)) return false;
    if (/^\d{1,2}z$/i.test(s)) return false;
    if (/^data=|^data!/i.test(s)) return false;
    if (s === 'dir' || s === 'maps') return false;
    return true;
  });

  if (stops.length < 2) {
    const origin      = u.searchParams.get('origin');
    const destination = u.searchParams.get('destination');
    const waypointRaw = u.searchParams.get('waypoints') || '';
    const waypointList = waypointRaw.split('|').map(w => decodeURIComponent(w.trim())).filter(Boolean);
    const queryStops  = [origin, ...waypointList, destination].filter(Boolean);
    if (queryStops.length >= 2) stops = queryStops;
  }

  if (stops.length < 2) throw new Error('Found fewer than 2 stops. Make sure the URL includes route points.');

  let mode = 'driving';
  if (url.includes('!3e1')) mode = 'walking';
  else if (url.includes('!3e2')) mode = 'bicycling';
  else if (url.includes('!3e3')) mode = 'transit';
  else {
    const t = u.searchParams.get('travelmode');
    if (t === 'walking' || t === 'bicycling' || t === 'transit' || t === 'driving') mode = t;
  }

  stops = stops.map(cleanPlace);
  return { stops, mode };
}

export function buildGoogleUrl(stops, mode) {
  const path = stops.map(s => encodeURIComponent(s)).join('/');
  return `https://www.google.com/maps/dir/${path}/?travelmode=${mode}`;
}

export function buildAppleUrl(stops, mode) {
  const modeMap = { driving: 'r', walking: 'w', bicycling: 'c', transit: 'pt', cycling: 'c' };
  const origin    = stops[0];
  const dest      = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);
  let url = `https://maps.apple.com/directions?source=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&mode=${modeMap[mode] || 'r'}`;
  waypoints.forEach(w => { url += `&waypoint=${encodeURIComponent(w)}`; });
  return url;
}

export function cleanPlace(s) {
  return s.replace(/\+/g, ' ').trim();
}

export function extractUrlFromText(text) {
  if (!text) return null;
  const normalized = text
    .replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\u003f/gi, '?')
    .replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  const match = normalized.match(/https?:\/\/[^\s"'<>\\]+/i);
  if (!match) return null;
  return match[0].replace(/[),.;]+$/g, '').trim();
}
