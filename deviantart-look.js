/* Bravely look for DeviantArt (Bravely 0.11): dark page, pictures in a brick wall with 4px gaps and
   nothing on them, and art pages with only the picture; the artist's other pictures and
   "More like this" become a wall under it. One top row: the search box, then the topic chips;
   no toolbar down the left side, and (0.12) no heading bar ("Home") under the top row.
   The styles are in deviantart-look.css and apply while <html> has the "pw-da" class.
   Ctrl+Shift+X switches the look off/on (the page reloads). The options page has the same switch.
   DeviantArt still loads, links and scrolls everything itself. This file only marks DeviantArt's own
   elements and tells each picture where to sit. A wall it can't recognise keeps DeviantArt's rows. */
(() => {
  'use strict';
  const CLS = 'pw-da', CACHE = 'pwDaLook';
  const html = document.documentElement;

  // Set the class before DeviantArt draws anything. localStorage is a fast copy of the saved setting.
  let on = true;
  try { on = localStorage.getItem(CACHE) !== 'off'; } catch (_) {}
  html.classList.toggle(CLS, on);

  const remember = v => { try { localStorage.setItem(CACHE, v ? 'on' : 'off'); } catch (_) {} };
  let reloading = false;
  const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
  try {
    chrome.storage.sync.get({ daLook: true }, s => {
      const v = s.daLook !== false;
      remember(v);
      if (v !== on) reload();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.daLook) return;
      const v = changes.daLook.newValue !== false;
      remember(v);
      if (v !== on) reload();
    });
  } catch (_) {}

  const typing = e => e.composedPath().some(el => el.isContentEditable || el.matches?.('input, textarea, select, [role="textbox"]'));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyX')) return;
    if (e.repeat || typing(e)) return;
    e.preventDefault(); e.stopPropagation();
    remember(!on);
    try { chrome.storage.sync.set({ daLook: !on }, reload); } catch (_) {}
    setTimeout(reload, 500);
  }, true);

  if (!on) return;
  const IMG = self.pwDaImages;

  const flag = (el, name, yes) => {
    if (!el) return;
    if (yes) { if (!el.hasAttribute(name)) el.setAttribute(name, ''); }
    else if (el.hasAttribute(name)) el.removeAttribute(name);
  };
  const setVar = (el, name, value) => { if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); };

  /* ---------- Brick wall: equal columns, each picture placed in the shortest one (like Pinless) ---------- */
  const COLUMN = 260, GAP = 4; // Pinless's column width and gap
  const ROW = '[data-testid="content_row"], [data-testid="grid-row"]';
  const lists = new Map();     // wall -> the pictures it has shown, in order
  const learned = new Map();   // picture link -> its real shape (width / height), once its picture has loaded
  const sizes = new ResizeObserver(() => schedule());
  let timer = 0;
  const schedule = () => { if (!timer) timer = setTimeout(scan, 40); };

  // Big walls (search, galleries, feeds): every row of pictures sits in a <div> inside the wall
  // (sometimes with an empty row next to it). Small walls (art pages): the rows sit side by side in one box.
  function wallOf(row) {
    const p = row.parentElement;
    if (!p) return null;
    if (row.matches('[data-testid="grid-row"]')) return p;
    return p.parentElement || p;
  }
  const inner = row => (row.matches('[data-testid="grid-row"]') && row.children.length === 1 ? row.firstElementChild : row);

  function tilesOf(wall) {
    const out = [];
    for (const row of wall.querySelectorAll(ROW)) {
      if (wallOf(row) !== wall) continue;
      for (let el = row; el && el !== wall; el = el.parentElement) flag(el, 'data-pw-flat', true);
      const box = inner(row);
      flag(box, 'data-pw-flat', true);
      for (const tile of box.children) out.push(tile);
    }
    return out;
  }

  // DeviantArt sizes each picture in its rows, which gives its shape.
  function daShape(tile) {
    for (const el of [tile, ...tile.querySelectorAll('[style*="height"]')]) {
      const w = el.style.width, h = el.style.height;
      if (/px$/.test(w) && /px$/.test(h) && parseFloat(w) > 0 && parseFloat(h) > 0) return parseFloat(w) / parseFloat(h);
    }
    return 1;
  }
  const clampShape = s => Math.min(4, Math.max(0.4, s || 1));

  // Each picture fills its tile; DeviantArt's titles, badges and buttons on the picture are hidden.
  function prepare(tile) {
    flag(tile, 'data-pw-tile', true);
    const img = tile.querySelector('[data-testid="thumb"] img') || tile.querySelector('img');
    const target = img || tile.querySelector('[data-testid="thumb"]');
    if (!target) {
      for (const el of tile.querySelectorAll('[style*="width"]')) flag(el, 'data-pw-fill', true);
      return null;
    }
    const thumb = target.closest('[data-testid="thumb"]');
    for (let el = target; el && el !== tile; el = el.parentElement) {
      flag(el, 'data-pw-fill', true);
      const parent = el.parentElement;
      if (!parent || (thumb && thumb.contains(parent))) continue; // DeviantArt's own picture box stays as it is
      for (const sib of parent.children) if (sib !== el) flag(sib, 'data-pw-chrome', true);
    }
    if (img && !img.pwSeen) {
      img.pwSeen = true;
      img.addEventListener('load', () => learn(img));
    }
    return img;
  }

  // What the wall knows about each tile, worked out once (again only if DeviantArt changes the tile).
  const info = new WeakMap();
  function tileInfo(tile, i) {
    let t = info.get(tile);
    const stale = !t ||
      (t.a ? !tile.contains(t.a) || t.a.href !== t.key : !!tile.querySelector('a[href]')) ||
      (t.img ? !tile.contains(t.img) : !!tile.querySelector('img'));
    if (stale) {
      const a = tile.querySelector('a[href]');
      t = { a, key: a ? a.href : '#' + i, img: prepare(tile), shape: daShape(tile), fresh: true };
      info.set(tile, t);
    }
    return t;
  }

  // Small walls show square crops; the extension asks for the whole picture and learns its shape.
  let learnedVersion = 0;
  function learn(img) {
    if (!img.pwFit || !img.naturalWidth || img.getAttribute('src') !== img.pwWant) return;
    const shape = img.naturalWidth / img.naturalHeight;
    const old = learned.get(img.pwKey);
    if (!old || Math.abs(old - shape) > 0.01) { learned.set(img.pwKey, shape); learnedVersion++; schedule(); }
  }

  // A sharp picture for the tile's size (DeviantArt's own is made for its smaller rows).
  const dpr = () => Math.min(3, window.devicePixelRatio || 1);
  function sharpen(img, key, cell, shape, small) {
    const src = img.getAttribute('src') || '';
    const ours = img.pwWant && src === img.pwWant;
    const base = ours ? img.pwBase : src;
    const p = base && IMG.parts(base);
    if (!p || !p.op) return;
    const W = Math.ceil(cell * dpr());
    if (ours && img.pwW >= W * 0.9) return; // big enough already
    const fit = small || p.op === 'crop'; // small walls only have square crops: ask for the whole picture
    const want = fit ? IMG.resized(base, 'fit', W, W * 4) : IMG.resized(base, 'fill', W, W / shape);
    if (!want || want === src) return;
    Object.assign(img, { pwBase: base, pwWant: want, pwW: W, pwFit: fit, pwKey: key });
    if (fit && img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager'); // know the shapes before scrolling there
    if (img.hasAttribute('srcset')) img.setAttribute('srcset', want);
    img.setAttribute('src', want);
  }

  // A wall may only hold DeviantArt's rows (and empty helpers). With anything else in it
  // (a heading, a banner), DeviantArt's own rows stay.
  const onlyRows = wall => [...wall.children].every(c => c.hasAttribute('data-pw-flat') || c.matches(ROW) || c.querySelector(ROW) || !c.offsetHeight);
  function unwall(wall) {
    if (wall.hasAttribute('data-pw-wall')) { wall.removeAttribute('data-pw-wall'); sizes.unobserve(wall); }
    if (wall.parentElement) wall.parentElement.removeAttribute('data-pw-wall-box');
    wall.pwLast = null;
  }

  function place(wall) {
    const tiles = tilesOf(wall);
    if (!tiles.length) return;
    if (!onlyRows(wall)) { unwall(wall); return; }
    // DeviantArt sizes the box around its rows; the wall takes the page's width instead.
    flag(wall.parentElement, 'data-pw-wall-box', true);
    if (!wall.hasAttribute('data-pw-wall')) { wall.setAttribute('data-pw-wall', ''); sizes.observe(wall); }
    const width = wall.clientWidth;
    if (!width) return;
    let changed = false;
    const infos = tiles.map((tile, i) => { const t = tileInfo(tile, i); if (t.fresh) { t.fresh = false; changed = true; } return t; });

    // Nothing new since last time: only put back sharp pictures DeviantArt may have swapped out.
    const last = wall.pwLast;
    if (!changed && last && last.width === width && last.version === learnedVersion &&
        last.tiles.length === tiles.length && last.tiles.every((t, i) => t === tiles[i])) {
      for (const t of infos) if (t.img && t.img.pwWant && t.img.getAttribute('src') !== t.img.pwWant) sharpen(t.img, t.key, last.cell, clampShape(learned.get(t.key) || t.shape), last.small);
      return;
    }
    const columns = Math.max(1, Math.floor((width + GAP) / (COLUMN + GAP)));
    const cell = (width - GAP * (columns - 1)) / columns;
    const small = !!wall.querySelector('[data-testid="grid-row"]');
    wall.pwLast = { width, version: learnedVersion, tiles, cell, small };

    // If DeviantArt ever takes pictures out above the visible ones, their places are kept,
    // so nothing below them moves.
    const keys = infos.map(t => t.key);
    const old = lists.get(wall) || [];
    const start = old.findIndex(e => e.key === keys[0]);
    const list = start > 0 ? old.slice(0, start) : [];
    infos.forEach((t, i) => list.push({ key: t.key, tile: tiles[i], img: t.img, shape: clampShape(learned.get(t.key) || t.shape) }));
    lists.set(wall, list.map(e => ({ key: e.key, shape: e.shape })));

    const tops = new Array(columns).fill(0);
    for (const e of list) {
      let c = 0;
      for (let i = 1; i < columns; i++) if (tops[i] < tops[c] - 0.5) c = i;
      const h = cell / e.shape;
      if (e.tile) {
        setVar(e.tile, '--pw-x', (c * (cell + GAP)).toFixed(2) + 'px');
        setVar(e.tile, '--pw-y', tops[c].toFixed(2) + 'px');
        setVar(e.tile, '--pw-w', cell.toFixed(2) + 'px');
        setVar(e.tile, '--pw-h', h.toFixed(2) + 'px');
        if (e.img) sharpen(e.img, e.key, cell, e.shape, small);
      }
      tops[c] += h + GAP;
    }
    setVar(wall, '--pw-wall-h', Math.max(0, Math.max(...tops) - GAP).toFixed(2) + 'px');
  }

  /* ---------- Art pages: only the picture; the artist's other pictures and "More like this" below ---------- */
  const ART = ['data-pw-art-layout', 'data-pw-art-stage', 'data-pw-art-box', 'data-pw-art-side', 'data-pw-art-hide'];
  const artistOf = path => ((path.match(/^\/([^/]+)\/art\//) || [])[1] || '').toLowerCase();
  function artPage() {
    const side = document.querySelector('main [role="complementary"]');
    const picture = side && [...document.querySelectorAll('main img[property="contentUrl"]')]
      .find(img => !img.closest('[data-testid="thumb"], [role="complementary"], figure'));
    const layout = side && side.parentElement;
    const who = artistOf(location.pathname);
    if (!picture || !who || !layout || !layout.contains(picture)) {
      if (html.hasAttribute('data-pw-art')) {
        html.removeAttribute('data-pw-art');
        for (const name of ART) for (const el of document.querySelectorAll('[' + name + ']')) el.removeAttribute(name);
      }
      return;
    }
    flag(html, 'data-pw-art', true);
    flag(layout, 'data-pw-art-layout', true);
    flag(picture.parentElement, 'data-pw-art-box', true); // the picture's box, centred across the whole width
    flag(side, 'data-pw-art-side', true);
    for (const part of layout.children) {
      if (part === side) continue;
      const stage = part.contains(picture);
      flag(part, 'data-pw-art-stage', stage);
      flag(part, 'data-pw-art-hide', !stage);
      // Under the picture: the shop banner and the buttons (favourite, comment, buy) are hidden.
      if (stage) for (const bit of part.children) flag(bit, 'data-pw-art-hide', !bit.contains(picture));
    }
    // In the side panel only the artist's other pictures and "More like this" stay, without headings.
    for (const box of side.children) {
      const links = [...box.querySelectorAll('a[href*="/art/"]')];
      const keep = !!box.querySelector('a[href*="/morelikethis/"]') ||
        (links.length > 0 && links.every(a => artistOf(a.pathname) === who));
      flag(box, 'data-pw-art-hide', !keep);
      if (keep) for (const bit of box.children) flag(bit, 'data-pw-art-hide', !bit.querySelector('[data-testid="thumb"]'));
    }
  }

  /* ---------- One top row: the search box on the left, DeviantArt's topic chips to its right.
     The left toolbar is hidden. Both come back with the rest of DeviantArt when the look is off. ---------- */
  let rail = null, chips = null;
  function toolbar() {
    const header = document.querySelector('header[role="banner"]');
    // Only when the search box is found; otherwise the header stays as DeviantArt made it.
    flag(html, 'data-pw-search', !!(header && header.querySelector('#search-input')));
    if (header && header.offsetHeight) setVar(html, '--pw-top-h', header.offsetHeight + 'px');

    // The left toolbar: a narrow <nav> down the left edge, in its own column beside <main>.
    if (!rail || !rail.isConnected) {
      rail = null;
      const main = document.querySelector('main');
      for (const nav of main ? document.querySelectorAll('nav') : []) {
        if (nav.closest('header, main')) continue;
        const r = nav.getBoundingClientRect();
        if (!r.width || r.left > 4 || r.width > 120) continue;
        for (let el = nav; el.parentElement; el = el.parentElement) {
          if (el.parentElement.contains(main)) { rail = el; break; }
        }
        if (rail) break;
      }
      if (rail) {
        flag(rail, 'data-pw-rail', true);
        // The page gives the toolbar a column of its own; the wall takes that space back.
        const grid = rail.parentElement;
        if (grid.children.length === 2 && getComputedStyle(grid).display === 'grid') flag(grid, 'data-pw-rail-grid', true);
      }
    }

    // The topic chips ("All", "Anime and Manga", ...): one short row of links that scrolls sideways.
    if (!chips || !chips.isConnected) {
      chips = null;
      const rows = new Map();
      for (const a of document.querySelectorAll('main a.ds-card')) rows.set(a.parentElement, (rows.get(a.parentElement) || 0) + 1);
      for (const [row, n] of rows) {
        if (n < 4 || !row.parentElement || row.closest('[data-pw-wall]')) continue;
        if (!row.parentElement.hasAttribute('data-pw-chips')) { // (a row already hidden by us has no size)
          const r = row.getBoundingClientRect();
          if (!r.height || r.height > 64) continue;
        }
        if (!/auto|scroll|hidden/.test(getComputedStyle(row).overflowX)) continue;
        chips = row;
        break;
      }
    }
    topics(chips && html.hasAttribute('data-pw-search') ? chips : null);
  }

  // The chips are copied into the top row, next to the search box (DeviantArt's own row is hidden).
  // A click on a copy clicks the original, so DeviantArt changes the page the way it always does.
  let topicsBox = null, topicsRow = null, topicsSig = '';
  function topicArrows() {
    if (!topicsBox) return;
    const strip = topicsBox.querySelector('.pw-topics-row');
    const [back, more] = topicsBox.querySelectorAll('.pw-topics-go');
    back.hidden = strip.scrollLeft <= 2;
    more.hidden = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
  }
  function topics(row) {
    if (topicsRow && topicsRow !== row) { flag(topicsRow.parentElement, 'data-pw-chips', false); topicsRow = null; }
    if (!row) {
      if (topicsBox) { topicsBox.remove(); topicsBox = null; topicsSig = ''; }
      return;
    }
    topicsRow = row;
    flag(row.parentElement, 'data-pw-chips', true);
    if (!topicsBox) {
      topicsBox = document.createElement('div');
      topicsBox.id = 'pw-topics';
      topicsBox.innerHTML = '<button type="button" class="pw-topics-go" data-step="-1" aria-label="More topics to the left" hidden>&#8249;</button>' +
        '<div class="pw-topics-row"></div>' +
        '<button type="button" class="pw-topics-go" data-step="1" aria-label="More topics to the right" hidden>&#8250;</button>';
      const strip = topicsBox.querySelector('.pw-topics-row');
      strip.addEventListener('scroll', topicArrows, { passive: true });
      strip.addEventListener('wheel', e => { // the mouse wheel scrolls the row sideways
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        strip.scrollLeft += e.deltaY; e.preventDefault();
      }, { passive: false });
      topicsBox.addEventListener('click', e => {
        const go = e.target.closest('.pw-topics-go');
        if (go) { strip.scrollBy({ left: +go.dataset.step * strip.clientWidth * 0.8, behavior: 'smooth' }); return; }
        const copy = e.target.closest('.pw-topics-row a[href]');
        if (!copy || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const original = topicsRow && topicsRow.isConnected && topicsRow.querySelectorAll('a[href]')[+copy.dataset.pwIndex];
        if (original && original.href === copy.href) { e.preventDefault(); original.click(); }
      });
      addEventListener('resize', topicArrows, { passive: true });
    }
    if (!topicsBox.isConnected) document.body.appendChild(topicsBox);
    // Rebuild the copies when DeviantArt changes its chips (another tag page, another chip selected).
    const links = [...row.querySelectorAll('a[href]')];
    const sig = row.className + '\n' + links.map(a => a.href + ' ' + a.className + ' ' + a.textContent).join('\n');
    if (sig === topicsSig) return;
    topicsSig = sig;
    const strip = topicsBox.querySelector('.pw-topics-row');
    strip.className = 'pw-topics-row ' + row.className; // DeviantArt's chip styles may depend on their row
    strip.replaceChildren(...links.map((a, i) => {
      const copy = a.cloneNode(true);
      copy.removeAttribute('id');
      copy.dataset.pwIndex = i;
      return copy;
    }));
    const selected = strip.querySelector('.ds-card-selected');
    if (selected) strip.scrollLeft = Math.max(0, selected.offsetLeft - strip.clientWidth / 3);
    topicArrows();
  }

  /* ---------- No heading bar under the top row (Bravely 0.12) ----------
     The page's own bar with its title ("Home", "Explore Landscape") is hidden, so the wall starts right under
     the top row, like Pinless. A sort menu in that bar ("Relevance" on tag pages) moves to the right end of the
     top row. Profile headers (with a picture) and art pages are left alone. */
  const titleBars = new Set(), sortBars = new Set();
  function headingBar() {
    const titles = new Set(), sorts = new Set();
    let sortWidth = 0;
    if (html.hasAttribute('data-pw-search') && !html.hasAttribute('data-pw-art')) {
      for (const bar of document.querySelectorAll('main header')) {
        if (!bar.querySelector('h1') || bar.querySelector('img, input, video') || bar.closest('[data-pw-wall]')) continue;
        const menu = bar.querySelector('[aria-haspopup="listbox"]');
        if (!menu) { titles.add(bar); continue; }
        sorts.add(bar);
        for (const m of bar.querySelectorAll('[aria-haspopup="listbox"]')) sortWidth += Math.ceil(m.getBoundingClientRect().width) + 8;
      }
    }
    for (const el of titleBars) if (!titles.has(el)) el.removeAttribute('data-pw-titlebar');
    for (const el of titles) flag(el, 'data-pw-titlebar', true);
    titleBars.clear(); titles.forEach(el => titleBars.add(el));
    for (const el of sortBars) if (!sorts.has(el)) el.removeAttribute('data-pw-sortbar');
    for (const el of sorts) flag(el, 'data-pw-sortbar', true);
    sortBars.clear(); sorts.forEach(el => sortBars.add(el));
    flag(html, 'data-pw-sort', sorts.size > 0);
    if (sortWidth) setVar(html, '--pw-sort-w', sortWidth + 'px');
  }

  /* ---------- Shop and promotion banners next to walls (for example "Sell your art on T-shirts") ---------- */
  const PROMO = 'a[href*="/team/journal/"], a[href$="/shop"], a[href*="/shop#"], a[href*="core-membership"], a[href*="/dreamup"], a[href*="/studio/"]';
  function promos(wall) {
    for (let el = wall, i = 0; el && el.tagName !== 'MAIN' && i < 6; el = el.parentElement, i++) {
      const parent = el.parentElement;
      if (!parent) break;
      for (const sib of parent.children) {
        if (sib === el || sib.hasAttribute('data-pw-promo') || sib.querySelector('[data-testid="thumb"]')) continue;
        if (sib.matches('header, nav, footer, [role]') || sib.querySelector('header, nav, input, [role="banner"]')) continue; // never the site header
        if (sib.matches(PROMO) || sib.querySelector(PROMO)) {
          const r = sib.getBoundingClientRect();
          if (r.height > 0 && r.height <= 120) sib.setAttribute('data-pw-promo', '');
        }
      }
    }
  }

  function scan() {
    timer = 0;
    if (!document.body) return;
    try { toolbar(); } catch (e) { console.warn('[Bravely] DeviantArt toolbar:', e); }
    try { artPage(); } catch (e) { console.warn('[Bravely] DeviantArt art page:', e); }
    try { headingBar(); } catch (e) { console.warn('[Bravely] DeviantArt heading bar:', e); }
    const seen = new Set();
    for (const row of document.querySelectorAll(ROW)) {
      const wall = wallOf(row);
      if (!wall || seen.has(wall)) continue;
      seen.add(wall);
      try { place(wall); } catch (e) {
        unwall(wall); // DeviantArt's own rows come back
        console.warn('[Bravely] DeviantArt wall:', e);
      }
      try { promos(wall); } catch (_) {}
    }
    for (const wall of lists.keys()) if (!wall.isConnected) { lists.delete(wall); sizes.unobserve(wall); }
  }

  new MutationObserver(records => {
    for (const r of records) if (r.type === 'childList' || r.target.tagName === 'IMG') { schedule(); return; }
  }).observe(html, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('popstate', schedule);
  schedule();
})();
