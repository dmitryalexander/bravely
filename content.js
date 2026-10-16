/* Bravely: turn Google Lens "Visual matches" into an image wall. Visual matches only. */
(() => {
  'use strict';
  let DEBUG = false;
  try { chrome.storage.sync.get({ debug: false }, v => { DEBUG = !!v.debug; }); } catch (_) {}
  const log = (...a) => DEBUG && console.log('[Bravely]', ...a);
  const params = new URLSearchParams(location.search);
  const isGoogleHost = h => /(^|\.)google\.[a-z.]+$/.test(h) || /(^|\.)gstatic\.com$/.test(h);

  // Only act on Lens result pages (not ordinary web searches).
  const isLens = location.hostname === 'lens.google.com' || params.has('vsrid') || params.has('lns_vfs');
  if (!isLens) return;

  // 1) Land on the Visual matches tab (udm=44), never All / Exact matches.
  if (params.get('udm') !== '44') {
    const goVisual = () => {
      const a = [...document.querySelectorAll('a[href*="udm=44"]')].find(x => /visual/i.test(x.textContent));
      if (a) { location.replace(a.href); return true; }
      return false;
    };
    if (!goVisual()) {
      const mo = new MutationObserver(() => { if (goVisual()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
    }
    return;
  }

  // 2) Build the wall.
  const root = document.createElement('div');
  root.id = 'lw-root';
  root.innerHTML = '<div id="lw-bar"><h1>Visual matches</h1><button type="button" id="lw-google">Google view</button></div><div id="lw-crop" hidden><img id="lw-crop-thumb" alt="" hidden><div id="lw-crop-text"><strong>Search area</strong><span>Choose which part of the image is searched · Ctrl+Shift+Z</span></div><button type="button" id="lw-crop-go" title="Ctrl+Shift+Z">Adjust search area</button></div><div id="lw-grid"></div><div id="lw-status" role="status">Looking for matches…</div>';
  document.documentElement.append(root);
  const grid = root.querySelector('#lw-grid');
  const status = root.querySelector('#lw-status');
  let version = '';
  try { version = chrome.runtime.getManifest().version; } catch (_) {}
  const LOOKING = 'Looking for matches\u2026' + (version ? '  (Bravely ' + version + ')' : '');
  status.textContent = LOOKING;

  const toggle = document.createElement('button');
  toggle.id = 'lw-toggle'; toggle.type = 'button'; toggle.textContent = 'Wall'; toggle.hidden = true;
  document.documentElement.append(toggle);
  function setWall(on) {
    root.hidden = !on; toggle.hidden = on;
    document.documentElement.style.overflow = on ? 'hidden' : '';
    if (!on) window.scrollTo(0, 0);
    try { sessionStorage.setItem('lw-wall', on ? '1' : '0'); } catch (_) {}
  }
  root.querySelector('#lw-google').addEventListener('click', () => setWall(false));
  toggle.addEventListener('click', () => closeEditor());
  let wanted = true;
  try { wanted = sessionStorage.getItem('lw-wall') !== '0'; } catch (_) {}
  setWall(wanted);


  // 2b) Search area: Google's own editor does the cropping and updates the results in place.
  // We open it, then rebuild the wall from the new results when you come back.
  let editorUsed = false;
  function thumbImg() {
    return [...document.images].find(i => !root.contains(i) && i.closest('form, [role="search"]') && (i.currentSrc || i.src) && i.width <= 120);
  }
  function editButton() {
    const labelled = [...document.querySelectorAll('[aria-label], [data-tooltip], [title]')].find(e =>
      !root.contains(e) && /edit visual search/i.test(e.getAttribute('aria-label') || e.getAttribute('data-tooltip') || e.getAttribute('title') || ''));
    if (labelled) return labelled;
    const t = thumbImg();
    return t ? (t.closest('[role="button"], button, [tabindex]') || t) : null;
  }
  // The search-area bar stays hidden; Ctrl+Shift+Z (below) opens Google's editor.
  function openEditor() {
    const btn = editButton();
    if (!btn) return;
    editorUsed = true;
    root.hidden = true; toggle.hidden = false;
    document.documentElement.style.overflow = '';
    try { sessionStorage.setItem('lw-wall', '1'); } catch (_) {}
    window.scrollTo(0, 0);
    btn.click();
  }
  function closeEditor() {
    if (editorUsed) { editorUsed = false; resetWall(); }
    setWall(true);
  }
  root.querySelector('#lw-crop-go').addEventListener('click', openEditor);
  // Ctrl+Shift+Z toggles between the wall and Google's search-area editor.
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyZ')) return;
    e.preventDefault(); e.stopPropagation();
    if (!root.hidden) openEditor();
    else if (editorUsed) closeEditor();
    else openEditor();
  }, true);

  let idleScans = 0;
  const seen = new Set();
  function resetWall() { grid.textContent = ''; seen.clear(); idleScans = 0; status.textContent = LOOKING; root.scrollTop = 0; }

  const isHttp = u => typeof u === 'string' && /^https?:\/\//i.test(u);
  function unwrap(href) {
    try {
      const u = new URL(href, location.href);
      if (isGoogleHost(u.hostname)) {
        // Older results link through /url?url=<real address>. Since October 2026 they link through
        // /goto?url=<token>: only Google can turn the token into the address, so the link is kept as is.
        if (u.pathname === '/url') { const t = u.searchParams.get('url') || u.searchParams.get('q'); return isHttp(t) && !isGoogleHost(new URL(t).hostname) ? t : null; }
        if (u.pathname === '/goto' && u.searchParams.get('url')) return u.href;
        return null;
      }
      return /^https?:$/.test(u.protocol) ? u.href : null;
    } catch (_) { return null; }
  }
  const viaGoogle = url => { try { return isGoogleHost(new URL(url).hostname); } catch (_) { return false; } };

  // Google keeps each result's real page address and full-size image in inline data, under ids
  // that also appear on the result's elements:
  // "KEY":[0,"ID",[thumbnail,w,h],[full image,w,h],null,0,{"2003":[null,id,page,title,...]}]
  const results = new Map();
  const readLength = new WeakMap();
  function arrayEnd(t, i) {
    let depth = 0, str = false;
    for (let j = i, n = Math.min(t.length, i + 30000); j < n; j++) {
      const c = t[j];
      if (str) { if (c === '\\') j++; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '[' || c === '{') depth++;
      else if ((c === ']' || c === '}') && --depth === 0) return j + 1;
    }
    return -1;
  }
  function readResultData() {
    for (const s of document.scripts) {
      const t = s.textContent || '';
      if (readLength.get(s) === t.length) continue; // read already (re-read if it was still loading)
      readLength.set(s, t.length);
      if (t.indexOf('"2003":[') < 0) continue;
      const re = /"([\w-]{6,80})":\[0,"/g;
      let m;
      while ((m = re.exec(t))) {
        const start = m.index + m[0].length - 4;
        const end = arrayEnd(t, start);
        if (end < 0) continue;
        re.lastIndex = end;
        let a;
        try { a = JSON.parse(t.slice(start, end)); } catch (_) { continue; }
        const meta = a.find(x => x && typeof x === 'object' && !Array.isArray(x) && Array.isArray(x['2003']));
        const info = meta ? meta['2003'] : [];
        const page = info.find(isHttp);
        if (!page || !Array.isArray(a[2]) || !isHttp(a[2][0])) continue;
        const r = { page, title: typeof info[3] === 'string' ? info[3] : '', thumb: a[2][0], full: Array.isArray(a[3]) && isHttp(a[3][0]) ? a[3][0] : null };
        results.set(m[1], r);
        if (typeof a[1] === 'string') results.set(a[1], r);
      }
    }
  }
  function resultFor(img) {
    let el = img;
    for (let i = 0; i < 10 && el && el !== document.body; i++, el = el.parentElement) {
      if (el.querySelectorAll('img').length > 3) break; // stepped out of this result's card
      for (const name of ['jsdata', 'data-im']) {
        const v = el.getAttribute(name);
        if (!v) continue;
        for (const tok of v.split(/[\s;,"[\]]+/)) { const r = tok && results.get(tok); if (r) return r; }
      }
    }
    return null;
  }

  function linkFor(img) {
    let el = img;
    for (let i = 0; i < 7 && el && el !== document.body; i++, el = el.parentElement) {
      const own = el.closest && el.closest('a[href]');
      if (own && !root.contains(own)) { const u = unwrap(own.getAttribute('href')); if (u) return { url: u, el: own, a: own }; }
      if (el.querySelectorAll) {
        for (const a of el.querySelectorAll('a[href]')) {
          if (root.contains(a)) continue;
          const u = unwrap(a.getAttribute('href'));
          if (u) return { url: u, el, a };
        }
      }
    }
    return null;
  }

  function scan() {
    readResultData();
    let added = 0;
    for (const img of document.images) {
      if (root.contains(img) || img.closest('[role="search"], header, form')) continue;
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (w < 90 || h < 90) continue;
      const src = img.currentSrc || img.src;
      if (!src || /^data:image\/gif;base64,R0lGODlhAQAB/.test(src)) continue;
      const r = resultFor(img);
      const found = r ? null : linkFor(img);
      if (!r && !found) continue;
      const url = r ? r.page : found.url;
      if (seen.has(url)) continue;
      seen.add(url);
      added++;
      if (DEBUG) console.log('[Bravely] card', url, r || (found.el.outerHTML || '').slice(0, 4000));
      let title = (img.alt || '').trim(), site = '';
      if (r) title = r.title || title;
      else if (viaGoogle(url)) {
        const lines = ((found.a && found.a.innerText) || '').split('\n').map(x => x.trim()).filter(Boolean);
        site = lines[0] || ''; title = lines.slice(1).join(' ') || title;
      } else title = (found.el.getAttribute?.('aria-label') || title).trim();
      const webThumb = /^https:/.test(src) ? src : (r && r.thumb) || null;
      addTile(src, url, w, h, title, r ? r.full : findHint(found.el), { site, webThumb });
    }
    if (added) status.textContent = '';
    return added;
  }

  const fullHints = new WeakMap();
  function hintFull(tile) { return fullHints.get(tile) || null; }
  function findHint(el) {
    try {
      const html = (el.outerHTML || '').slice(0, 60000);
      const m = html.match(/https:\/\/[^"'\s<>\\]+?\.(?:jpe?g|png|webp|gif)(?:\?[^"'\s<>\\]*)?/gi) || [];
      return m.find(u => { try { return !isGoogleHost(new URL(u).hostname); } catch (_) { return false; } }) || null;
    } catch (_) { return null; }
  }

  function addTile(src, url, w, h, title, hint, extra = {}) {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}
    if (viaGoogle(url)) host = extra.site || 'result';
    const webSrc = extra.webThumb || (/^https:/.test(src) ? src : null);
    const tile = document.createElement('div');
    tile.className = 'lw-tile';
    const im = document.createElement('img');
    im.src = src; im.alt = title; im.loading = 'lazy';
    if (w && h) { im.width = w; im.height = h; }
    tile.append(im);

    // Top 10%: full-size image in a new tab (rose border). Next 10%: this image in Lens (blue). Rest: open the source page.
    const dl = document.createElement('a');
    dl.className = 'lw-act lw-dl'; dl.href = webSrc || src; dl.target = '_blank'; dl.rel = 'noopener noreferrer';
    dl.setAttribute('aria-label', 'Open the full-size image in a new tab');
    dl.addEventListener('click', e => {
      e.preventDefault();
      try { chrome.runtime.sendMessage({ type: 'openFull', thumb: webSrc || src, page: url, hint: hintFull(tile) }); }
      catch (_) { window.open(webSrc || src, '_blank', 'noopener'); }
    });
    tile.append(dl);

    if (webSrc) {
      const lens = document.createElement('a');
      lens.className = 'lw-act lw-lens';
      lens.href = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(webSrc);
      lens.target = '_blank'; lens.rel = 'noopener noreferrer';
      lens.setAttribute('aria-label', 'Search this image with Google Lens (opens a new tab)');
      tile.append(lens);
    }

    const open = document.createElement('a');
    open.className = 'lw-act lw-open' + (tile.querySelector('.lw-lens') ? '' : ' lw-open-tall');
    open.href = url; open.target = '_blank'; open.rel = 'noopener noreferrer';
    open.setAttribute('aria-label', 'Open ' + (host || 'source page'));
    tile.append(open);

    const label = document.createElement('span');
    label.className = 'lw-label';
    label.textContent = host;
    tile.append(label);
    if (hint) fullHints.set(tile, hint);
    grid.append(tile);
  }

  // When Lens fails (for example it can't download the image), show Google's message instead of waiting.
  function googleError() {
    const text = (document.body && document.body.innerText) || '';
    const m = text.match(/No image at the URL[^\n]*/i) || text.match(/(?:Something went wrong|couldn['\u2019]t (?:load|process|search) (?:this|the) image)[^\n]*/i);
    return m ? m[0].trim() : null;
  }

  // 3) Keep Google's own results loading underneath by scrolling the hidden page.
  function loadMore() {
    if (root.hidden) return;
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (const b of document.querySelectorAll('button, [role="button"]')) {
      if (!root.contains(b) && /^(show|see|more)\b.*(results|matches|more)?$/i.test((b.textContent || '').trim()) && b.offsetParent) { b.click(); break; }
    }
  }
  root.addEventListener('scroll', () => {
    if (root.scrollTop + root.clientHeight > root.scrollHeight - 1200) loadMore();
  }, { passive: true });

  setInterval(() => {
    const n = scan();
    idleScans = n ? 0 : idleScans + 1;
    if (root.hidden) return;
    const err = grid.children.length ? null : googleError();
    if (err) {
      status.textContent = 'Google Lens couldn\u2019t search this image: ' + err + ' Use "Google view" to see Google\u2019s page.';
    } else if (!grid.children.length && idleScans > 12) {
      status.textContent = 'No visual matches found. Use "Google view" to see the original page.';
    } else if (grid.children.length && root.scrollHeight <= root.clientHeight + 1200) {
      loadMore(); // short wall: pull more so it can scroll
    }
  }, 1000);
  log('wall ready');
})();
