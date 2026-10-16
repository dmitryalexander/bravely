/* Lens upload: Google Lens can't download images from some sites (Pinterest's i.pinimg.com gives
   "No image at the URL"). Every lens.google.com/uploadbyurl?url=... link is sent here instead
   (see background.js); this page downloads the image itself and uploads it to Lens like a dropped file. */
(() => {
  'use strict';
  const msg = document.getElementById('msg');
  const src = new URLSearchParams(location.search).get('url') || '';
  const key = 'lw-sent:' + src;
  const viaGoogle = () => location.replace('https://lens.google.com/uploadbyurl?lw=1&url=' + encodeURIComponent(src));

  // Back button from the results: don't upload again.
  function alreadySent() {
    try { if (!sessionStorage.getItem(key)) return false; } catch (_) { return false; }
    if (history.length > 2) history.back();
    else msg.textContent = 'The image was sent to Google Lens. You can close this tab.';
    return true;
  }
  window.addEventListener('pageshow', e => { if (e.persisted) alreadySent(); });

  async function shrink(blob) {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  }

  async function upload() {
    if (!/^https?:\/\//i.test(src)) { msg.textContent = 'No image address was given.'; return; }
    if (alreadySent()) return;
    try {
      const res = await fetch(src, { credentials: 'omit', headers: { Accept: 'image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8' } });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok || !type.startsWith('image/')) throw new Error('not an image');
      let blob = await res.blob();
      if (!blob.size) throw new Error('empty image');
      if (blob.size > 8e6 || !/^image\/(jpeg|png|webp|gif)$/.test(type)) blob = await shrink(blob);
      const form = document.createElement('form');
      form.method = 'POST';
      form.enctype = 'multipart/form-data';
      form.action = 'https://lens.google.com/v3/upload?st=' + Date.now();
      const input = document.createElement('input');
      input.type = 'file';
      input.name = 'encoded_image';
      const files = new DataTransfer();
      files.items.add(new File([blob], 'image.' + ((blob.type || 'image/jpeg').split('/')[1] || 'jpg'), { type: blob.type || 'image/jpeg' }));
      input.files = files.files;
      form.append(input);
      form.hidden = true;
      document.body.append(form);
      try { sessionStorage.setItem(key, '1'); } catch (_) {}
      form.submit();
    } catch (_) {
      viaGoogle(); // couldn't get the image ourselves: let Google try to download it
    }
  }
  upload();
})();
