importScripts('access.js');
// Red strip: open the full-size image in a new tab.
// The thumbnail opens at once; we then find the real image on the source page by
// fingerprint-matching its candidate images against the thumbnail, and swap it in.
const DEADLINE_MS = 20000;
const MAX_CANDIDATES = 24;
const MATCH_MAX_DISTANCE = 16; // out of 64 bits

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opts = {}, ms = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await BravelyAccess.fetch(url, { credentials: 'omit', signal: ctl.signal, ...opts }); }
  finally { clearTimeout(t); }
}
function abs(u, base) {
  try { const x = new URL(String(u).replace(/&amp;/g, '&').trim(), base); return x.protocol === 'https:' ? x.href : null; } catch (_) { return null; }
}

// ---- fingerprints (dHash 9x8) ----
async function fingerprint(blob) {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(9, 8);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, 9, 8);
  const d = g.getImageData(0, 0, 9, 8).data;
  const gray = i => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const bits = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(gray((y * 9 + x) * 4) > gray((y * 9 + x + 1) * 4) ? 1 : 0);
  const out = { bits, w: bmp.width, h: bmp.height };
  bmp.close && bmp.close();
  return out;
}
const hamming = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

// ---- candidate collection ----
function metaImages(html, base) {
  const out = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (name && /^(og:image(:secure_url|:url)?|twitter:image(:src)?)$/i.test(name)) {
      const c = (tag.match(/content\s*=\s*["']([^"']+)["']/i) || [])[1];
      const u = c && abs(c, base); if (u) out.push(u);
    }
  }
  for (const tag of html.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/gi) || []) {
    const h = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1]; const u = h && abs(h, base); if (u) out.push(u);
  }
  return out;
}
function bodyImages(html, base) {
  const out = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const ss = (tag.match(/(?:data-)?srcset\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (ss) {
      let best = null, bw = -1;
      for (const part of ss.split(',')) { const [u, w] = part.trim().split(/\s+/); const n = parseFloat(w) || 0; if (u && n >= bw) { best = u; bw = n; } }
      const u = best && abs(best, base); if (u) out.push(u);
    }
    const s = (tag.match(/(?:data-(?:src|original|full|large[-\w]*)|src)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const u = s && abs(s, base); if (u) out.push(u);
  }
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+\.(?:jpe?g|png|webp|gif)(?:\?[^"']*)?)["']/gi)) { const u = abs(m[1], base); if (u) out.push(u); }
  for (const m of html.matchAll(/"(?:image|contentUrl|thumbnailUrl|url)"\s*:\s*"(https:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/gi)) { const u = abs(m[1].replace(/\\\//g, '/'), base); if (u) out.push(u); }
  return out;
}

// ---- site-specific resolvers ----
async function redditCandidates(page) {
  const out = [];
  try {
    const u = new URL(page);
    if (!/(^|\.)reddit\.com$/.test(u.hostname) || !/\/comments\//.test(u.pathname)) return out;
    const jsonUrl = `https://www.reddit.com${u.pathname.replace(/\/+$/, '')}.json?raw_json=1`;
    const res = await get(jsonUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return out;
    const data = (await res.json())?.[0]?.data?.children?.[0]?.data;
    if (!data) return out;
    const push = x => { const v = x && abs(x, 'https://www.reddit.com'); if (v) out.push(v); };
    push(data.url_overridden_by_dest); push(data.url);
    (data.preview?.images || []).forEach(i => push(i.source?.url));
    Object.values(data.media_metadata || {}).forEach(m => { push(m?.s?.u); push(m?.s?.gif); });
  } catch (_) {}
  return out;
}
// Upgrade a URL to a larger variant on sites that serve several sizes. Returns possible larger URLs.
function upgrades(u) {
  const out = [];
  try {
    const x = new URL(u);
    if (/(^|\.)pinimg\.com$/.test(x.hostname) && /\/\d+x\d*\//.test(x.pathname)) out.push(x.href.replace(/\/\d+x\d*\//, '/originals/'));
    if (/\.media\.tumblr\.com$/.test(x.hostname) && /\/s\d+x\d+\//.test(x.pathname)) out.push(x.href.replace(/\/s\d+x\d+\//, '/s2048x3072/'));
    if (/\.media\.tumblr\.com$/.test(x.hostname)) out.push(x.href.replace(/_\d{3,4}(\.\w+)$/, '_1280$1'));
    if (/(^|\.)preview\.redd\.it$/.test(x.hostname)) out.push('https://i.redd.it' + x.pathname);
  } catch (_) {}
  return out.filter(v => v !== u);
}

async function blobOf(url) {
  const res = await get(url, {}, 8000);
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 25e6) return null;
  const type = res.headers.get('content-type') || '';
  if (type && !/^image\//i.test(type)) return null;
  return res.blob();
}

async function findFull(page, hint, thumb) {
  const t0 = Date.now();
  const left = () => DEADLINE_MS - (Date.now() - t0);
  // Reference fingerprint from the thumbnail.
  let ref = null;
  try { const b = await (await get(thumb)).blob(); ref = await fingerprint(b); } catch (_) {}

  // Candidates: hint from Google's card, site APIs, page metadata/body.
  const cands = [];
  const add = u => { if (u && !cands.includes(u)) cands.push(u); };
  add(hint && abs(hint, page));
  (await redditCandidates(page)).forEach(add);
  if (/^https:/.test(page) && left() > 0) {
    try {
      const res = await get(page, {}, 7000);
      if (res.ok && /html/i.test(res.headers.get('content-type') || '')) {
        const html = (await res.text()).slice(0, 600000);
        metaImages(html, res.url).forEach(add);
        bodyImages(html, res.url).forEach(add);
      }
    } catch (_) {}
  }
  // Add larger variants for known multi-size hosts.
  [...cands].forEach(u => upgrades(u).forEach(add));
  const list = cands.slice(0, MAX_CANDIDATES);
  if (!list.length) return null;

  // Without a reference we can only trust the page's own share image.
  if (!ref) return list.find(u => /og|twitter/.test(u)) ? list[0] : list[0];

  const scored = [];
  let idx = 0;
  async function worker() {
    while (idx < list.length && left() > 0) {
      const u = list[idx++];
      try {
        const b = await blobOf(u);
        if (!b) continue;
        const fp = await fingerprint(b);
        if (fp.w * fp.h < 90 * 90) continue;
        const ratio = Math.abs(fp.w / fp.h - ref.w / ref.h) / (ref.w / ref.h);
        if (ratio > 0.2) continue; // different shape: another image
        scored.push({ u, d: hamming(ref.bits, fp.bits), px: fp.w * fp.h });
      } catch (_) {}
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  const ok = scored.filter(s => s.d <= MATCH_MAX_DISTANCE && s.px >= ref.w * ref.h * 1.2);
  if (!ok.length) return null;
  // Closest match first; among near-ties prefer the largest.
  ok.sort((a, b) => (a.d - b.d) || (b.px - a.px));
  const bestD = ok[0].d;
  return ok.filter(s => s.d <= bestD + 2).sort((a, b) => b.px - a.px)[0].u;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'openFull' || !sender.tab) return;
  const thumb = /^https:/.test(msg.thumb || '') ? msg.thumb : null;
  chrome.tabs.create({ url: thumb || 'about:blank', index: sender.tab.index + 1, openerTabId: sender.tab.id, active: true }, async tab => {
    let full = null;
    try { full = await findFull(msg.page, msg.hint, msg.thumb); } catch (_) {}
    if (full && full !== thumb && tab && tab.id != null) chrome.tabs.update(tab.id, { url: full }).catch(() => {});
  });
});

// Pinterest red strip: open the thumbnail now, then switch to the largest pinimg size that exists.
chrome.runtime.onMessage.addListener(msg => {
  if (!msg || msg.type !== 'openPinFull' || !Array.isArray(msg.candidates)) return;
  const ok = u => /^https:\/\/i\.pinimg\.com\//.test(u);
  const list = msg.candidates.filter(ok);
  const first = ok(msg.thumb || '') ? msg.thumb : list[list.length - 1];
  chrome.tabs.create({ url: first, active: true }, async tab => {
    for (const u of list) {
      try {
        const res = await get(u, {}, 6000);
        const good = res.ok && /^image\//i.test(res.headers.get('content-type') || '');
        try { res.body && res.body.cancel(); } catch (_) {}
        if (good) { if (u !== first && tab && tab.id != null) chrome.tabs.update(tab.id, { url: u }).catch(() => {}); return; }
      } catch (_) {}
    }
  });
});

// DeviantArt red strip: open the picture now, then switch to the largest size DeviantArt's image server
// allows for it (the limit is written in the picture's own token; deviantart-images.js builds the list).
// DeviantArt's Download button, which it limits to a few downloads a week, is never used.
chrome.runtime.onMessage.addListener(msg => {
  if (!msg || msg.type !== 'openDaFull' || !Array.isArray(msg.candidates)) return;
  const ok = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)(wixmp\.com|deviantart\.net)$/.test(x.hostname); } catch (_) { return false; } };
  const list = msg.candidates.filter(ok);
  const first = ok(msg.thumb || '') ? msg.thumb : list[list.length - 1];
  if (!first) return;
  chrome.tabs.create({ url: first, active: true }, async tab => {
    for (const u of list) {
      try {
        const res = await get(u, {}, 8000);
        const good = res.ok && /^image\//i.test(res.headers.get('content-type') || '');
        try { res.body && res.body.cancel(); } catch (_) {}
        if (good) { if (u !== first && tab && tab.id != null) chrome.tabs.update(tab.id, { url: u }).catch(() => {}); return; }
      } catch (_) {}
    }
  });
});

// Lens upload: Google Lens can't download images from some sites (Pinterest's i.pinimg.com gives
// "No image at the URL"), so every lens.google.com/uploadbyurl?url=... link - from Pinfull,
// the Pinterest strips and the wall - goes to submit.html, which downloads the image and uploads it.
// Links of the form uploadbyurl?lw=1&url=... are left alone (submit.html's fallback).
// pixiv (rule 2): pixiv's image server (i.pximg.net) only answers requests that say they come from pixiv
// (the Referer header). Pictures the extension downloads itself (the Lens upload) and pictures opened in a
// tab of their own get that header, so they load instead of showing "403 Forbidden".
async function routeLensUploads() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2],
      addRules: [{
        id: 1,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: chrome.runtime.getURL('submit.html') + '?\\1' } },
        condition: { regexFilter: '^https://lens\\.google\\.com/uploadbyurl\\?(url=.*)$', resourceTypes: ['main_frame'] }
      }, {
        id: 2,
        priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://www.pixiv.net/' }] },
        condition: { requestDomains: ['i.pximg.net'], resourceTypes: ['main_frame', 'xmlhttprequest', 'other'] }
      }]
    });
  } catch (e) { console.warn('[Bravely] Lens upload route not set:', e); }
}
chrome.runtime.onInstalled.addListener(async () => {
  try { await BravelyAccess.resetUnselected(); } catch (e) { console.warn('[Bravely] Access reset:', e); }
  await routeLensUploads();
});
chrome.runtime.onStartup.addListener(routeLensUploads);
routeLensUploads();
