const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(manifest.name, 'Bravely');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, require('../package.json').version);
assert.ok(manifest.description.length <= 132, 'Manifest description exceeds Chrome limit');
const entries = [manifest.background.service_worker, manifest.options_ui.page,
  ...manifest.content_scripts.flatMap(s => [...(s.js || []), ...(s.css || [])]),
  ...manifest.web_accessible_resources.flatMap(r => r.resources)];
for (const file of entries) {
  assert.ok(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), `Unsafe manifest path: ${file}`);
  assert.ok(fs.statSync(path.join(root, file)).isFile(), `Missing runtime file: ${file}`);
}
for (const html of ['options.html', 'submit.html']) {
  const text = fs.readFileSync(path.join(root, html), 'utf8');
  for (const match of text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `Missing page script: ${match[1]}`);
  }
}
function run(args) {
  const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const file of fs.readdirSync(root).filter(file => file.endsWith('.js'))) run(['--check', file]);
for (const file of fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.cjs')).sort()) run([path.join('tests', file)]);
console.log('Bravely: manifest, runtime files, JavaScript syntax and all local checks pass.');
