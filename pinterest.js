/* Pinterest wall: red strip = full-size image in a new tab, blue strip = that image in Google Lens.
   One floating overlay follows the hovered pin image (robust against Pinterest's DOM changes).
   Ctrl+Shift+Z: Pinterest visual search only; the crop source never gets our strips. */
(() => {
  'use strict';
  const MIN_W = 120, MIN_H = 80;
  // Pinterest varies its test IDs between layouts. Recognize only the unwanted
  // native actions inside pin cards; keep image links and our Lens strips intact.
  const cards = '[data-grid-item], [data-test-id="pinWrapper"], [data-test-id="pin"], [data-test-id="CloseupMainPin"], [data-test-id="closeup-body-style"]';
  function quietNativeActions() {
    document.querySelectorAll(cards).forEach(card => {
      card.querySelectorAll('button, [role="button"], a').forEach(control => {
        if (control.closest('.pw-ov') || control.querySelector('img, video')) return;
        const labels = [control.getAttribute('aria-label'), control.getAttribute('title'), control.textContent];
        const unwanted = labels.some(label => /^(save(?: pin| to .*)?|saved|visit (?:site|website)|share(?: pin| this pin)?|send(?: pin| this pin)?)$/i.test((label || '').replace(/\s+/g, ' ').trim()));
        control.toggleAttribute('data-pw-native-action', unwanted);
      });
    });
  }
  let actionsFrame = 0;
  const scheduleActions = () => {
    if (!actionsFrame) actionsFrame = requestAnimationFrame(() => {actionsFrame = 0; quietNativeActions();});
  };
  new MutationObserver(scheduleActions).observe(document.documentElement, {
    childList:true, subtree:true, characterData:true, attributes:true,
    attributeFilter:['aria-label','title','data-test-id']
  });
  scheduleActions();
  let mouse = { x: -1, y: -1 }, cur = null, raf = 0;
  const PENDING = 'pw-pinterest-visual-search';
  const pinPath = () => {const match = location.pathname.match(/^\/pin\/(\d+)(?:\/|$)/); return match ? '/pin/' + match[1] + '/' : null;};
  const visualSearch = () => /^\/pin\/\d+\/visual-search(?:\/|$)/.test(location.pathname);
  let launching = false, launchTimer = 0;

  function pinLink(img) {
    const tile = img?.closest('[data-grid-item], [data-test-id="pinWrapper"], [data-test-id="pin"]');
    const link = img?.closest('a[href]') || tile?.querySelector('a[href*="/pin/"]');
    if (!link) return null;
    try {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/^\/pin\/\d+\/?$/.test(url.pathname)) return null;
      url.pathname = url.pathname.replace(/\/?$/, '/'); return url;
    } catch (_) { return null; }
  }
  function cropSource(img) {
    if (!visualSearch() && !launching) return false;
    // Results link to other pins. The editable source and header thumbnail do not.
    // This also works when crop handles cover the image in elementsFromPoint().
    const link = pinLink(img);
    return !link || link.pathname === pinPath();
  }
  function typing(e) {
    return e.composedPath().some(el => el.isContentEditable || el.matches?.('input, textarea, select, [role="textbox"]'));
  }
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
  function openVisualSearch() {
    const scope = document.querySelector('[data-test-id="CloseupMainPin"], [data-test-id="closeup-body-style"], [data-test-id="closeup-body"]') || document;
    const candidates = scope.querySelectorAll('[data-test-id="visual-search-icon"], [data-test-id="visual-search-button"], [data-test-id="pin-visual-search-button"], button[aria-label], [role="button"][aria-label], svg[aria-label], button[title]');
    const icon = [...candidates].find(el => {
      if (!el.getClientRects().length || el.closest('.pw-ov')) return false;
      const known = /^visual-search-(icon|button)$|^pin-visual-search-button$/.test(el.getAttribute('data-test-id') || '');
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      const button = el.closest('button, [role="button"]') || el;
      return !button.disabled && button.getAttribute('aria-disabled') !== 'true' && (known || /^(visual search|search (visually|image|similar|this image)|find similar(?: products| images)?)$/i.test(label.trim()));
    });
    if (!icon) return false;
    launching = true; cur = null; ov.hidden = true;
    clearTimeout(launchTimer);
    launchTimer = setTimeout(() => { launching = false; sched(); }, 5000);
    (icon.closest('button, [role="button"]') || icon).click();
    return true;
  }
  let searchWait = 0;
  function waitForVisualSearch(path) {
    clearTimeout(searchWait);
    const deadline = Date.now() + 12000;
    notice('Opening visual search for this pin…');
    const attempt = () => {
      if (pinPath() !== path || visualSearch()) return;
      if (openVisualSearch()) {const message = document.getElementById('pw-search-notice'); if (message) message.hidden = true; return;}
      if (Date.now() < deadline) searchWait = setTimeout(attempt, 250);
      else notice('Could not find this pin’s visual-search button. Try its magnifying glass.');
    };
    attempt();
  }

  const ov = document.createElement('div');
  ov.className = 'pw-ov'; ov.hidden = true;
  const full = document.createElement('a');
  full.className = 'pw-full'; full.target = '_blank'; full.rel = 'noopener noreferrer';
  full.setAttribute('aria-label', 'Open the full-size image in a new tab');
  const lens = document.createElement('a');
  lens.className = 'pw-lens'; lens.target = '_blank'; lens.rel = 'noopener noreferrer';
  lens.setAttribute('aria-label', 'Search this image with Google Lens (opens a new tab)');
  ov.append(full, lens);
  const mount = () => { if (!ov.isConnected) (document.body || document.documentElement).appendChild(ov); };

  const isPinimg = src => { try { return /(^|\.)pinimg\.com$/.test(new URL(src, location.href).hostname); } catch (_) { return false; } };
  function sized(src, size) {
    try {
      const u = new URL(src, location.href);
      u.pathname = u.pathname.replace(/\/(?:\d+x\d*|originals)\//, '/' + size + '/');
      return u.href;
    } catch (_) { return src; }
  }
  function best(img) { // largest srcset entry (4x = originals) else currentSrc
    const set = img.getAttribute('srcset');
    if (set) {
      const hit = set.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]).pop();
      if (hit) { try { return new URL(hit[0], location.href).href; } catch (_) {} }
    }
    return img.currentSrc || img.src;
  }
  const lensURL = img => 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(isPinimg(img.currentSrc || img.src) ? sized(img.currentSrc || img.src, '736x') : (img.currentSrc || img.src));
  function candidates(img) {
    const src = img.currentSrc || img.src;
    if (!isPinimg(src)) return [best(img)];
    const b = best(img);
    return [sized(b, 'originals'), sized(b, '1200x'), sized(b, '736x')];
  }

  function okImg(img) {
    if (!img || img.tagName !== 'IMG' || !(img.currentSrc || img.src)) return false;
    if (cropSource(img)) return false;
    if (img.closest('header, [data-test-id="header"], [data-test-id="unauth-header"], [data-test-id*="avatar"], [data-test-id="user-avatar"], nav, [role="navigation"]')) return false;
    const r = img.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    return isPinimg(img.currentSrc || img.src) || !!img.closest('[data-grid-item], [data-test-id="pin"], [data-test-id="pinWrapper"], [data-test-id="closeup-body"]');
  }
  function findImg(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === ov || ov.contains(el)) continue;
      if (el.tagName === 'IMG' && okImg(el)) return el;
      const tile = el.closest && el.closest('[data-grid-item], [data-test-id="pinWrapper"], [data-test-id="pin-closeup-image"]');
      if (tile) {
        for (const im of tile.querySelectorAll('img')) {
          if (!okImg(im)) continue;
          const r = im.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return im;
        }
      }
    }
    return null;
  }
  function place() {
    raf = 0;
    mount();
    const over = ov.matches(':hover');
    let img = cur && cur.isConnected && okImg(cur) ? cur : null;
    if (!over || !img) img = findImg(mouse.x, mouse.y);
    if (img) {
      const r = img.getBoundingClientRect();
      if (over || (mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom)) {
        cur = img;
        Object.assign(ov.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        lens.href = lensURL(img);
        full.href = best(img);
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
    const src = cur.currentSrc || cur.src;
    if (!isPinimg(src)) { window.open(best(cur), '_blank', 'noopener'); return; }
    try { chrome.runtime.sendMessage({ type: 'openPinFull', candidates: candidates(cur), thumb: src }); }
    catch (_) { window.open(best(cur), '_blank', 'noopener'); }
  });
  lens.addEventListener('click', e => {
    if (cur && okImg(cur)) lens.href = lensURL(cur); else e.preventDefault();
    e.stopPropagation();
  });
  // keep Pinterest from reacting to presses on our strips
  for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick']) ov.addEventListener(t, e => e.stopPropagation());

  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyZ')) return;
    if (typing(e) || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    const link = pinLink(findImg(mouse.x, mouse.y));
    // Resolve the hovered related pin BEFORE using the current page's pin.
    // A full navigation reliably carries the request to that image's closeup.
    if (link && link.pathname !== pinPath()) {
      clearTimeout(searchWait);
      try { sessionStorage.setItem(PENDING, JSON.stringify({ path: link.pathname, time: Date.now() })); }
      catch (_) { notice('Open the pin, then press Ctrl + Shift + Z'); return; }
      location.assign(link.href); return;
    }
    if (visualSearch()) { location.assign(pinPath()); return; }
    if (pinPath()) {waitForVisualSearch(pinPath()); return;}
    notice('Hover over a Pinterest image first');
  }, true);

  // Resume the shortcut after opening the hovered pin, waiting for Pinterest's controls.
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING)); sessionStorage.removeItem(PENDING); } catch (_) {}
  if (pending && pending.path === pinPath() && Date.now() - pending.time >= 0 && Date.now() - pending.time < 60000) waitForVisualSearch(pending.path);
})();
