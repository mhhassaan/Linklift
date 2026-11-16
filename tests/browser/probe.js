import { request } from '../../src/shared/protocol.js';
const api = globalThis.browser || globalThis.chrome;
const result = document.getElementById('result');
const report = (value) => {
  result.textContent = JSON.stringify(value);
};
document.getElementById('clipboard').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('https://fixupx.com/linklift/status/123');
    report({ clipboard: true });
  } catch (error) {
    report({ error: error.message });
  }
});
document.getElementById('download').addEventListener('click', async () => {
  try {
    const id = await api.downloads.download({
      url: api.runtime.getURL('icons/icon-16.png'),
      filename: 'linklift-browser-smoke.png',
      saveAs: false,
    });
    const deadline = Date.now() + 15000;
    let item;
    do {
      [item] = await api.downloads.search({ id });
      if (item?.state === 'complete') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    if (item?.state !== 'complete') throw new Error('Native download did not complete');
    report({ download: true, bytes: item.fileSize });
  } catch (error) {
    report({ error: error.message });
  }
});
document.getElementById('wake').addEventListener('click', async () => {
  try {
    const settings = await request(api, 'settings.get', 'background');
    report({ background: true, domain: settings.activeDomain });
  } catch (error) {
    report({ error: error.message });
  }
});
