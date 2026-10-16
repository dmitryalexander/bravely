/* pixiv picture shapes (Bravely 0.12). Runs inside the pixiv page itself (MAIN world), before pixiv's
   own scripts. pixiv sends the width and height of every work along with its lists (home, search,
   rankings, related works, ...). This file reads them from pixiv's own answers, without changing them,
   and hands them to pixiv-look.js, so each picture gets its real shape in the wall before it has loaded.
   It also tells pixiv-look.js which address pixiv used for a page of search results, so the next pages
   can be asked for the same way. Nothing is sent anywhere else. */
(() => {
  'use strict';
  if (window.pwPxData) return;
  const known = Object.create(null); // work id -> [width, height] of its first picture
  let pending = null, timer = 0;
  const send = (type, data) => {
    try { document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) })); } catch (_) {}
  };
  function flush() { timer = 0; if (pending) { const batch = pending; pending = null; send('pw-px-shapes', batch); } }
  function record(id, w, h) {
    if (!id || !(w > 0) || !(h > 0)) return;
    const old = known[id];
    if (old && old[0] === w && old[1] === h) return;
    known[id] = [w, h];
    (pending || (pending = Object.create(null)))[id] = [w, h];
    if (!timer) timer = setTimeout(flush, 30);
  }

  // The work a picture address belongs to, only for its first picture (_p0, or none for animations).
  const ID_IN_URL = /\/(?:img-master|custom-thumb|img-original)\/img\/[\d/]+\/(\d+)(?:_p(\d+))?[_.]/;
  function firstUrl(o) {
    if (typeof o.url === 'string') return o.url;
    const u = o.urls;
    if (u && typeof u === 'object') for (const k in u) if (typeof u[k] === 'string') return u[k];
    return '';
  }
  // Any object with a width and a height that belongs to a work: its pictures' addresses say which.
  function harvest(o, depth) {
    if (!o || typeof o !== 'object' || depth > 40) return;
    if (Array.isArray(o)) { for (const x of o) harvest(x, depth + 1); return; }
    const w = +o.width, h = +o.height;
    if (w > 0 && h > 0) {
      const m = firstUrl(o).match(ID_IN_URL);
      if (m) { if (!m[2] || m[2] === '0') record(m[1], w, h); }
      else if (o.id != null && o.illustType != null) record(String(o.id), w, h);
    }
    for (const k in o) { const v = o[k]; if (v && typeof v === 'object') harvest(v, depth + 1); }
  }

  // pixiv's own requests: its JSON answers (ajax) and the data of pages it opens without reloading.
  const LIST = /^\/ajax\/(?:search\/(?:artworks|illustrations|manga)\/|follow_latest\/illust|user\/\d+\/illusts\/bookmarks)/;
  function wanted(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin || !/^\/(?:ajax|touch\/ajax|_next\/data)\//.test(u.pathname)) return null;
      return u;
    } catch (_) { return null; }
  }
  let lastList = null;
  function seen(u, data) {
    harvest(data, 0);
    if (LIST.test(u.pathname)) send('pw-px-list', lastList = { url: u.href, page: location.href });
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    const fetch = function (input) {
      const p = nativeFetch.apply(this, arguments);
      try {
        const u = wanted(typeof input === 'string' ? input : (input && input.url) || String(input));
        if (u) p.then(res => {
          if (!res || !res.ok || !/json/i.test(res.headers.get('content-type') || '')) return;
          res.clone().json().then(d => seen(u, d), () => {});
        }, () => {});
      } catch (_) {}
      return p;
    };
    try { Object.defineProperty(fetch, 'toString', { value: () => nativeFetch.toString() }); } catch (_) {}
    window.fetch = fetch;
  }

  const urls = new WeakMap();
  const open = XMLHttpRequest.prototype.open, sendXhr = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { urls.set(this, String(url)); } catch (_) {}
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      const u = wanted(urls.get(this) || '');
      if (u) this.addEventListener('load', () => {
        try {
          if (this.status !== 200) return;
          let d = null;
          if (this.responseType === 'json') d = this.response;
          else if (!this.responseType || this.responseType === 'text') {
            const t = this.responseText;
            if (t && /^\s*[{[]/.test(t)) d = JSON.parse(t);
          }
          if (d) seen(u, d);
        } catch (_) {}
      });
    } catch (_) {}
    return sendXhr.apply(this, arguments);
  };

  // Data written into the page itself (pages pixiv draws on its server).
  function embedded() {
    for (const el of document.querySelectorAll('script#__NEXT_DATA__, meta#meta-preload-data, meta[name="preload-data"]')) {
      try { harvest(JSON.parse(el.tagName === 'META' ? el.getAttribute('content') : el.textContent), 0); } catch (_) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', embedded); else embedded();

  // pixiv-look.js may start after some answers came in: it asks once for everything known so far.
  document.addEventListener('pw-px-hello', () => {
    flush(); send('pw-px-shapes', known);
    if (lastList) send('pw-px-list', lastList);
  });
  window.pwPxData = { harvest, known };
})();
