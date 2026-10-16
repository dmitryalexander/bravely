// Local checks for the DeviantArt picture addresses (deviantart-images.js). Run: node check-deviantart.cjs
// No network: the token below is made up and only carries the size limits DeviantArt writes into its tokens.
const assert = require('assert');
const fs = require('fs');
globalThis.self = globalThis;
globalThis.location = { href: 'https://www.deviantart.com/' };
eval(fs.readFileSync(__dirname + '/../deviantart-images.js', 'utf8'));
const I = self.pwDaImages;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = lim => 'x.' + b64({ obj: [[Object.assign({ path: '/f/abc/def.png' }, lim)]] }) + '.y';
const host = 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com';
const thumb = host + '/f/abc/def.png/v1/fill/w_200,h_250,q_70,strp/name-250t.jpg?token=' + token({ height: '<=1280', width: '<=1024' });
const crop = host + '/f/abc/def.png/v1/crop/w_92,h_92,x_5,y_0,scl_0.0134,q_70,strp/name-92s.jpg?token=' + token({ height: '<=1601', width: '<=1920' });
const open = host + '/f/abc/def.gif/v1/fill/w_300,h_200,q_70,strp/name.jpg?token=' + token({});

// parts
assert.strictEqual(I.parts(thumb).op, 'fill');
assert.strictEqual(I.parts(thumb).base, '/f/abc/def.png');
assert.strictEqual(I.parts('https://a.deviantart.net/avatars-big/k/o/konkapo00.jpg'), null, 'avatars are not pictures');
assert.strictEqual(I.parts('https://example.com/f/abc/def.png'), null, 'other sites are ignored');
// limits
assert.deepStrictEqual(I.limits(thumb), { w: 1024, h: 1280, open: false });
assert.deepStrictEqual(I.limits(open), { w: 0, h: 0, open: true });
// resized: fill keeps the shape inside the limits, fit caps each side
assert.ok(I.resized(thumb, 'fill', 400, 500).includes('/v1/fill/w_400,h_500,q_80,strp/name-250t.jpg?token='));
assert.ok(I.resized(thumb, 'fill', 2048, 2560).includes('/v1/fill/w_1024,h_1280,'), 'never above the token');
assert.ok(I.resized(crop, 'fit', 416, 1664).includes('/v1/fit/w_416,h_1601,'), 'fit caps the height only');
// full: largest first, the thumbnail last; the original file only when the token has no limits
const f = I.full(thumb);
assert.ok(f[0].includes('/v1/fit/w_1024,h_1280,q_100,strp/'));
assert.strictEqual(f[f.length - 1], thumb);
assert.ok(!f.some(u => /\.png\?token=/.test(u)), 'no original when limited');
assert.ok(I.full(open)[0].startsWith(host + '/f/abc/def.gif?token='), 'original when open');
// Lens: at most 1600 and inside the limits
assert.ok(I.forLens(thumb).includes('/v1/fit/w_1024,h_1280,q_90,strp/'));
assert.ok(I.forLens(crop).includes('/v1/fit/w_1600,h_1600,q_90,strp/'));
console.log('deviantart-images.js: all checks pass');
