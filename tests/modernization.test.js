import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { browserContext } from './helpers/browser-context.js';
import { success } from '../src/shared/protocol.js';
import { createSettingsView } from '../src/popup/index.js';
import { installDownloads } from '../src/download/content.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settings() {
  const dom = new JSDOM('<main id="cards"></main><p id="status"></p>', {
    url: 'https://extension.test/',
  });
  dom.window.document.body.dataset.dashboard = 'true';
  const ctx = browserContext();
  ctx.api.runtime.sendMessage = async (m) =>
    success(m, { version: 1, services: ['fixupx.com'], activeDomain: 'fixupx.com' });
  ctx.api.tabs.query = async () => [];
  const app = createSettingsView({ document: dom.window.document, api: ctx.api });
  await app.ready;
  return { dom, ctx, app };
}
test('custom service errors are associated with the input and clear when edited', async () => {
  const { dom, app } = await settings();
  try {
    const input = dom.window.document.querySelector('#domain-instagram');
    input.value = 'http://invalid.example/path';
    input.closest('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.match(
      dom.window.document.getElementById(input.getAttribute('aria-describedby')).textContent,
      /HTTPS domain/,
    );
    input.value = 'valid.example';
    input.dispatchEvent(new dom.window.Event('input'));
    assert.equal(input.hasAttribute('aria-invalid'), false);
  } finally {
    app.dispose();
    dom.window.close();
  }
});
test('adding and removing services preserves a draft and keyboard focus in that card', async () => {
  const { dom, app } = await settings();
  try {
    let input = dom.window.document.querySelector('#domain-instagram');
    input.value = 'new.example';
    input.focus();
    input.closest('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await tick();
    input = dom.window.document.querySelector('#domain-instagram');
    assert.equal(dom.window.document.activeElement, input);
    input.value = 'draft.example';
    const remove = dom.window.document.querySelector(
      '[aria-label="Remove new.example from Instagram"]',
    );
    remove.focus();
    remove.click();
    await tick();
    assert.equal(dom.window.document.querySelector('#domain-instagram').value, 'draft.example');
    assert.notEqual(dom.window.document.activeElement, dom.window.document.body);
    assert.equal(dom.window.document.activeElement.isConnected, true);
  } finally {
    app.dispose();
    dom.window.close();
  }
});
test('download options are labelled and return focus on Escape', async () => {
  const dom = new JSDOM(
    '<article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div></article>',
    { url: 'https://x.com/home' },
  );
  const ctx = browserContext(),
    app = installDownloads({ window: dom.window, api: ctx.api, isTrusted: () => true });
  await app.ready;
  try {
    const shadow = dom.window.document.querySelector('[data-linklift-download]').shadowRoot,
      button = shadow.querySelector('[data-action="options"]'),
      form = shadow.querySelector('form');
    assert.equal(button.getAttribute('aria-controls'), form.id);
    assert.ok(form.id);
    assert.ok(form.getAttribute('aria-label'));
    button.click();
    assert.equal(shadow.activeElement, form.querySelector('select[aria-label="Quality"]'));
    form.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    assert.equal(form.hidden, true);
    assert.equal(shadow.activeElement, button);
  } finally {
    app.dispose();
    dom.window.close();
  }
});
