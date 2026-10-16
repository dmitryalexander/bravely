/* Bravely look for Pinterest: dark page, 4px image wall, no side bar, nothing under the pins.
   The styles are in pinterest-look.css and apply while <html> has the "pw-pinless" class.
   Ctrl+Shift+X switches the look off/on. The page reloads, because Pinterest measures its tiles once.
   The extension's options page has the same switch. */
(() => {
  'use strict';
  const CLS = 'pw-pinless', CACHE = 'pwPinlessLook';
  const root = document.documentElement;

  // Set the class before Pinterest draws anything. localStorage is a fast copy of the saved setting.
  let on = true;
  try { on = localStorage.getItem(CACHE) !== 'off'; } catch (_) {}
  root.classList.toggle(CLS, on);

  const remember = v => { try { localStorage.setItem(CACHE, v ? 'on' : 'off'); } catch (_) {} };
  function apply(v, reload) {
    if (v === on) return;
    on = v;
    remember(v);
    root.classList.toggle(CLS, v);
    if (reload) location.reload();
  }
  try {
    chrome.storage.sync.get({ pinlessLook: true }, s => {
      const v = s.pinlessLook !== false;
      remember(v);
      apply(v, !!document.querySelector('[data-grid-item]'));
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.pinlessLook) apply(changes.pinlessLook.newValue !== false, true);
    });
  } catch (_) {}

  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyX')) return;
    if (e.repeat || e.composedPath().some(el => el.isContentEditable || el.matches?.('input, textarea, select, [role="textbox"]'))) return;
    e.preventDefault(); e.stopPropagation();
    const v = !on;
    on = v;
    remember(v);
    let done = false;
    const go = () => { if (!done) { done = true; location.reload(); } };
    try { chrome.storage.sync.set({ pinlessLook: v }, go); } catch (_) {}
    setTimeout(go, 500);
  }, true);

  // The side bar is hidden, so nothing should keep leaving room for it.
  // The CSS handles Pinterest's usual inline spacing; this catches spacing set in other ways.
  function navWidth() {
    const nav = document.getElementById('VerticalNavContent');
    return nav ? Math.round(nav.getBoundingClientRect().width) : 0;
  }
  function neutralize(el, px) {
    if (!el || el.nodeType !== 1 || el.closest('#VerticalNavContent')) return false;
    const cs = getComputedStyle(el);
    let changed = false;
    if (cs.paddingLeft === px) { el.style.setProperty('padding-left', '0px', 'important'); changed = true; }
    if (cs.marginLeft === px) { el.style.setProperty('margin-left', '0px', 'important'); changed = true; }
    if (cs.position === 'fixed' && cs.left === px) { el.style.setProperty('left', '0px', 'important'); changed = true; }
    return changed;
  }
  let timer = 0;
  function fix() {
    timer = 0;
    if (!on || !document.body) return;
    const w = navWidth();
    if (w < 40 || w > 160) return;
    const px = w + 'px';
    let changed = false;
    for (const el of document.querySelectorAll('[style*="' + px + '"]')) changed = neutralize(el, px) || changed;
    for (const sel of ['[data-test-id="masonry-container"]', '#searchBoxContainer', '[data-test-id="header"]']) {
      let el = document.querySelector(sel);
      for (let i = 0; el && el !== document.body && i < 30; i++, el = el.parentElement) changed = neutralize(el, px) || changed;
    }
    // Let Pinterest re-measure the now wider page.
    if (changed) window.dispatchEvent(new Event('resize'));
  }
  const schedule = () => { if (!timer) timer = setTimeout(fix, 400); };
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', schedule, { passive: true });
})();
