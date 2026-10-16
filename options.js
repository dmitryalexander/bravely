const dbg = document.getElementById('debug');
const pinless = document.getElementById('pinless');
const daLook = document.getElementById('daLook');
const daBlue = document.getElementById('daBlue');
const pxLook = document.getElementById('pxLook');
const pxBlue = document.getElementById('pxBlue');
const accessStatus = document.getElementById('access-status');
for (const name of ['web', 'local']) {
  const control = document.getElementById('access-' + name);
  let busy = false, revision = 0;
  const paint = async () => {
    const current = revision;
    const enabled = await BravelyAccess.state(name);
    if (!busy && current === revision) control.checked = enabled;
  };
  control.addEventListener('change', () => {
    busy = true; revision++;
    control.disabled = true;
    // Start request immediately within the user's gesture; no preceding asynchronous work.
    let action;
    try { action = control.checked ? BravelyAccess.enable(name) : BravelyAccess.disable(name); }
    catch (error) { action = Promise.reject(error); }
    Promise.resolve(action).then(granted => {
      accessStatus.textContent = granted === false ? 'Permission was not granted. Extra access stays off.' : 'Access updated.';
    }).catch(() => {
      accessStatus.textContent = 'Could not update access. Check the browser extension settings and try again.';
    }).finally(async () => {
      busy = false; control.disabled = false;
      await paint();
    });
  });
  chrome.permissions.onAdded.addListener(paint);
  chrome.permissions.onRemoved.addListener(paint);
  paint();
}
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
