/* Pin pages in the Bravely look (Bravely 0.10.2): no panel next to the pin (likes, Save, comments).
   pinterest-look.css hides the panel while <html> has data-pw-solo, which this script sets.
   Pinterest's wall would still keep the panel's columns empty, so this script also tells the wall
   that the pin only needs the columns its image fills; the related pins then move up into that space.
   It runs inside the page itself (manifest "world": "MAIN"), because Pinterest's wall can only be
   reached from there. If Pinterest changes its wall, the panel still goes away but its space may stay empty.
   Ctrl+Shift+X (the Bravely look switch) brings the panel back together with the rest of Pinterest. */
(() => {
  'use strict';
  const root = document.documentElement;
  const CLOSEUP = '[data-test-id="CloseupMainPin"], [data-test-id="closeup-body-style"]';
  const AUTH_MEDIA = '[data-test-id="closeup-media-container"]';
  const MEDIA = '[data-test-id="pin-closeup-image"], [data-test-id="closeup-container"], ' + AUTH_MEDIA;
  const RATIO = '[style*="aspect-ratio"]';
  const MARK = 'data-pw-solo', WIDTH = '--pw-solo-w';
  let mediaWidths = new WeakMap();

  let want = null;     // { key, span }: the pin on screen and how many columns it should get
  let guess = 0;       // the last pin's count, used for the next pin until it has been measured
  let applied = null;  // { wall, key, span, h }: what was last handed to Pinterest's wall
  let lastSig = '', pending = false, retryTimer = 0, retries = 0, retryKey = '';

  const on = () => root.classList.contains('pw-pinless');
  const isCloseup = it => !!it && typeof it === 'object' && it.type === 'closeup_module';

  /* ---- Pinterest's wall (Gestalt Masonry) ----
     The wall asks getColumnSpanConfig(item) how many columns each item needs. For the pin
     closeup we answer with our own count while the look is on; everything else is unchanged. */
  function prepare(wall) {
    const p = wall.props, items = p && p.items;
    if (!items || !(isCloseup(items[0]) || isCloseup(items[1]))) return;
    const f = p.getColumnSpanConfig;
    if (typeof f !== 'function' || f.pwSolo) return;
    const g = function (item) {
      if (isCloseup(item) && on()) {
        const span = want && want.key === location.pathname ? want.span : guess;
        if (span) return span;
      }
      return f.apply(this, arguments);
    };
    g.pwSolo = true;
    g.pwOrig = f;
    p.getColumnSpanConfig = g;
  }
  // Runs our answer before every layout of every wall (only pin pages are affected, see prepare).
  function hook(wall) {
    const proto = Object.getPrototypeOf(wall);
    if (!proto || typeof proto.render !== 'function' || proto.render.pwSolo) return;
    const render = proto.render;
    const wrapped = function () {
      try { prepare(this); } catch (_) {}
      return render.apply(this, arguments);
    };
    wrapped.pwSolo = true;
    proto.render = wrapped;
  }
  function wallOf(el) {
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    for (let f = key ? el[key] : null, i = 0; f && i < 60; f = f.return, i++) {
      const s = f.stateNode;
      if (s && typeof s.forceUpdate === 'function' && typeof s.reflow === 'function' &&
          s.props && Array.isArray(s.props.items)) return s;
    }
    return null;
  }
  // Pinterest's own column count for the pin + panel (by window width, never more than all columns).
  function pinterestSpan(wall, count) {
    const p = wall.props, g = p.getColumnSpanConfig, f = g && (g.pwOrig || g);
    const item = p.items.find(isCloseup);
    if (typeof f !== 'function' || !item) return 0;
    const cfg = f(item);
    const bp = count <= 2 ? 'sm' : count <= 4 ? 'md' : count <= 6 ? 'lg1' : count <= 8 ? 'lg' : 'xl';
    const n = typeof cfg === 'number' ? cfg : cfg && (cfg[bp] ?? (bp === 'lg1' ? cfg.lg : undefined));
    return Math.min(Math.max(1, Math.round(Number(n) || 1)), count);
  }

  /* ---- Measurements ---- */
  function grid(item) {
    const list = item.parentElement;
    let colW = Infinity;
    const lefts = [];
    for (const el of list.children) {
      if (el === item || !el.hasAttribute('data-grid-item')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40) continue;
      if (r.width < colW) colW = r.width;
      lefts.push(r.left);
    }
    if (lefts.length < 2) return null;
    lefts.sort((a, b) => a - b);
    let pitch = Infinity; // distance from one column to the next
    for (let i = 1; i < lefts.length; i++) {
      const d = lefts[i] - lefts[i - 1];
      if (d > colW / 2 && d < pitch) pitch = d;
    }
    if (!isFinite(pitch) || pitch < colW) return null;
    const gutter = pitch - colW;
    const count = Math.max(1, Math.floor((list.getBoundingClientRect().width + gutter) / pitch + 0.01));
    return { pitch, gutter, count };
  }
  function ratioText(cm) {
    const box = cm.querySelector(MEDIA);
    const r = box && (box.closest(RATIO) || box.querySelector(RATIO));
    return r && cm.contains(r) ? r.getAttribute('style') || '' : '';
  }
  // Width / height of the pin's image (or video).
  function aspect(cm) {
    const m = /aspect-ratio:\s*([\d.]+)\s*(?:\/\s*([\d.]+))?/.exec(ratioText(cm));
    if (m) {
      const r = parseFloat(m[1]) / (m[2] ? parseFloat(m[2]) : 1);
      if (r > 0.05 && r < 20) return r;
    }
    const v = cm.querySelector('video');
    if (v && v.videoWidth && v.videoHeight) return v.videoWidth / v.videoHeight;
    const img = cm.querySelector('[data-test-id="pin-closeup-image"] img');
    if (img && img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight;
    return 0;
  }

  /* ---- Main ---- */
  function forget() { want = null; applied = null; lastSig = ''; }
  function clear() { // back to Pinterest's own pin layout
    if (root.hasAttribute(MARK)) root.removeAttribute(MARK);
    if (root.style.getPropertyValue(WIDTH)) root.style.removeProperty(WIDTH);
    forget(); guess = 0;
    mediaWidths = new WeakMap();
  }
  function later() { // the page is still starting: look again shortly
    if (retryKey !== location.pathname) { retryKey = location.pathname; retries = 0; }
    if (retryTimer || retries >= 40) return;
    retryTimer = setTimeout(() => { retryTimer = 0; retries++; schedule(); }, 300);
  }
  function update() {
    if (!on()) { clear(); return; }
    // No pin on screen (other pages, or between two pins): nothing to do, keep the setting for the next pin.
    const cm = /^\/pin\//.test(location.pathname) ? document.querySelector(CLOSEUP) : null;
    if (!cm) { clear(); return; }
    const item = cm.closest('[data-grid-item]');
    if (!item || !item.parentElement) { clear(); return; } // a pin outside the wall: leave it as Pinterest made it
    // Measure before hiding the details: signed-in Pinterest caps the media column itself.
    const media = cm.querySelector(AUTH_MEDIA);
    if (media && !mediaWidths.has(media)) {
      const width = media.getBoundingClientRect().width;
      if (width > 0) mediaWidths.set(media, width);
    }
    // Keep the original width: our own CSS subsequently expands the media to fill the
    // chosen columns, which must not become the input to the next column calculation.
    const mediaWidth = media ? mediaWidths.get(media) || 0 : 0;
    const sig = [location.pathname, item.style.width, item.parentElement.style.width,
      innerWidth, innerHeight, mediaWidth, cm.getBoundingClientRect().height, ratioText(cm)].join('|');
    if (sig === lastSig && root.hasAttribute(MARK)) return;

    // Hide the panel right away. Until the wall can be told the new size, the pin keeps the
    // width Pinterest gave its image (half of its space, see pinterest-look.css).
    if (!root.hasAttribute(MARK)) root.setAttribute(MARK, '');
    const g = grid(item);
    if (!g) { later(); return; }
    const wall = wallOf(item);
    if (!wall) { // Pinterest has not finished starting the page (or its wall works differently)
      later();
      if (retries >= 40) lastSig = sig; // stop looking until something changes
      return;
    }
    const box = item.getBoundingClientRect();
    const full = pinterestSpan(wall, g.count) || Math.max(1, Math.round((box.width + g.gutter) / g.pitch));
    const inner = item.firstElementChild;
    const extra = inner ? Math.max(0, inner.getBoundingClientRect().width - box.width) : 0;
    // Columns the image can fill while still fitting on the screen; at least 2, at most Pinterest's own.
    let span = full;
    if (media) {
      if (mediaWidth <= 0) { later(); return; }
      // Exclude our tile overhang; tolerate subpixel rounding to avoid gaining a column
      // on every remeasurement after the card has already been resized.
      span = Math.max(1, Math.min(full, Math.ceil((mediaWidth - extra + g.gutter) / g.pitch - 0.02)));
    } else if (full > 2) {
      const r = aspect(cm);
      const room = innerHeight - Math.max(0, box.top + scrollY) - 8;
      const fit = r ? Math.floor((room * r + g.gutter) / g.pitch) : Math.round(full / 2);
      span = Math.max(2, Math.min(full, fit));
    }
    // The tight wall widens every tile a little; the pin gets the same extra width.
    root.style.setProperty(WIDTH, (span * g.pitch - g.gutter + extra).toFixed(1) + 'px');
    want = { key: location.pathname, span };
    guess = span;
    hook(wall);
    // The pin's new height, measured the way the wall measures its tiles.
    const h = inner ? inner.getBoundingClientRect().height : 0;
    if (!applied || applied.wall !== wall || applied.key !== want.key || applied.span !== span ||
        Math.abs(applied.h - h) > 1) {
      applied = { wall, key: want.key, span, h };
      try {
        prepare(wall);
        const obj = wall.props.items.find(isCloseup);
        const sizes = wall.state && wall.state.measurementStore;
        if (obj && h > 0 && sizes && typeof sizes.set === 'function') sizes.set(obj, h);
        const places = wall.positionStore;
        if (places && typeof places.reset === 'function') { places.reset(); wall.forceUpdate(); }
        else wall.reflow();
      } catch (_) {}
    }
    lastSig = sig;
  }
  function check() {
    pending = false;
    try { update(); } catch (_) {} // never disturb Pinterest itself
  }
  // Runs right after Pinterest changes the page (before it is drawn), also in background tabs.
  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(check);
  }

  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['class'] });
  // Images and videos can establish their dimensions after the initial page layout.
  document.addEventListener('load', schedule, true);
  document.addEventListener('loadedmetadata', schedule, true);
  // After a window resize Pinterest rearranges its wall a moment later; look again then.
  addEventListener('resize', () => { schedule(); setTimeout(schedule, 450); setTimeout(schedule, 900); }, { passive: true });
  schedule();
})();
