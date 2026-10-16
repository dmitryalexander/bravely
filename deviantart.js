/* DeviantArt strips (Bravely 0.11): red strip (top 10%) = the full-size picture in a new tab,
   blue strip (next 10%) = that picture in Google Lens, or the artist's gallery (see the options page).
   One floating overlay follows the hovered picture, like on Pinterest. Works with the look on or off.
   The full size is the largest DeviantArt's image server allows for the picture; the Download button
   (limited to a few downloads a week) is never used.
   Ctrl+Shift+Z: "More like this" for the picture under the mouse, or for the open art page.
   On a "More like this" page it goes back. */
(() => {
  'use strict';
  const IMG = self.pwDaImages;
  if (!IMG) return;
  const MIN_W = 120, MIN_H = 80;
  let mouse = { x: -1, y: -1 }, cur = null, raf = 0, blue = 'lens';

  const ov = document.createElement('div');
  ov.className = 'pw-ov'; ov.hidden = true;
  const full = document.createElement('a');
  full.className = 'pw-full'; full.target = '_blank'; full.rel = 'noopener noreferrer';
  full.setAttribute('aria-label', 'Open the full-size picture in a new tab');
  const lens = document.createElement('a');
  lens.className = 'pw-lens'; lens.rel = 'noopener noreferrer';
  ov.append(full, lens);
  function setBlue(v) {
    blue = v === 'artist' ? 'artist' : 'lens';
    lens.target = blue === 'artist' ? '_self' : '_blank';
    lens.setAttribute('aria-label', blue === 'artist' ? "Open the artist's gallery" : 'Search this picture with Google Lens (opens a new tab)');
  }
  setBlue('lens');
  try {
    chrome.storage.sync.get({ daBlue: 'lens' }, s => setBlue(s.daBlue));
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && changes.daBlue) setBlue(changes.daBlue.newValue); });
  } catch (_) {}
  const mount = () => { if (!ov.isConnected) (document.body || document.documentElement).appendChild(ov); };

  const artistOf = path => (path.match(/^\/([^/]+)\/art\//) || [])[1] || '';
  const idOf = path => (path.match(/^\/[^/]+\/art\/(?:[^/]*-)?(\d+)\/?$/) || [])[1] || '';
  const srcOf = img => img.currentSrc || img.src || '';
  // The big picture of an art page (not a thumbnail, not a picture inside the description).
  const isMain = img => img.matches('[property="contentUrl"]') && !!img.closest('main') && !img.closest('[data-testid="thumb"], a[href], figure');

  function pageOf(img) { // the art page a picture belongs to
    const a = img.closest('a[href*="/art/"]');
    try { if (a) return new URL(a.href); } catch (_) {}
    return isMain(img) && idOf(location.pathname) ? new URL(location.href) : null;
  }

  function okImg(img) {
    if (!img || img.tagName !== 'IMG' || !IMG.parts(srcOf(img))) return false;
    if (img.closest('header, nav, [role="navigation"], [role="dialog"], [data-pw-chrome], [data-pw-art-hide]')) return false;
    const r = img.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    return !!img.closest('[data-testid="thumb"]') || isMain(img);
  }
  const inside = (img, x, y) => { const r = img.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  function findImg(x, y) {
    const stack = document.elementsFromPoint(x, y).filter(el => el !== ov && !ov.contains(el));
    // Pictures scrolled under the top row (search box, topics) or under a pop-up get no strips there.
    if (stack[0] && stack[0].closest('header[role="banner"], #pw-topics, [role="dialog"]')) return null;
    for (const el of stack) {
      if (el.tagName === 'IMG' && okImg(el)) return el;
      // DeviantArt's own hover box covers the picture while the look is off: look in the same tile.
      for (let box = el, i = 0; box && i < 4; box = box.parentElement, i++) {
        const imgs = box.querySelectorAll ? box.querySelectorAll('[data-testid="thumb"] img') : [];
        if (imgs.length === 1 && okImg(imgs[0]) && inside(imgs[0], x, y)) return imgs[0];
        if (imgs.length > 1) break;
      }
    }
    return null;
  }

  function blueHref(img) {
    if (blue === 'artist') {
      const page = pageOf(img), who = page && artistOf(page.pathname);
      return who ? 'https://www.deviantart.com/' + who + '/gallery' : null;
    }
    return 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(IMG.forLens(srcOf(img)));
  }

  function place() {
    raf = 0;
    mount();
    const over = ov.matches(':hover');
    let img = cur && cur.isConnected && okImg(cur) ? cur : null;
    if (!over || !img) img = findImg(mouse.x, mouse.y);
    if (img && (over || inside(img, mouse.x, mouse.y))) {
      const r = img.getBoundingClientRect();
      // The strips sit at the top of the part that can be seen, never over the top row.
      const bar = document.querySelector('header[role="banner"]');
      const top = Math.max(r.top, bar ? bar.getBoundingClientRect().bottom : 0);
      if (r.bottom - top >= 40) {
        cur = img;
        Object.assign(ov.style, { left: r.left + 'px', top: top + 'px', width: r.width + 'px', height: (r.bottom - top) + 'px' });
        full.href = IMG.full(srcOf(img))[0];
        const href = blueHref(img);
        if (href) lens.href = href; else lens.removeAttribute('href');
        ov.hidden = false;
        return;
      }
    }
    cur = null; ov.hidden = true;
  }
  const sched = () => { if (!raf) raf = requestAnimationFrame(place); };
  document.addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; sched(); }, { passive: true });
  window.addEventListener('scroll', sched, { passive: true, capture: true });
  window.addEventListener('resize', sched, { passive: true });
  window.addEventListener('popstate', sched);
  new MutationObserver(sched).observe(document.documentElement, { childList: true, subtree: true });

  full.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if (!cur || !okImg(cur)) return;
    const list = IMG.full(srcOf(cur));
    try { chrome.runtime.sendMessage({ type: 'openDaFull', candidates: list, thumb: srcOf(cur) }); }
    catch (_) { window.open(list[0], '_blank', 'noopener'); }
  });
  lens.addEventListener('click', e => {
    e.stopPropagation();
    const href = cur && okImg(cur) && blueHref(cur);
    if (href) lens.href = href; else e.preventDefault();
  });
  // keep DeviantArt from reacting to presses on our strips
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick']) ov.addEventListener(t, e => e.stopPropagation());

  let toastTimer = 0;
  function notice(message) {
    let box = document.getElementById('pw-search-notice');
    if (!box) {
      box = document.createElement('div'); box.id = 'pw-search-notice';
      box.setAttribute('role', 'status'); (document.body || document.documentElement).appendChild(box);
    }
    box.textContent = message; box.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
  }
  const typing = e => e.composedPath().some(el => el.isContentEditable || el.matches?.('input, textarea, select, [role="textbox"]'));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyZ')) return;
    if (typing(e) || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    if (/^\/morelikethis\//.test(location.pathname)) {
      if (history.length > 1) history.back(); else notice('Nothing to go back to');
      return;
    }
    const img = findImg(mouse.x, mouse.y);
    const page = (img && pageOf(img)) || (idOf(location.pathname) ? new URL(location.href) : null);
    const who = page && artistOf(page.pathname), id = page && idOf(page.pathname);
    if (!who || !id) { notice('Hover over a picture first'); return; }
    location.assign('https://www.deviantart.com/morelikethis/' + who + '/' + id);
  }, true);
})();
