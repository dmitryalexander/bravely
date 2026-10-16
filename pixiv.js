/* pixiv strips (Bravely 0.12): red strip (top 10%) = the full-size picture (pixiv's original file) in a new
   tab, blue strip (next 10%) = that picture in Google Lens, or the artist's works (see the options page).
   One floating overlay follows the hovered picture, like on Pinterest and DeviantArt. Works with the look
   on or off. The original's address comes from pixiv itself (/ajax/illust/<id>/pages, with your login, so it
   also works for works only signed-in users can see); it is looked up when the mouse reaches the red strip.
   The tab opens from the pixiv page, like pixiv's own "open the original" link, so pixiv's image server
   accepts it. If pixiv doesn't name an original, the tab shows pixiv's 1200px picture.
   Ctrl+Shift+Z: works like this one - the hovered picture's page, scrolled to its "Related works"; on an
   artwork page without a hovered picture, jumps between the picture and its "Related works". */
(() => {
  'use strict';
  const IMG = self.pwPxImages;
  if (!IMG) return;
  const MIN_W = 120, MIN_H = 80;
  let mouse = { x: -1, y: -1 }, cur = null, raf = 0, blue = 'lens';

  const ov = document.createElement('div');
  ov.className = 'pw-ov'; ov.hidden = true;
  const full = document.createElement('a');
  full.className = 'pw-full'; full.target = '_blank'; full.rel = 'noopener'; // keeps the Referer pixiv's image server asks for
  full.setAttribute('aria-label', 'Open the full-size picture in a new tab');
  const lens = document.createElement('a');
  lens.className = 'pw-lens'; lens.rel = 'noopener noreferrer';
  ov.append(full, lens);
  function setBlue(v) {
    blue = v === 'artist' ? 'artist' : 'lens';
    lens.target = blue === 'artist' ? '_self' : '_blank';
    lens.setAttribute('aria-label', blue === 'artist' ? "Open the artist's works" : 'Search this picture with Google Lens (opens a new tab)');
  }
  setBlue('lens');
  try {
    chrome.storage.sync.get({ pxBlue: 'lens' }, s => setBlue(s.pxBlue));
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && changes.pxBlue) setBlue(changes.pxBlue.newValue); });
  } catch (_) {}
  const mount = () => { if (!ov.isConnected) (document.body || document.documentElement).appendChild(ov); };

  const lang = () => (/^\/[a-z]{2}\//.test(location.pathname) ? location.pathname.slice(0, 3) : '');
  const workOf = a => ((a && a.getAttribute('href') || '').match(/\/artworks\/(\d+)/) || [])[1] || '';
  const pageWork = () => (location.pathname.match(/^\/(?:[a-z]{2}\/)?artworks\/(\d+)/) || [])[1] || '';
  const srcOf = img => img.currentSrc || img.src || '';
  // The big picture of an artwork page (not a thumbnail).
  const isMain = img => !!img.closest('main figure') && !img.closest('a[href*="/artworks/"]');

  function okImg(img) {
    if (!img || img.tagName !== 'IMG' || !IMG.parts(srcOf(img))) return false;
    if (img.closest('[role="dialog"], [data-pw-chrome], [data-pw-hide], [data-pw-off], [data-pw-head-box], #pw-topics')) return false;
    const r = img.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    return !!img.closest('a[href*="/artworks/"]') || isMain(img);
  }
  const inside = (img, x, y) => { const r = img.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const topBar = () => document.querySelector('[data-pw-head-box]');
  function findImg(x, y) {
    const stack = document.elementsFromPoint(x, y).filter(el => el !== ov && !ov.contains(el));
    // Pictures scrolled under the top row (search box, tags) or under a pop-up get no strips there.
    if (stack[0] && stack[0].closest('[data-pw-head-box], #pw-topics, [role="dialog"]')) return null;
    for (const el of stack) {
      if (el.tagName === 'IMG' && okImg(el)) return el;
      // pixiv's own hover layer covers the picture while the look is off: look in the same thumbnail.
      for (let box = el, i = 0; box && i < 4; box = box.parentElement, i++) {
        const imgs = box.querySelectorAll ? box.querySelectorAll('a[href*="/artworks/"] img') : [];
        if (imgs.length === 1 && okImg(imgs[0]) && inside(imgs[0], x, y)) return imgs[0];
        if (imgs.length > 1) break;
      }
    }
    return null;
  }

  // Which work and which of its pictures an image shows.
  function whichOf(img) {
    const p = IMG.parts(srcOf(img));
    const id = workOf(img.closest('a[href*="/artworks/"]')) || (p && p.id) || pageWork();
    return { id, page: p && p.page != null ? p.page : 0, p };
  }

  // The original files of a work, from pixiv (cached; looked up once per work).
  const originals = new Map();
  function lookup(id) {
    if (!id) return Promise.resolve(null);
    let job = originals.get(id);
    if (!job) {
      job = fetch('/ajax/illust/' + id + '/pages?lang=en', { credentials: 'include', headers: { Accept: 'application/json' } })
        .then(r => (r.ok ? r.json() : null))
        .then(d => (d && !d.error && Array.isArray(d.body) ? d.body.map(pg => (pg && pg.urls && pg.urls.original) || '') : null))
        .catch(() => null);
      job.then(list => { if (!list) originals.delete(id); }); // try again next time
      originals.set(id, job);
    }
    return job;
  }
  const known = new Map(); // id -> list of original addresses, once looked up
  function fullOf(img) {
    const w = whichOf(img);
    const list = known.get(w.id);
    return (list && list[w.page]) || IMG.master(srcOf(img)) || srcOf(img);
  }
  // The artist: from the thumbnail's own links, or the artwork page's.
  function artistOf(img) {
    const tile = img.closest('[data-pw-tile], li, [data-ga4-label="thumbnail"]');
    const a = (tile && tile.querySelector('a[href*="/users/"]')) || (isMain(img) && document.querySelector('main a[href*="/users/"], aside a[href*="/users/"]'));
    const m = a && a.getAttribute('href').match(/\/users\/(\d+)/);
    const gtm = img.closest('[data-gtm-user-id]');
    return (m && m[1]) || (gtm && gtm.getAttribute('data-gtm-user-id')) || '';
  }
  function blueHref(img) {
    if (blue === 'artist') {
      const who = artistOf(img);
      return who ? location.origin + lang() + '/users/' + who + '/artworks' : null;
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
      const bar = topBar();
      const top = Math.max(r.top, bar ? bar.getBoundingClientRect().bottom : 0);
      if (r.bottom - top >= 40) {
        cur = img;
        Object.assign(ov.style, { left: r.left + 'px', top: top + 'px', width: r.width + 'px', height: (r.bottom - top) + 'px' });
        full.href = fullOf(img);
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

  // Red strip: the original file in a new tab (pixiv's 1200px picture if the original can't be found).
  // Its address is asked for as soon as the mouse reaches the strip, so it is usually known by the click.
  function prefetch() {
    const img = cur;
    if (!img) return;
    const w = whichOf(img);
    if (known.has(w.id)) return;
    lookup(w.id).then(list => { if (list) { known.set(w.id, list); if (cur === img) full.href = fullOf(img); } });
  }
  full.addEventListener('mouseenter', prefetch);
  full.addEventListener('focus', prefetch);
  full.addEventListener('click', e => {
    e.stopPropagation();
    if (!cur || !okImg(cur)) { e.preventDefault(); return; }
    const img = cur, w = whichOf(img);
    if (known.has(w.id)) { full.href = fullOf(img); return; } // the link opens it, as pixiv's own link would
    e.preventDefault();
    const fallback = IMG.master(srcOf(img)) || srcOf(img);
    let opened = false;
    const open = url => { if (!opened) { opened = true; window.open(url, '_blank', 'noopener'); } };
    const late = setTimeout(() => open(fallback), 2500); // pixiv didn't answer: the 1200px picture
    lookup(w.id).then(found => {
      clearTimeout(late);
      if (found) known.set(w.id, found);
      open((found && found[w.page]) || fallback);
    });
  });
  lens.addEventListener('click', e => {
    e.stopPropagation();
    const href = cur && okImg(cur) && blueHref(cur);
    if (href) lens.href = href; else e.preventDefault();
  });
  // keep pixiv from reacting to presses on our strips
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick']) ov.addEventListener(t, e => e.stopPropagation());

  /* ---------- Ctrl+Shift+Z: works like this one ---------- */
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
  const related = () => document.querySelector('.gtm-illust-recommend-zone');
  // On the artwork page: wait for pixiv to draw "Related works", then scroll there.
  function toRelated() {
    let tries = 0;
    const go = () => {
      const zone = related();
      if (zone) { zone.scrollIntoView({ block: 'start' }); scrollBy(0, -80); return; }
      if (++tries < 40) setTimeout(go, 250);
    };
    go();
  }
  if (location.hash === '#pw-related' && pageWork()) {
    history.replaceState(history.state, '', location.pathname + location.search);
    toRelated();
  }
  const typing = e => e.composedPath().some(el => el.isContentEditable || el.matches?.('input, textarea, select, [role="textbox"]'));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyZ')) return;
    if (typing(e) || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    const img = findImg(mouse.x, mouse.y);
    const id = img ? whichOf(img).id : '';
    if (id && id !== pageWork()) { location.assign(location.origin + lang() + '/artworks/' + id + '#pw-related'); return; }
    if (pageWork()) {
      const zone = related();
      if (zone && zone.getBoundingClientRect().top < innerHeight / 2) scrollTo({ top: 0 });
      else toRelated();
      return;
    }
    notice('Hover over a picture first');
  }, true);
})();
