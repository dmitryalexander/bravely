const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('../manifest.json');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const saved = {}, requests = [], removals = [], network = [];
let grant = true, browserAllows = true;
const chrome = {
  runtime: {getManifest: () => manifest},
  storage: {local: {
    get: async defaults => ({...defaults, ...saved}),
    set: async values => Object.assign(saved, values)
  }},
  permissions: {
    contains: async () => browserAllows,
    request: origins => {requests.push(origins); return Promise.resolve(grant);},
    remove: async origins => {removals.push(origins); return true;}
  }
};
const context = vm.createContext({chrome, URL, fetch: async (url, opts) => {network.push({url, opts}); return {ok: true};}});
vm.runInContext(read('access.js'), context);
const access = context.BravelyAccess;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function submission(src, error) {
  const nodes = {msg: {}, 'access-options': {hidden: true, addEventListener() {}}};
  const redirects = [];
  vm.runInNewContext(read('submit.js'), {
    document: {getElementById: id => nodes[id]},
    location: {search: '?url=' + encodeURIComponent(src), replace: url => redirects.push(url)},
    URL, URLSearchParams, history: {length: 1},
    sessionStorage: {getItem: () => null}, window: {addEventListener() {}},
    BravelyAccess: {fetch: async () => {throw error;}}, chrome
  });
  await tick();
  return {nodes, redirects};
}
(async () => {
  assert.ok(!manifest.host_permissions.includes('https://*/*'));
  assert.ok(!manifest.host_permissions.some(origin => origin.includes('localhost') || origin.includes('127.0.0.1')));
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']);
  assert.equal(await access.state('web'), false);
  assert.equal(await access.state('local'), false);
  assert.equal(requests.length, 0, 'Loading/checking options never requests permission');
  for (const url of ['https://images.example.org/a.jpg', 'http://localhost:3001/image', 'http://127.0.0.1:3001/image']) {
    assert.equal(await access.canFetch(url), false, 'Old browser grants alone do not activate optional access');
    await assert.rejects(access.fetch(url), {name: 'BravelyAccessDenied'});
  }
  assert.equal(network.length, 0, 'Default-off requests never reach fetch');
  await access.resetUnselected();
  assert.equal(removals.length, 2, 'Upgrade removes unselected optional grants');
  for (const url of ['https://i.pinimg.com/a.jpg', 'https://images.wixmp.com/a.jpg', 'https://i.pximg.net/a.jpg', 'https://lens.google.com/a']) {
    assert.equal(await access.canFetch(url), true, 'Supported image sources work without optional access');
  }
  assert.equal(await access.canFetch('https://pinimg.com.evil.example/a'), false);
  assert.equal(await access.canFetch('https://username:password@i.pinimg.com/a'), false);
  grant = false;
  assert.equal(await access.enable('web'), false);
  assert.equal(await access.canFetch('https://images.example.org/a'), false, 'Declined requests stay off');
  grant = true;
  assert.equal(await access.enable('web'), true);
  assert.equal(await access.canFetch('https://images.example.org/a'), true);
  assert.equal(await access.canFetch('http://localhost:3001/image'), false, 'Web opt-in does not activate local access');
  assert.equal(await access.canFetch('https://localhost/image'), false);
  assert.equal(await access.canFetch('http://images.example.org/a'), false);
  await access.fetch('https://images.example.org/a', {redirect: 'follow'});
  assert.equal(network.at(-1).opts.redirect, 'error', 'Redirects cannot escape the origin permission check');
  browserAllows = false;
  assert.equal(await access.canFetch('https://images.example.org/a'), false, 'Browser revocation is respected');
  assert.equal(await access.state('web'), false);
  browserAllows = true;
  await access.disable('web');
  assert.equal(await access.canFetch('https://images.example.org/a'), false);
  assert.equal(await access.canFetch('https://i.pinimg.com/a'), true, 'Disabling extras preserves core sources');
  await access.enable('local');
  assert.equal(await access.canFetch('http://localhost:3001/image'), true);
  assert.equal(await access.canFetch('http://127.0.0.1:3015/image'), true);
  assert.equal(await access.canFetch('http://127.0.0.2/image'), false);
  await access.disable('local');
  assert.equal(await access.canFetch('http://localhost:3001/image'), false);
  const denied = new Error('Access is off.'); denied.name = 'BravelyAccessDenied';
  const blocked = await submission('https://images.example.org/a', denied);
  assert.equal(blocked.nodes['access-options'].hidden, false);
  assert.equal(blocked.redirects.length, 0, 'Denied access is not silently sent to Google');
  const localFailure = await submission('http://localhost:3001/image?private=path', new Error('Offline'));
  assert.equal(localFailure.redirects.length, 0, 'Failed local-image requests do not expose local URLs to Google');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {checked: false, value: '', handlers: {}, addEventListener(name, fn) {this.handlers[name] = fn;}});
    return elements.get(id);
  };
  chrome.permissions.onAdded = chrome.permissions.onRemoved = {addListener() {}};
  chrome.storage.sync = {get: (defaults, callback) => callback(defaults), set() {}};
  const beforeOptions = requests.length;
  vm.runInNewContext(read('options.js'), {document: {getElementById: element}, chrome, BravelyAccess: access});
  await tick();
  assert.equal(requests.length, beforeOptions, 'Options initialization does not prompt');
  assert.equal(element('access-web').checked, false);
  assert.equal(element('access-local').checked, false);
  grant = false;
  element('access-web').checked = true;
  element('access-web').handlers.change();
  assert.equal(requests.length, beforeOptions + 1, 'Request starts synchronously in the checkbox gesture');
  await tick();
  assert.equal(element('access-web').checked, false, 'Denied permission restores unchecked control');
  assert.match(element('access-status').textContent, /not granted/);
  grant = true;
  element('access-local').checked = true;
  element('access-local').handlers.change();
  await tick();
  assert.equal(element('access-local').checked, true);
  element('access-local').checked = false;
  element('access-local').handlers.change();
  await tick();
  assert.equal(element('access-local').checked, false);
  const get = chrome.storage.local.get, set = chrome.storage.local.set;
  chrome.storage.local.get = async () => {throw Error('Storage unavailable');};
  assert.equal(await access.canFetch('https://images.example.org/a'), false, 'Storage failures deny extra access');
  chrome.storage.local.get = get;
  chrome.storage.local.set = async () => {throw Error('Storage full');};
  const beforeFailure = removals.length;
  await assert.rejects(access.enable('web'), /Storage full/);
  await assert.rejects(access.disable('local'), /Storage full/);
  assert.equal(removals.length, beforeFailure + 2, 'Failed settings writes still revoke optional grants');
  chrome.storage.local.set = set;
  console.log('PASS: default-off access, options gestures/denial/revocation, upgrade reset, storage failures, network boundaries and local privacy.');
})().catch(error => {console.error(error); process.exitCode = 1;});
