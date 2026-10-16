// Local checks for the pixiv picture addresses (pixiv-images.js) and the shape reader (pixiv-data.js).
// Run: node check-pixiv.cjs   (no network; the addresses below follow pixiv's real patterns)
const assert = require('assert');
const fs = require('fs');
globalThis.self = globalThis;
globalThis.location = { href: 'https://www.pixiv.net/en/', origin: 'https://www.pixiv.net' };
eval(fs.readFileSync(__dirname + '/../pixiv-images.js', 'utf8'));
const I = self.pwPxImages;

const H = 'https://i.pximg.net';
const square = H + '/c/250x250_80_a2/img-master/img/2026/10/05/23/28/02/150502944_p0_square1200.jpg';
const custom = H + '/c/540x540_70/custom-thumb/img/2026/10/05/21/49/43/150498116_p0_custom1200.jpg';
const master = H + '/img-master/img/2026/10/05/23/29/34/150503011_p2_master1200.jpg';
const ranked = H + '/c/480x960/img-master/img/2026/10/03/00/00/17/150377984_p0_master1200.jpg';
const ugoira = H + '/c/250x250_80_a2/img-master/img/2026/10/05/23/27/27/150502912_square1200.jpg';
const original = H + '/img-original/img/2026/10/05/23/29/34/150503011_p0.png';

// parts
assert.deepStrictEqual([I.parts(square).id, I.parts(square).page, I.parts(square).crop], ['150502944', 0, 'square']);
assert.deepStrictEqual([I.parts(custom).kind, I.parts(custom).crop], ['custom-thumb', 'custom']);
assert.strictEqual(I.parts(master).page, 2);
assert.strictEqual(I.parts(ugoira).page, null, 'animations have no page number');
assert.strictEqual(I.parts(original).ext, 'png');
assert.strictEqual(I.parts(H + '/user-profile/img/2022/08/08/17/45/38/23152982_8d16_50.png'), null, 'avatars are not works');
assert.strictEqual(I.parts(H + '/c/600x600/novel-cover-master/img/2025/01/26/01/32/14/ci23891858_45_master1200.jpg'), null, 'novel covers are not works');
assert.strictEqual(I.parts('https://example.com/img-master/img/2026/10/05/23/28/02/1_p0_master1200.jpg'), null, 'other sites');
// master: the whole first picture, never a crop
assert.strictEqual(I.master(square), H + '/img-master/img/2026/10/05/23/28/02/150502944_p0_master1200.jpg');
assert.strictEqual(I.master(custom), H + '/img-master/img/2026/10/05/21/49/43/150498116_p0_master1200.jpg');
assert.strictEqual(I.master(ugoira), H + '/img-master/img/2026/10/05/23/27/27/150502912_master1200.jpg');
assert.strictEqual(I.master(original), H + '/img-master/img/2026/10/05/23/29/34/150503011_p0_master1200.jpg');
// fit: the smallest allowed size that is wide enough for the tile, keeping the shape
assert.ok(I.fit(square, 230, 1).startsWith(H + '/c/240x480/img-master/'));
assert.ok(I.fit(square, 300, 0.56).startsWith(H + '/c/480x960/img-master/'), 'tall: 960 high is 538 wide');
assert.ok(I.fit(square, 300, 0.28).startsWith(H + '/c/600x1200_90_webp/img-master/'), 'very tall: 960 high is only 269 wide');
assert.ok(I.fit(square, 520, 1.5).startsWith(H + '/c/600x1200_90_webp/img-master/'));
assert.ok(I.fit(square, 700, 1).startsWith(H + '/c/768x1200_80/img-master/'));
assert.strictEqual(I.fit(square, 1000, 1), H + '/img-master/img/2026/10/05/23/28/02/150502944_p0_master1200.jpg');
assert.ok(I.fit(square, 300, 0).includes('_p0_master1200.jpg'), 'unknown shape still asks for the whole picture');
// whole: which addresses show the whole picture
assert.strictEqual(I.whole(square), false);
assert.strictEqual(I.whole(custom), false);
assert.strictEqual(I.whole(ranked), true);
assert.strictEqual(I.whole(master), true);
assert.strictEqual(I.whole(H + '/c/250x250_80_a2/img-master/img/2026/10/05/23/29/34/150503011_p0_master1200.jpg'), false, '_a2 sizes crop');
assert.strictEqual(I.forLens(custom), I.master(custom));

// pixiv-data.js: shapes from pixiv's answers (search results, home "street" lists, work details)
const events = [];
globalThis.window = globalThis;
globalThis.document = {
  readyState: 'complete', querySelectorAll: () => [], addEventListener() {},
  dispatchEvent: e => events.push(e)
};
globalThis.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o.detail; } };
globalThis.XMLHttpRequest = function () {}; XMLHttpRequest.prototype = { open() {}, send() {} };
globalThis.fetch = () => Promise.resolve();
eval(fs.readFileSync(__dirname + '/../pixiv-data.js', 'utf8'));
const { harvest, known } = window.pwPxData;
harvest({ body: { illustManga: { data: [
  { id: '150502944', url: square, width: 720, height: 1280, illustType: 0 },
  { isAdContainer: true },
  { id: '23891858', url: H + '/c/600x600/novel-cover-master/img/2025/01/26/01/32/14/ci23891858_45_master1200.jpg', width: 600, height: 800 }
] } } }, 0);
harvest({ body: { content: { thumbnails: [{ id: '150476428', pages: [
  { width: 700, height: 990, urls: { '1200x1200_standard': H + '/img-master/img/2026/10/05/08/05/36/150476428_p0_master1200.jpg' } },
  { width: 744, height: 932, urls: { '1200x1200_standard': H + '/img-master/img/2026/10/05/08/05/36/150476428_p1_master1200.jpg' } }
] }] } } }, 0);
harvest({ body: { illustId: '150503011', width: 912, height: 1536, urls: { mini: H + '/c/48x48/img-master/img/2026/10/05/23/29/34/150503011_p0_square1200.jpg', original } } }, 0);
assert.deepStrictEqual(known['150502944'], [720, 1280]);
assert.deepStrictEqual(known['150476428'], [700, 990], 'the first page sets the shape');
assert.deepStrictEqual(known['150503011'], [912, 1536]);
assert.strictEqual(known['23891858'], undefined, 'novels are not works');
console.log('pixiv-images.js and pixiv-data.js: all checks pass');
