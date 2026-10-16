/* DeviantArt picture addresses, shared by deviantart-look.js and deviantart.js (Bravely 0.11).
   DeviantArt's image server sends every picture as
     /f/<folder>/<file>/v1/<fill|fit|crop>/w_<width>,h_<height>,q_<quality>,strp/<name>?token=...
   The token says how large DeviantArt allows that picture to be (for example width <= 1024).
   The extension only asks for sizes inside those limits, so it never uses the Download button
   (which DeviantArt now limits to a few downloads a week). */
self.pwDaImages = (() => {
  'use strict';
  const HOST = /(^|\.)(wixmp\.com|deviantart\.net)$/;

  // The parts of a picture address, or null if it is not one of DeviantArt's resizable pictures.
  function parts(src) {
    try {
      const u = new URL(src, location.href);
      if (u.protocol !== 'https:' || !HOST.test(u.hostname) || /^a\./.test(u.hostname)) return null; // a. = avatars
      const m = u.pathname.match(/^(\/f\/[^/]+\/[^/]+?)(?:\/v1\/(fill|fit|crop)\/([^/]+)\/([^/]+))?\/?$/);
      return m ? { u, base: m[1], op: m[2] || '', params: m[3] || '', name: m[4] || '' } : null;
    } catch (_) { return null; }
  }

  // Largest width and height the token allows. open = no limits (the original file can be shown).
  function limits(src) {
    try {
      const token = new URL(src, location.href).searchParams.get('token');
      if (!token) return { w: 0, h: 0, open: true };
      const data = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const o = (data.obj && data.obj[0] && data.obj[0][0]) || {};
      const num = v => +((/\d+/.exec(v || '') || [0])[0]);
      const w = num(o.width), h = num(o.height);
      return { w, h, open: !w && !h };
    } catch (_) { return { w: 0, h: 0, open: false }; }
  }

  function build(p, op, params) {
    const name = p.name || (p.base.split('/').pop().replace(/\.\w+$/, '') + '.jpg');
    return p.u.origin + p.base + '/v1/' + op + '/' + params + '/' + name + p.u.search;
  }

  // The same picture at another size, never above the token's limits.
  // fill: exactly w x h (cropped like DeviantArt's own thumbnails). fit: the whole picture inside w x h.
  function resized(src, op, w, h, q) {
    const p = parts(src);
    if (!p || !p.op) return null;
    const lim = limits(src);
    let W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    if (op === 'fill') {
      const k = Math.min(1, lim.w ? lim.w / W : 1, lim.h ? lim.h / H : 1);
      W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
    } else {
      if (lim.w) W = Math.min(W, lim.w);
      if (lim.h) H = Math.min(H, lim.h);
    }
    return build(p, op, 'w_' + W + ',h_' + H + ',q_' + (q || 80) + ',strp');
  }

  // Red strip: the largest versions to try, best first (the original file only when it is open).
  function full(src) {
    const p = parts(src);
    if (!p) return [src];
    const lim = limits(src), out = [];
    if (lim.open || !p.op) out.push(p.u.origin + p.base + p.u.search);
    if (p.op && lim.w && lim.h) {
      out.push(build(p, 'fit', 'w_' + lim.w + ',h_' + lim.h + ',q_100,strp'));
      out.push(build(p, 'fit', 'w_' + lim.w + ',h_' + lim.h + ',q_90,strp'));
    }
    out.push(p.u.href);
    return [...new Set(out)];
  }

  // Blue strip: a large version that is quick to send to Google Lens.
  function forLens(src) {
    const p = parts(src);
    if (!p || !p.op) return p ? p.u.href : src;
    return resized(src, 'fit', 1600, 1600, 90);
  }

  return { parts, limits, resized, full, forLens };
})();
