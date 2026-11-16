import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installDownloads } from '../src/download/content.js';
import { browserContext } from './helpers/browser-context.js';
import { createFrameTask } from '../src/download/frame.js';

test('frame scheduling coalesces repeated events and cancels pending navigation work', () => {
  let sequence = 0,
    runs = 0;
  const pending = new Map();
  const clock = {
    setTimeout(fn) {
      const id = ++sequence;
      pending.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  const task = createFrameTask(clock, () => runs++);
  task.schedule();
  task.schedule();
  assert.equal(pending.size, 1);
  const [id, callback] = [...pending][0];
  pending.delete(id);
  callback();
  assert.equal(runs, 1);
  task.schedule();
  task.cancel();
  assert.equal(pending.size, 0);
  assert.equal(runs, 1);
});

test('offscreen floating controls hide and pending positioning is cancelled on disposal', async () => {
  const dom = new JSDOM(
    '<main><article><video src="https://scontent.cdninstagram.com/a.mp4"></video><button aria-label="Share">Send</button><a href="/p/ABC/">Post</a></article></main>',
    { url: 'https://www.instagram.com/p/ABC/' },
  );
  let notify,
    disconnected = false;
  dom.window.IntersectionObserver = class {
    constructor(callback) {
      notify = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {
      disconnected = true;
    }
  };
  const article = dom.window.document.querySelector('article'),
    button = article.querySelector('button');
  button.getBoundingClientRect = () => ({
    left: 100,
    right: 124,
    top: 100,
    bottom: 124,
    width: 24,
    height: 24,
  });
  const app = installDownloads({ window: dom.window, api: browserContext().api });
  await app.ready;
  try {
    const host = dom.window.document.querySelector('[data-linklift-download]');
    assert.equal(host.dataset.layout, 'floating');
    assert.equal(host.hidden, false);
    notify([{ target: article, isIntersecting: false }]);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(host.hidden, true);
    notify([{ target: article, isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(host.hidden, false);
    dom.window.dispatchEvent(new dom.window.Event('scroll'));
    app.dispose();
    assert.equal(disconnected, true);
    assert.equal(host.isConnected, false);
  } finally {
    app.dispose();
    dom.window.close();
  }
});
test('local media changes do not rediscover an unrelated long X feed', async () => {
  const dom = new JSDOM(
    Array.from(
      { length: 80 },
      (_, i) =>
        `<article data-testid="tweet"><a href="/a/status/${i + 1}"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/${i}.jpg"></div></article>`,
    ).join(''),
    { url: 'https://x.com/home' },
  );
  const app = installDownloads({ window: dom.window, api: browserContext().api });
  await app.ready;
  let queries = 0;
  const query = dom.window.document.querySelectorAll.bind(dom.window.document);
  dom.window.document.querySelectorAll = (selector) => {
    if (selector.includes('article[data-testid')) queries++;
    return query(selector);
  };
  try {
    await new Promise((r) => setTimeout(r, 200));
    queries = 0;
    dom.window.document.querySelector('img').src = 'https://pbs.twimg.com/media/updated.jpg';
    await new Promise((r) => setTimeout(r, 220));
    assert.equal(queries, 0, 'a change inside a known post must stay local');
    const extra = dom.window.document.createElement('article');
    extra.dataset.testid = 'tweet';
    extra.innerHTML =
      '<a href="/a/status/999"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/new.jpg"></div>';
    dom.window.document.body.append(extra);
    await new Promise((r) => setTimeout(r, 220));
    assert.ok(extra.querySelector('[data-linklift-download]'));
    extra.remove();
    await new Promise((r) => setTimeout(r, 220));
    assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length, 80);
  } finally {
    app.dispose();
    dom.window.close();
  }
});

test('site reconciliation removing an injected control remounts it once', async () => {
  const dom = new JSDOM(
    '<article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div></article>',
    { url: 'https://x.com/home' },
  );
  const app = installDownloads({ window: dom.window, api: browserContext().api });
  await app.ready;
  try {
    const host = dom.window.document.querySelector('[data-linklift-download]');
    host.remove();
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(dom.window.document.querySelector('[data-linklift-download]'), host);
    assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length, 1);
  } finally {
    app.dispose();
    dom.window.close();
  }
});
