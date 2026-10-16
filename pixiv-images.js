/* pixiv picture addresses, shared by pixiv-look.js and pixiv.js (Bravely 0.12).
   pixiv's image server (i.pximg.net) sends every work as
     /c/<size>/img-master/img/<date>/<id>_p<page>_square1200.jpg   a square crop (most thumbnails)
     /c/<size>/custom-thumb/img/<date>/<id>_p<page>_custom1200.jpg  the artist's own crop
     /img-master/img/<date>/<id>_p<page>_master1200.jpg             the whole picture, at most 1200 px
     /img-original/img/<date>/<id>_p<page>.<png|jpg|gif>            the original file
   Animated works (ugoira) have no _p<page>. Only a fixed list of <size> values is allowed; the ones in FIT
   keep the picture's whole shape (checked on live pixiv). i.pximg.net only answers requests that come
   from pixiv's pages (the Referer header), see the pixiv part of background.js. */
self.pwPxImages = (() => {
  'use strict';
  const HOST = /^i\.pximg\.net$/;
  const RE = /^\/(?:c\/[^/]+\/)?(img-master|custom-thumb|img-original)\/img\/(\d{4}\/\d\d\/\d\d\/\d\d\/\d\d\/\d\d)\/(\d+)(?:_p(\d+))?(?:_(square|master|custom)1200)?(?:_ugoira\d+)?\.(\w+)$/;

  // The parts of a picture address, or null if it is not one of pixiv's work pictures.
  function parts(src) {
    try {
      const u = new URL(src, location.href);
      if (u.protocol !== 'https:' || !HOST.test(u.hostname)) return null;
      const m = u.pathname.match(RE);
      if (!m) return null;
      return { u, kind: m[1], date: m[2], id: m[3], page: m[4] == null ? null : +m[4], crop: m[5] || '', ext: m[6] };
    } catch (_) { return null; }
  }

  // The whole picture (never a crop), at most 1200 px.
  function master(src) {
    const p = parts(src);
    if (!p) return null;
    return p.u.origin + '/img-master/img/' + p.date + '/' + p.id + (p.page == null ? '' : '_p' + p.page) + '_master1200.jpg';
  }

  // Sizes that keep the whole shape: [prefix, width box, height box], smallest first.
  const FIT = [['c/240x480/', 240, 480], ['c/480x960/', 480, 960], ['c/600x1200_90_webp/', 600, 1200], ['c/768x1200_80/', 768, 1200], ['', 1200, 1200]];

  // The whole picture, sized for a tile w px wide. shape = width / height when known.
  function fit(src, w, shape) {
    const m = master(src);
    if (!m) return null;
    const s = shape > 0 ? shape : 1;
    for (const [size, bw, bh] of FIT) {
      if (!size) return m;
      if (Math.min(bw, bh * s) >= w * 0.95) return m.replace('/img-master/', '/' + size + 'img-master/');
    }
    return m;
  }

  // Whether an address shows the whole picture (so its loaded size gives the real shape).
  // _square/_custom files are crops, and so is any size ending in _a2 (for example c/250x250_80_a2).
  function whole(src) {
    const p = parts(src);
    return !!p && (p.crop === '' || p.crop === 'master') && !/^\/c\/[^/]*_a2\//.test(p.u.pathname);
  }

  // Blue strip: a large version that is quick to send to Google Lens.
  const forLens = src => master(src) || src;

  return { parts, master, fit, whole, forLens };
})();
