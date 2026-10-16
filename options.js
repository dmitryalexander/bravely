const dbg = document.getElementById('debug');
const pinless = document.getElementById('pinless');
const daLook = document.getElementById('daLook');
const daBlue = document.getElementById('daBlue');
const pxLook = document.getElementById('pxLook');
const pxBlue = document.getElementById('pxBlue');
chrome.storage.sync.get({ debug: false, pinlessLook: true, daLook: true, daBlue: 'lens', pxLook: true, pxBlue: 'lens' }, v => {
  dbg.checked = v.debug; pinless.checked = v.pinlessLook !== false;
  daLook.checked = v.daLook !== false; daBlue.value = v.daBlue === 'artist' ? 'artist' : 'lens';
  pxLook.checked = v.pxLook !== false; pxBlue.value = v.pxBlue === 'artist' ? 'artist' : 'lens';
});
document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({ debug: dbg.checked, pinlessLook: pinless.checked, daLook: daLook.checked, daBlue: daBlue.value, pxLook: pxLook.checked, pxBlue: pxBlue.value }, () => {
    document.getElementById('msg').textContent = 'Saved.';
  });
});
