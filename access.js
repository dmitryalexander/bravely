/* Extra network access is local to this installation and disabled until explicitly enabled. */
globalThis.BravelyAccess = (() => {
  'use strict';
  const groups = {
    web: {key: 'bravelyAccessWeb', origins: ['https://*/*']},
    local: {key: 'bravelyAccessLocal', origins: ['http://localhost/*', 'http://127.0.0.1/*']}
  };
  const loopback = host => host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '[::1]';
  function matches(pattern, url) {
    const match = pattern.match(/^(https?):\/\/(\*\.)?([^/]+)\/\*$/);
    return !!match && url.protocol === match[1] + ':' &&
      (url.hostname === match[3] || (!!match[2] && url.hostname.endsWith('.' + match[3])));
  }
  async function canFetch(raw) {
    let url;
    try { url = new URL(raw); } catch (_) { return false; }
    if (url.username || url.password) return false;
    const local = loopback(url.hostname);
    if (local && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return false;
    const required = !local && chrome.runtime.getManifest().host_permissions.some(pattern => matches(pattern, url));
    try {
      if (!required) {
        const group = local ? groups.local : url.protocol === 'https:' ? groups.web : null;
        if (!group) return false;
        const saved = await chrome.storage.local.get({[group.key]: false});
        if (saved[group.key] !== true) return false;
      }
      return await chrome.permissions.contains({origins: [url.origin + '/*']});
    } catch (_) { return false; }
  }
  async function guardedFetch(url, options = {}) {
    if (!await canFetch(url)) {
      const error = new Error('Access to this image source is off. Check Bravely options or your browser site-access settings.');
      error.name = 'BravelyAccessDenied';
      throw error;
    }
    // A permitted source must not silently redirect a request into an unapproved origin.
    return fetch(url, {...options, redirect: 'error'});
  }
  async function state(name) {
    const group = groups[name];
    try {
      const saved = await chrome.storage.local.get({[group.key]: false});
      return saved[group.key] === true && await chrome.permissions.contains({origins: group.origins});
    } catch (_) { return false; }
  }
  // Called only from the options checkbox's user gesture, never on page load or network failure.
  function enable(name) {
    const group = groups[name];
    return chrome.permissions.request({origins: group.origins}).then(async granted => {
      try { await chrome.storage.local.set({[group.key]: granted}); }
      catch (error) {
        await chrome.permissions.remove({origins: group.origins});
        throw error;
      }
      return granted;
    });
  }
  async function disable(name) {
    const group = groups[name];
    try { await chrome.storage.local.set({[group.key]: false}); }
    finally { await chrome.permissions.remove({origins: group.origins}); }
  }
  async function resetUnselected() {
    // Upgrades may retain a formerly required host grant. Do not treat it as an opt-in.
    for (const name of Object.keys(groups)) {
      const group = groups[name];
      const saved = await chrome.storage.local.get({[group.key]: false});
      if (saved[group.key] !== true) await chrome.permissions.remove({origins: group.origins});
    }
  }
  return {canFetch, fetch: guardedFetch, state, enable, disable, resetUnselected};
})();
