/* Bravely look for pixiv (Bravely 0.12): dark page, pictures in a brick wall with 4px gaps and nothing on
   them, and artwork pages with only the picture; the artist's other works and "Related works" become a
   wall under it. One top row: the search box, then pixiv's tag chips; no side menu (it slides out when the
   mouse touches the left edge of the screen).
   The styles are in pixiv-look.css and apply while <html> has the "pw-px" class.
   Ctrl+Shift+X switches the look off/on (the page reloads). The options page has the same switch.
   pixiv still loads, links and scrolls everything itself. This file marks pixiv's own elements, tells each
   picture where to sit, and asks pixiv's image server for the whole picture instead of its square crop.
   Search results, "Newest by followed" and bookmarks continue below the wall instead of stopping at page
   numbers: the next pages load as you scroll. Pages without pictures keep pixiv's own layout. */
(() => {
  'use strict';
  const CLS = 'pw-px', CACHE = 'pwPxLook';
  const html = document.documentElement;

  // Set the class before pixiv draws anything. localStorage is a fast copy of the saved setting.
  let on = true;
  try { on = localStorage.getItem(CACHE) !== 'off'; } catch (_) {}
  html.classList.toggle(CLS, on);

  const remember = v => { try { localStorage.setItem(CACHE, v ? 'on' : 'off'); } catch (_) {} };
  let reloading = false;
  const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
  try {
    chrome.storage.sync.get({ pxLook: true }, s => {
      const v = s.pxLook !== false;
      remember(v);
      if (v !== on) reload();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.pxLook) return;
      const v = changes.pxLook.newValue !== false;
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
    try { chrome.storage.sync.set({ pxLook: !on }, reload); } catch (_) {}
    setTimeout(reload, 500);
  }, true);

  if (!on) return;
  const IMG = self.pwPxImages;

  let timer = 0;
  function schedule() { if (!timer) timer = setTimeout(scan, 40); }

  const flag = (el, name, yes) => {
    if (!el) return;
    if (yes) { if (!el.hasAttribute(name)) el.setAttribute(name, ''); }
    else if (el.hasAttribute(name)) el.removeAttribute(name);
  };
  const setVar = (el, name, value) => { if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); };
  // Marks exactly the elements in "now" with an attribute (and takes it off the ones marked last time).
  function mark(name, old, now) {
    for (const el of old) if (!now.has(el)) el.removeAttribute(name);
    for (const el of now) if (!el.hasAttribute(name)) el.setAttribute(name, '');
    old.clear();
    for (const el of now) old.add(el);
  }
  const SKIP = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'LINK', 'META', 'NOSCRIPT']);
  const VISIBLE = 'img, iframe, svg, video, canvas, picture, figure, input, button, textarea, select, pixiv-icon';
  const hasContent = el => !SKIP.has(el.tagName) && (!!el.textContent.trim() || el.matches(VISIBLE) || !!el.querySelector(VISIBLE));
  const LOADER = '[role="progressbar"], [class*="pinner"], [class*="oading"]';
  const isLoader = el => !el.textContent.trim() && (el.matches(LOADER) || !!el.querySelector(LOADER));
  const dpr = () => Math.min(3, window.devicePixelRatio || 1);
  const pagePath = () => location.pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';

  /* ---------- Shapes: the width / height of each work's first picture ----------
     From pixiv's own answers (pixiv-data.js reads them inside the page), else from the picture itself once
     it has loaded whole (learned), else square until then. */
  const shapes = new Map(), learned = new Map();
  let shapesVersion = 0;
  function addShape(id, w, h) {
    if (!(w > 0) || !(h > 0)) return;
    const s = w / h, old = shapes.get(id);
    if (old && Math.abs(old - s) < 0.002) return;
    shapes.set(id, s); shapesVersion++; schedule();
  }
  document.addEventListener('pw-px-shapes', e => {
    try { const d = JSON.parse(e.detail); for (const id in d) addShape(id, d[id][0], d[id][1]); } catch (_) {}
  });
  try { document.dispatchEvent(new CustomEvent('pw-px-hello')); } catch (_) {}

  function learn(img) {
    const src = img.currentSrc || img.src;
    const p = IMG.parts(src);
    if (!p || !IMG.whole(src) || !img.naturalWidth || (p.page !== null && p.page !== 0)) return;
    const s = img.naturalWidth / img.naturalHeight, old = learned.get(p.id);
    if (!old || Math.abs(old - s) > 0.01) { learned.set(p.id, s); shapesVersion++; schedule(); }
  }
  // Hints pixiv itself writes on some pictures (rankings): an aspect-ratio, or the real width and height.
  function hint(t) {
    for (const el of [t.img, t.ph]) {
      if (!el) continue;
      const m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(el.style.aspectRatio || '');
      if (m && +m[1] > 0 && +m[2] > 0) return +m[1] / +m[2];
      if (el.tagName === 'IMG' && IMG.whole(el.getAttribute('src') || '')) {
        const w = +el.getAttribute('width'), h = +el.getAttribute('height');
        if (w > 0 && h > 0) return w / h;
      }
    }
    return 0;
  }
  const clampShape = s => Math.min(4, Math.max(0.25, s || 1));
  const shapeOf = t => clampShape(learned.get(t.id) || shapes.get(t.id) || hint(t) || 1);

  /* ---------- Walls: every list of works becomes a brick wall like Pinless ----------
     A list is the smallest box holding thumbnails of two or more different works; each of its children
     that holds one work is a tile. Lists that follow each other (with nothing visible between them) continue
     the same columns, so a page of several lists looks like one wall. */
  const COLUMN = 260, GAP = 4; // Pinless's column width and gap
  const ROOT = '.__top_side_menu_body';
  const WORK = /\/artworks\/(\d+)/;
  const workOf = a => { const m = WORK.exec(a.getAttribute('href') || ''); return m ? m[1] : ''; };

  function findWalls(root, art) {
    const links = [];
    for (const a of root.querySelectorAll('a[href*="/artworks/"]')) {
      const id = workOf(a);
      if (!id || !a.querySelector('img, figure')) continue;
      if (art && art.contains(a)) continue;
      // hidden by pixiv, a tile's extras, or the extension's own continuation (placed separately)
      if (a.closest('[hidden], .hidden, [data-pw-tile] [data-pw-chrome], #pw-more')) continue;
      links.push([a, id]);
    }
    const ids = new Map(); // element -> the works inside it
    for (const [a, id] of links) {
      ids.set(a, new Set([id]));
      for (let el = a.parentElement; el; el = el.parentElement) {
        let s = ids.get(el);
        if (!s) ids.set(el, s = new Set());
        s.add(id);
        if (el === root) break;
      }
    }
    // A list only holds tiles of one work each (a box of whole sections is not a list).
    const valid = new Map();
    const isList = el => {
      if (!valid.has(el)) {
        let single = 0, multi = 0;
        for (const c of el.children) { const s = ids.get(c); if (s) { if (s.size === 1) single++; else multi++; } }
        valid.set(el, single >= 2 && single >= multi * 4);
      }
      return valid.get(el);
    };
    const walls = new Map();
    for (const [a] of links) {
      let child = a;
      for (let el = a.parentElement; el && el !== root; child = el, el = el.parentElement) {
        if (ids.get(el).size < 2) continue;
        if (!isList(el)) break; // a work on its own between sections: not part of a wall
        let w = walls.get(el);
        if (!w) walls.set(el, w = { wall: el, tiles: [], links: new Map() });
        if (!w.links.has(child)) { w.links.set(child, a); w.tiles.push(child); }
        break;
      }
    }
    const tiles = new Set();
    for (const w of walls.values()) for (const t of w.tiles) tiles.add(t);
    const out = [];
    for (const w of walls.values()) {
      let nested = false;
      for (let el = w.wall.parentElement; el && el !== root && !nested; el = el.parentElement) nested = tiles.has(el);
      if (nested || w.wall.closest('[data-pw-off]')) continue;
      // Artwork pages: only the artist's works under the picture and "Related works"
      // (not the side panel, not "Works by all users").
      if (art && !(w.wall.closest('main') || w.wall.closest('.gtm-illust-recommend-zone'))) continue;
      out.push(w);
    }
    return out.sort((a, b) => (a.wall.compareDocumentPosition(b.wall) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  // What the wall knows about each tile, worked out again only when pixiv changes the tile.
  const info = new WeakMap();
  function tileInfo(tile, link) {
    let t = info.get(tile);
    const img = link.querySelector('img');
    if (!t || t.link !== link || t.img !== img || !tile.contains(link)) {
      t = { link, id: workOf(link), img, ph: img ? null : link.querySelector('figure') };
      prepare(tile, img || t.ph || link);
      info.set(tile, t);
      if (img && !img.pwSeen) { img.pwSeen = true; img.addEventListener('load', () => learn(img)); if (img.complete) learn(img); }
    }
    return t;
  }
  // The picture fills its tile; pixiv's titles, names, hearts and badges on and around it are hidden.
  function prepare(tile, target) {
    flag(tile, 'data-pw-tile', true);
    for (let el = target; el && el !== tile; el = el.parentElement) {
      flag(el, 'data-pw-fill', true);
      const parent = el.parentElement;
      if (!parent) break;
      for (const sib of parent.children) if (sib !== el) flag(sib, 'data-pw-chrome', true);
    }
  }

  // The whole picture at a size for the tile, instead of pixiv's small square crop.
  function sharpen(img, cell, shape) {
    const src = img.getAttribute('src') || '';
    const ours = img.pwWant && src === img.pwWant;
    const base = ours ? img.pwBase : src;
    if (!IMG.parts(base)) return;
    const W = Math.ceil(cell * dpr());
    if (ours && img.pwW >= W * 0.9) return; // big enough already
    const want = IMG.fit(base, W, shape);
    if (!want || want === src) return;
    Object.assign(img, { pwBase: base, pwWant: want, pwW: W });
    if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
    img.setAttribute('src', want);
  }

  const sizes = new ResizeObserver(() => schedule());
  const placed = new Set();
  const offs = new Set();
  function unwall(wall) {
    wall.removeAttribute('data-pw-wall');
    wall.style.removeProperty('--pw-wall-h');
  }
  function layout(walls) {
    const now = new Set(), off = new Set();
    let chain = null;
    for (const w of walls) {
      const wall = w.wall;
      now.add(wall);
      if (!placed.has(wall)) { placed.add(wall); sizes.observe(wall); }
      flag(wall, 'data-pw-wall', true);
      // What else sits in the list (advertisements, novels, collections) is hidden.
      const tileSet = new Set(w.tiles);
      for (const c of wall.children) if (!tileSet.has(c) && hasContent(c) && !isLoader(c)) off.add(c);
      const infos = w.tiles.map(tile => tileInfo(tile, w.links.get(tile)));
      const width = wall.clientWidth;
      if (!width) continue;
      const r = wall.getBoundingClientRect();
      const x = r.left, y = r.top + scrollY;
      if (!(chain && Math.abs(chain.x - x) < 2 && Math.abs(chain.width - width) < 2 && Math.abs(y - chain.bottom) <= 8)) {
        const columns = Math.max(1, Math.floor((width + GAP) / (COLUMN + GAP)));
        chain = { x, width, columns, cell: (width - GAP * (columns - 1)) / columns, tops: new Array(columns).fill(y), bottom: y };
      }
      const { cell, tops, columns } = chain;
      infos.forEach((t, i) => {
        const tile = w.tiles[i];
        let c = 0;
        for (let k = 1; k < columns; k++) if (tops[k] < tops[c] - 0.5) c = k;
        const shape = shapeOf(t), h = cell / shape;
        setVar(tile, '--pw-x', (c * (cell + GAP)).toFixed(2) + 'px');
        setVar(tile, '--pw-y', (tops[c] - y).toFixed(2) + 'px');
        setVar(tile, '--pw-w', cell.toFixed(2) + 'px');
        setVar(tile, '--pw-h', h.toFixed(2) + 'px');
        if (t.img) sharpen(t.img, cell, shape);
        tops[c] += h + GAP;
      });
      const height = Math.max(0, Math.max(...tops) - GAP - y);
      setVar(wall, '--pw-wall-h', height.toFixed(2) + 'px');
      chain.bottom = y + height;
      lastCell = cell;
    }
    mark('data-pw-off', offs, off);
    for (const wall of placed) if (!now.has(wall)) { placed.delete(wall); sizes.unobserve(wall); unwall(wall); }
  }
  let lastCell = COLUMN;

  /* ---------- Artwork pages: only the picture; the artist's works and "Related works" under it ---------- */
  const artPics = new Set(), artOffs = new Set(), artBars = new Set(), artBtns = new Set();
  function artPage(root) {
    let fig = null;
    if (/^\/artworks\/\d+/.test(pagePath())) {
      for (const f of root.querySelectorAll('main figure')) {
        if (f.closest('a[href*="/artworks/"]')) continue; // a thumbnail
        if (f.querySelector('img[src*="i.pximg.net"]')) { fig = f; break; }
      }
    }
    flag(html, 'data-pw-art', !!fig);
    mark('data-pw-art-pic', artPics, new Set(fig ? [fig] : []));
    const off = new Set(), keep = [], bars = new Set();
    if (fig) {
      // Inside the picture: only the pictures (no page counter).
      for (const el of fig.querySelectorAll('div, span')) if (!el.querySelector('img') && el.textContent.trim()) off.add(el);
      // Beside it: pixiv's "Show all" button for works with several pictures. Its neighbours
      // (bookmark, like, share) are in a <section> and are hidden with the rest of the page.
      for (const sib of fig.parentElement.children) {
        if (sib === fig || sib.matches('figcaption') || sib.querySelector('h1, h2, figcaption')) continue;
        for (const b of sib.querySelectorAll('button')) {
          const section = b.closest('section');
          if ((!section || !sib.contains(section)) && b.textContent.trim()) { keep.push(b); bars.add(sib); }
        }
      }
    }
    mark('data-pw-art-off', artOffs, off);
    mark('data-pw-art-bar', artBars, bars);
    mark('data-pw-art-btn', artBtns, new Set(keep));
    return fig ? { fig, keep } : null;
  }

  /* ---------- Only walls on picture pages: everything else beside them is hidden ----------
     Kept: the walls, the artwork's picture, page numbers, a short "Show all" link under a wall, and loading
     spinners. The rest comes back with pixiv's regular page (Ctrl+Shift+X). */
  function wallPage() {
    const p = pagePath();
    if (/\/novels?(\/|$)/.test(p)) return false;
    return p === '/' || /^\/(?:illustration|manga|discovery|ranking\.php|bookmark_new_illust(?:_r18)?\.php|new_illust(?:_r18)?\.php)\/?$/.test(p) ||
      /^\/tags\/[^/]+(?:\/(?:artworks|illustrations|manga))?\/?$/.test(p) ||
      /^\/users\/\d+(?:\/(?:artworks|illustrations|manga|bookmarks\/artworks)(?:\/[^/]+)?)?\/?$/.test(p) ||
      /^\/artworks\/\d+\/?$/.test(p);
  }
  function isPager(el) { // page numbers: links or buttons that are just a number (not thumbnails with a page count)
    const nav = el.matches('nav') ? el : el.querySelector('nav');
    if (!nav || nav.querySelector('img, figure')) return false;
    let n = 0;
    for (const x of nav.querySelectorAll('a, button')) if (/^\d+$/.test(x.textContent.trim())) n++;
    return n >= 2;
  }
  function isMoreLink(el) {
    const t = el.textContent.trim();
    if (!t || t.length > 24 || el.querySelector('img, iframe, input, textarea, select, video, h1, h2, h3')) return false;
    return el.querySelectorAll('a[href], button').length + (el.matches('a[href], button') ? 1 : 0) === 1;
  }
  const iso = { hide: new Set(), path: new Set(), keep: new Set() };
  function isolate(root, keeps, pagerOk) {
    const hide = new Set(), path = new Set(), keep = new Set();
    if (keeps.size) {
      for (const k of keeps) for (let el = k.parentElement; el && el !== root; el = el.parentElement) path.add(el);
      const visit = el => {
        let after = false;
        for (const c of el.children) {
          if (keeps.has(c)) { after = true; continue; }
          if (path.has(c)) { visit(c); after = true; continue; }
          if (SKIP.has(c.tagName) || !hasContent(c) || isLoader(c)) continue;
          if ((pagerOk && isPager(c)) || (after && isMoreLink(c))) keep.add(c);
          else if (c.querySelector(LOADER)) { path.add(c); visit(c); } // a list still loading: its spinner stays
          else hide.add(c);
        }
      };
      visit(root);
    }
    mark('data-pw-hide', iso.hide, hide);
    mark('data-pw-path', iso.path, path);
    mark('data-pw-keep', iso.keep, keep);
    flag(html, 'data-pw-iso', keeps.size > 0);
  }

  /* ---------- One top row: the search box on the left, pixiv's tag chips to its right ----------
     The rest of the header (notifications, messages, your menu, Post) comes back with Ctrl+Shift+X. */
  const head = { box: new Set(), row: new Set(), col: new Set(), out: new Set(), chips: new Set() };
  function toolbar(root) {
    const app = root ? root.parentElement : null;
    let box = null, row = null, col = null;
    if (app) for (const c of app.children) {
      if (c === root || c.querySelector('.__top_side_menu_root')) continue;
      if (c.querySelector('form input[type="text"], form input[type="search"]')) { box = c; break; }
    }
    if (box) {
      const form = box.querySelector('form input[type="text"], form input[type="search"]').closest('form');
      for (let el = form.parentElement; el && el !== box; el = el.parentElement) if (el.children.length >= 3) { row = el; break; }
      if (row) col = [...row.children].find(c => c.contains(form)) || null;
    }
    mark('data-pw-head-box', head.box, new Set(col ? [box] : []));
    mark('data-pw-head', head.row, new Set(col ? [row] : []));
    mark('data-pw-search-col', head.col, new Set(col ? [col] : []));
    flag(html, 'data-pw-search', !!col);
    if (col && box.offsetHeight) setVar(html, '--pw-top-h', box.offsetHeight + 'px');

    // Around the header: the advertisement under it, the sign-up box (logged out), "Send feedback".
    const out = new Set();
    if (app && col) for (const c of app.children) {
      if (c === root || c === box || c.querySelector('.__top_side_menu_root')) continue;
      if (c.matches('.__premium_banner') || c.querySelector('iframe, a[href*="signup.php"], a[href*="/premium/"]')) out.add(c);
      else if (getComputedStyle(c).position === 'fixed') for (const x of c.children) if (x.textContent.trim()) out.add(x);
    }
    mark('data-pw-out', head.out, out);

    // pixiv's tag chips (home: recommended tags, tag pages: related tags): copied into the top row.
    let chips = null;
    const tags = root ? root.querySelectorAll('a[data-ga4-label="colorful_tag"]') : [];
    if (col && tags.length >= 4) {
      for (let el = tags[0].parentElement; el && el !== root; el = el.parentElement) {
        let n = 0;
        for (const a of tags) if (el.contains(a)) n++;
        if (n >= 4) { chips = el; break; }
      }
    }
    // pixiv's own chip carousel (with its arrows) is hidden.
    let carousel = chips;
    while (carousel && carousel.parentElement && carousel.parentElement !== root &&
      carousel.parentElement.textContent.trim() === chips.textContent.trim() && !carousel.parentElement.querySelector('a[href*="/artworks/"]')) carousel = carousel.parentElement;
    mark('data-pw-chips', head.chips, new Set(carousel ? [carousel] : []));
    topics(chips);
  }

  // The chips are copied into the top row, next to the search box. A click on a copy clicks pixiv's own
  // chip, so pixiv changes the page the way it always does.
  let topicsBox = null, topicsRow = null, topicsSig = '';
  function topicArrows() {
    if (!topicsBox) return;
    const strip = topicsBox.querySelector('.pw-topics-row');
    const [back, more] = topicsBox.querySelectorAll('.pw-topics-go');
    back.hidden = strip.scrollLeft <= 2;
    more.hidden = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
  }
  const linkOf = el => (el.matches('a[href]') ? el : el.querySelector('a[href]'));
  function topics(row) {
    topicsRow = row;
    if (!row) {
      if (topicsBox) { topicsBox.remove(); topicsBox = null; topicsSig = ''; }
      return;
    }
    if (!topicsBox) {
      topicsBox = document.createElement('div');
      topicsBox.id = 'pw-topics';
      topicsBox.innerHTML = '<button type="button" class="pw-topics-go" data-step="-1" aria-label="More tags to the left" hidden>&#8249;</button>' +
        '<div class="pw-topics-row"></div>' +
        '<button type="button" class="pw-topics-go" data-step="1" aria-label="More tags to the right" hidden>&#8250;</button>';
      const strip = topicsBox.querySelector('.pw-topics-row');
      strip.addEventListener('scroll', topicArrows, { passive: true });
      strip.addEventListener('wheel', e => { // the mouse wheel scrolls the row sideways
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        strip.scrollLeft += e.deltaY; e.preventDefault();
      }, { passive: false });
      topicsBox.addEventListener('click', e => {
        const go = e.target.closest('.pw-topics-go');
        if (go) { strip.scrollBy({ left: +go.dataset.step * strip.clientWidth * 0.8, behavior: 'smooth' }); return; }
        const copy = e.target.closest('.pw-topics-row > [data-pw-index]');
        if (!copy || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const href = linkOf(copy) && linkOf(copy).href;
        const unit = topicsRow && topicsRow.isConnected && topicsRow.children[+copy.dataset.pwIndex];
        const original = unit && linkOf(unit);
        e.preventDefault();
        const before = location.href;
        if (original && original.href === href) original.click();
        else if (href) { location.assign(href); return; }
        setTimeout(() => { if (location.href === before && href) location.assign(href); }, 600);
      });
      addEventListener('resize', topicArrows, { passive: true });
    }
    if (!topicsBox.isConnected) document.body.appendChild(topicsBox);
    // Rebuild the copies when pixiv changes its chips (another page, other tags).
    const units = [...row.children];
    const sig = units.map(u => (linkOf(u) || {}).href + ' ' + u.textContent).join('\n');
    if (sig === topicsSig) return;
    topicsSig = sig;
    const strip = topicsBox.querySelector('.pw-topics-row');
    strip.replaceChildren(...units.map((u, i) => {
      const copy = u.cloneNode(true);
      copy.removeAttribute('id');
      for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
      copy.dataset.pwIndex = i;
      return copy;
    }));
    strip.scrollLeft = 0;
    topicArrows();
  }

  /* ---------- Endless results: the next pages of search results, "Newest by followed" and bookmarks load
     below the wall as you scroll, in pixiv's own order (pixiv-data.js reports how pixiv asked for page 1). ---------- */
  const MORE_PAGE = /^\/(?:tags\/[^/]+\/(?:artworks|illustrations|manga)|bookmark_new_illust(?:_r18)?\.php|users\/\d+\/bookmarks\/artworks(?:\/[^/]+)?)\/?$/;
  const more = { req: null, key: '', box: null, status: null, step: 0, busy: false, done: false, failed: false };
  document.addEventListener('pw-px-list', e => { try { more.req = JSON.parse(e.detail); schedule(); } catch (_) {} });
  // The same list of results: the same address (pixiv's own marker r=1 and "page 1" don't count).
  function viewKey(href) {
    try {
      const u = new URL(href, location.href);
      u.searchParams.delete('r');
      if (u.searchParams.get('p') === '1') u.searchParams.delete('p');
      u.searchParams.sort();
      return u.pathname + '?' + u.searchParams.toString();
    } catch (_) { return ''; }
  }
  // The address of the next page: the same request with the next page number (or offset).
  function nextUrl(req, step) {
    const u = new URL(req, location.href);
    const offset = u.searchParams.get('offset');
    if (offset != null) {
      const limit = +u.searchParams.get('limit') || 48;
      u.searchParams.set('offset', String(+offset + limit * step));
    } else {
      u.searchParams.set('p', String((+u.searchParams.get('p') || 1) + step));
    }
    return u.href;
  }
  // The works in an answer: the longest list of objects that look like pixiv's thumbnails.
  function worksOf(data) {
    let best = [];
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 12) return;
      if (Array.isArray(o)) {
        const works = o.filter(x => x && typeof x === 'object' && x.id != null && typeof x.url === 'string' && /pximg\.net/.test(x.url));
        if (works.length > best.length) best = works;
        for (const x of o) walk(x, d + 1);
        return;
      }
      for (const k in o) walk(o[k], d + 1);
    };
    walk(data, 0);
    return best;
  }
  function moreReset() {
    if (more.box) more.box.remove();
    if (more.status) more.status.remove();
    Object.assign(more, { box: null, status: null, step: 0, busy: false, done: false, failed: false });
  }
  function moreStatus(text, retry) {
    if (!more.status) return;
    more.status.textContent = text;
    if (retry) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Retry';
      b.addEventListener('click', () => { more.failed = false; loadMore(); });
      more.status.append(' ', b);
    }
    more.status.hidden = !text;
  }
  function moreSync(walls) {
    const key = viewKey(location.href);
    if (key !== more.key) { moreReset(); more.key = key; }
    const req = more.req;
    if (!MORE_PAGE.test(pagePath()) || !req || viewKey(req.page) !== key) { moreReset(); return null; }
    const host = walls.filter(w => w.wall !== more.box).pop();
    if (!host) return null;
    if (!more.box || !more.box.isConnected) {
      more.box = document.createElement('div');
      more.box.id = 'pw-more';
      more.status = document.createElement('div');
      more.status.id = 'pw-more-status';
      more.status.setAttribute('role', 'status');
      more.status.hidden = true;
    }
    if (more.box.previousElementSibling !== host.wall) host.wall.after(more.box);
    if (more.status.previousElementSibling !== more.box) more.box.after(more.status);
    return more.box;
  }
  function have() {
    const ids = new Set();
    for (const a of document.querySelectorAll(ROOT + ' a[href*="/artworks/"]')) { const id = workOf(a); if (id) ids.add(id); }
    return ids;
  }
  async function loadMore() {
    if (more.busy || more.done || more.failed || !more.req || !more.box) return;
    more.busy = true;
    const box = more.box, key = more.key;
    moreStatus('Loading more…');
    try {
      const res = await fetch(nextUrl(more.req.url, more.step + 1), { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.error) throw new Error(data.message || 'error');
      if (more.box !== box || more.key !== key) return; // another page by now
      const works = worksOf(data);
      const seen = have(), lang = /^\/[a-z]{2}\//.test(location.pathname) ? location.pathname.slice(0, 3) : '';
      let added = 0;
      for (const w of works) {
        const id = String(w.id);
        if (seen.has(id) || w.isAdContainer) continue;
        seen.add(id);
        if (w.width > 0 && w.height > 0) addShape(id, +w.width, +w.height);
        const tile = document.createElement('div');
        const a = document.createElement('a');
        a.href = lang + '/artworks/' + id;
        const img = document.createElement('img');
        img.alt = w.title || '';
        img.decoding = 'async';
        img.src = IMG.fit(w.url, Math.ceil(lastCell * dpr()), w.width > 0 && w.height > 0 ? w.width / w.height : 0) || w.url;
        a.append(img); tile.append(a); box.append(tile);
        added++;
      }
      more.step++;
      if (!works.length) more.done = true;
      moreStatus(more.done ? '' : (added ? '' : 'Loading more…'));
    } catch (e) {
      if (more.box === box) { more.failed = true; moreStatus('Could not load more pictures.', true); }
      console.warn('[Bravely] pixiv: more results', e);
    } finally {
      more.busy = false;
      schedule();
    }
  }
  function moreCheck() {
    if (!more.box || !more.box.isConnected || more.busy || more.done || more.failed) return;
    if (more.box.getBoundingClientRect().bottom < innerHeight * 3) loadMore();
  }

  /* pixiv itself loads more (home, discovery, related works) when an invisible marker at the end of a list
     comes into view. The marker is made for pixiv's own, taller pages: in the shorter wall it can stay in view
     after a load, and pixiv then waits for it to come into view again. So when the page has stopped growing
     while you are near its bottom, the marker is taken out for a moment and put back, which pixiv sees as
     coming into view again. */
  let lastHeight = 0, grownAt = 0, nudgedAt = 0, nudges = 0, nudgeWalls = [];
  function nudge() {
    if (document.visibilityState !== 'visible' || !nudgeWalls.length) return;
    const h = document.documentElement.scrollHeight, now = Date.now();
    if (h !== lastHeight) { lastHeight = h; grownAt = now; nudges = 0; return; }
    if (scrollY + innerHeight < h - innerHeight * 1.5 || now - grownAt < 1500 || now - nudgedAt < 3000 || nudges >= 5) return;
    const markers = new Set();
    for (const w of nudgeWalls) {
      let el = w.wall;
      for (let i = 0; i < 3 && el.parentElement; i++, el = el.parentElement) {
        for (const c of el.parentElement.children) if (c !== el && !hasContent(c) && c.offsetHeight > 100) markers.add(c);
      }
    }
    if (!markers.size) return;
    nudgedAt = now; nudges++;
    const saved = [...markers].map(m => [m, m.style.getPropertyValue('display'), m.style.getPropertyPriority('display')]);
    for (const [m] of saved) m.style.setProperty('display', 'none', 'important');
    setTimeout(() => {
      for (const [m, value, priority] of saved) {
        if (value) m.style.setProperty('display', value, priority); else m.style.removeProperty('display');
      }
    }, 150);
  }
  addEventListener('scroll', () => moreCheck(), { passive: true });
  setInterval(nudge, 1000); // also while the mouse wheel is at the very bottom (no more scroll events there)

  /* ---------- Putting it together ---------- */
  function scan() {
    timer = 0;
    if (!document.body) return;
    const root = document.querySelector(ROOT);
    try { toolbar(root); } catch (e) { console.warn('[Bravely] pixiv top row:', e); }
    if (!root) return;
    const picPage = wallPage();
    let art = null, walls = [];
    try { if (picPage) art = artPage(root); } catch (e) { console.warn('[Bravely] pixiv artwork page:', e); }
    try { if (picPage) walls = findWalls(root, art && art.fig); } catch (e) { console.warn('[Bravely] pixiv walls:', e); }
    let own = null;
    try { own = moreSync(walls); } catch (e) { console.warn('[Bravely] pixiv more results:', e); }
    if (own) {
      const tiles = [...own.children].filter(c => c.querySelector('a[href*="/artworks/"]'));
      walls.push({ wall: own, tiles, links: new Map(tiles.map(c => [c, c.querySelector('a[href*="/artworks/"]')])) });
    }
    try {
      const keeps = new Set(walls.map(w => w.wall));
      if (art) { keeps.add(art.fig); for (const b of art.keep) keeps.add(b); }
      if (own && more.status) keeps.add(more.status);
      isolate(root, keeps, !own);
    } catch (e) { console.warn('[Bravely] pixiv page:', e); }
    try { layout(walls.filter(w => w.tiles.length)); } catch (e) { console.warn('[Bravely] pixiv wall:', e); }
    nudgeWalls = walls;
    moreCheck();
  }

  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'childList') {
        const t = r.target;
        if (t.nodeType === 1 && (t.id === 'pw-topics' || t.closest?.('#pw-topics, .pw-ov'))) continue;
        schedule(); return;
      }
      if (r.target.tagName === 'IMG') { schedule(); return; }
    }
  }).observe(html, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('popstate', schedule);
  schedule();
})();
