import {
  instagramCode,
  instagramSlideIndex,
  isVideoNode,
  redditEmbeddedItem,
  currentGalleryIndex,
} from './dom.js';
import { createPlatformAdapter } from './adapters.js';
import { createFrameTask } from './frame.js';
import { CONTROL_STYLE } from './control-style.js';
import { tiktokShare, tiktokLink } from './tiktok-dom.js';
import { getApi } from '../shared/api.js';
import { request, validEnvelope, success, failure, uuid } from '../shared/protocol.js';
import {
  platformFor,
  normalizeItem,
  safeMediaUrl,
  safePageVideoUrl,
  MAX_MEDIA_BYTES,
  DOWNLOAD_KEY,
  downloadEnabled,
  variantLabel,
  MEDIA_CHANNEL,
} from './model.js';

const ERRORS = {
  NETWORK_ERROR:
    'The browser could not read this media source. Reload the post or try another quality.',
  FETCH_TIMEOUT: 'The media request timed out. Please retry.',
  DOWNLOAD_FAILED: 'The browser could not save the file. Check its Downloads panel for details.',
  SERVER_FORBIDDEN:
    'The media link expired or the server denied access. Reload the post and retry.',
  SERVER_UNAUTHORIZED: 'This media requires access that is not currently available.',
  GIF_LIMIT: 'This GIF is too large to convert at this quality. Try a smaller GIF preset.',
  GIF_DECODE_FAILED: 'This animation could not be decoded in your browser.',
  AUDIO_UNAVAILABLE: 'The audio track could not be joined. Please retry.',
  UNSUPPORTED_STREAM: 'This stream format is not supported yet.',
  UNSUPPORTED_MEDIA: 'No supported media file was found.',
  MEDIA_UNAVAILABLE: 'Media is not available yet. Play the video or reopen this post, then retry.',
  FETCH_FAILED: 'The media could not be fetched. Reload the post and retry.',
  MEDIA_TOO_LARGE: 'This file exceeds the 256 MiB download limit.',
  BUSY: 'Another media file is processing. Wait or cancel it first.',
  CANCELLED: 'Download cancelled.',
  OWNER_GONE: 'Download cancelled because the post was closed.',
  DOWNLOADS_DISABLED: 'Downloads are turned off for this website.',
};
const STYLE = CONTROL_STYLE;
function pathKey(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}
function entriesChanged(before, after) {
  return (
    before.length !== after.length ||
    after.some((entry, index) => entry.node !== before[index]?.node) ||
    JSON.stringify(before.map((e) => e.item)) !== JSON.stringify(after.map((e) => e.item))
  );
}
function pageMode(window, root) {
  for (let node = root; node; node = node.parentElement) {
    const parts = window.getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
    if (parts && parts.length >= 3 && (parts.length < 4 || Number(parts[3]) > 0))
      return 0.2126 * Number(parts[0]) + 0.7152 * Number(parts[1]) + 0.0722 * Number(parts[2]) < 128
        ? 'dark'
        : 'light';
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function installDownloads({ window, api, isTrusted = (event) => event.isTrusted }) {
  const document = window.document,
    platform = platformFor(window.location.href),
    token = uuid(),
    cache = new Map(),
    controls = new Map(),
    observed = new WeakSet(),
    resolvers = new Map(),
    jobs = new Map(),
    pageRequests = new Map();
  let settings = {},
    disposed = false,
    timer,
    port,
    active = null,
    revision = 0,
    batch = null;
  if (!platform) return { ready: Promise.resolve(), scan() {}, receive() {}, dispose() {} };
  const dirty = new Set(),
    nearby = new Set();
  let fullScan = true;
  function positionControls() {
    if (disposed) return;
    const writes = [];
    for (const c of controls.values()) {
      if (!visibility || nearby.has(c.root)) writes.push(readPosition(c));
      else if (c.host.dataset.layout === 'floating')
        writes.push(() => {
          c.host.hidden = true;
        });
    }
    for (const write of writes) write();
  }
  const layoutWork = createFrameTask(window, positionControls);
  const visibility =
    typeof window.IntersectionObserver === 'function'
      ? new window.IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) nearby.add(entry.target);
              else nearby.delete(entry.target);
            }
            layoutWork.schedule();
          },
          { rootMargin: '600px' },
        )
      : null;
  const adapter = createPlatformAdapter(platform, window, (shadow) => {
    if (!observed.has(shadow)) {
      observed.add(shadow);
      observer.observe(shadow, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'poster', 'packaged-media-json'],
      });
    }
  });
  const postId = (root) => adapter.getPostId(root);
  function receive(posts) {
    if (!Array.isArray(posts)) return;
    for (const post of posts.slice(0, 120)) {
      if (
        post?.platform !== platform ||
        !/^[-\w]{1,128}$/.test(post.postId || '') ||
        !Array.isArray(post.items)
      )
        continue;
      const items = [];
      for (const item of post.items.slice(0, 32))
        try {
          items.push(normalizeItem(platform, item));
        } catch {}
      if (items.length) {
        cache.delete(post.postId);
        cache.set(post.postId, items);
        if (cache.size > 120) cache.delete(cache.keys().next().value);
        resolvers.get(post.postId)?.();
      }
    }
    schedule();
  }
  function rootsIn(scope) {
    if (!observed.has(scope)) {
      observed.add(scope);
      observer.observe(scope, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'href', 'id', 'aria-hidden', 'post-id', 'data-fullname'],
      });
    }
    return adapter.findPosts();
  }
  const mediaFor = (root) => adapter.getMedia(root);
  function source(node) {
    return node.currentSrc || node.src || node.querySelector('source')?.src;
  }
  function itemFor(root, node, id, nodes) {
    const items = cache.get(id),
      url = source(node),
      key = pathKey(url);
    if (platform === 'instagram' && root.matches('a[href]') && instagramCode(root.href) && !items)
      return { id: 'pending-post', kind: 'pending', variants: [] };
    const videoPoster =
      node.tagName === 'IMG' &&
      ['instagram', 'tiktok'].includes(platform) &&
      ((items?.some((i) => i.kind === 'video') && !items.some((i) => i.kind === 'image')) ||
        (platform === 'instagram' &&
          (/\/(?:reel|reels)\//.test(window.location.pathname) ||
            /^Video by\b|^Clip$/i.test(node.alt || ''))) ||
        (platform === 'tiktok' &&
          (/\/video\//.test(window.location.pathname) ||
            tiktokLink(root)?.pathname.includes('/video/') ||
            root.querySelector('[data-e2e="feed-video"]'))));
    if (videoPoster) {
      const videos = items?.filter((i) => i.kind === 'video');
      return videos?.length === 1
        ? videos[0]
        : { id: 'pending-video', kind: 'pending', variants: [] };
    }
    if (items) {
      const match = items.find((i) => i.variants.some((v) => pathKey(v.url) === key));
      if (match) return match;
      const same = nodes.filter((n) => isVideoNode(n) === isVideoNode(node)),
        candidates = items.filter((i) =>
          isVideoNode(node) ? i.kind !== 'image' : i.kind === 'image',
        );
      if (candidates.length === same.length) return candidates[same.indexOf(node)];
      if (isVideoNode(node) && candidates.length === 1) return candidates[0];
      // Never use an arbitrary carousel image when the selected item is unknown.
    }
    if (platform === 'reddit' && isVideoNode(node)) {
      const embedded = redditEmbeddedItem(node, id);
      if (embedded) {
        cache.set(id, [embedded]);
        return embedded;
      }
      return { id: 'pending-video', kind: 'pending', variants: [] };
    }
    try {
      let direct = safeMediaUrl(platform, url);
      if (node.tagName === 'IMG') {
        const candidates = [{ url: direct, width: node.naturalWidth, height: node.naturalHeight }];
        if (platform === 'x') {
          const original = new URL(direct);
          original.searchParams.set('name', 'orig');
          candidates.unshift({ url: original.href, width: 100000, height: 100000 });
        }
        const filename = pathKey(direct)
          .split('/')
          .pop()
          .replace(/\.[a-z0-9]+$/i, '');
        const identity =
          platform === 'reddit'
            ? (filename.match(/-v0-([\w-]+)$/)?.[1] || filename)
                .replace(/[^\w-]/g, '_')
                .slice(0, 100)
            : String(nodes.indexOf(node));
        return normalizeItem(platform, {
          id: 'image-' + identity,
          kind: /\.gif(?:\?|$)/.test(direct) ? 'gif' : 'image',
          variants: candidates,
        });
      }
      const kind =
        platform === 'x' &&
        (/\/tweet_video\//.test(direct) ||
          /\bGIF\b/i.test(
            root.querySelector('[data-testid="videoPlayer"]')?.getAttribute('aria-label') || '',
          ) ||
          [...root.querySelectorAll('span')].some((s) => s.textContent.trim() === 'GIF'))
          ? 'gif'
          : 'video';
      return normalizeItem(platform, {
        id: 'video-' + nodes.indexOf(node),
        kind,
        variants: [{ url: direct, width: node.videoWidth, height: node.videoHeight }],
      });
    } catch {
      return ['instagram', 'tiktok'].includes(platform) && isVideoNode(node)
        ? { id: 'pending-video', kind: 'pending', variants: [] }
        : null;
    }
  }
  function remove(node) {
    const c = controls.get(node);
    if (!c) return;
    if (c.cancelResolution) {
      c.cancelled = true;
      c.cancelResolution();
      if (active === c) active = null;
    }
    if (c.previewPosition && c.root.style.position === 'relative') {
      if (c.previewPosition.value)
        c.root.style.setProperty('position', c.previewPosition.value, c.previewPosition.priority);
      else c.root.style.removeProperty('position');
    }
    visibility?.unobserve(node);
    nearby.delete(node);
    dirty.delete(node);
    window.clearTimeout(c.statusTimer);
    c.feedbackObserver?.disconnect();
    closeControl(c);
    c.host.remove();
    controls.delete(node);
  }
  function entriesFor(root, id) {
    const nodes = mediaFor(root),
      unique = new Map();
    for (const node of nodes) {
      const item = itemFor(root, node, id, nodes);
      if (!item) continue;
      const key = item.kind + ':' + item.id,
        previous = unique.get(key);
      if (previous) {
        previous.nodes.push(node);
        let variants = [...previous.item.variants, ...item.variants];
        if (platform === 'reddit' && variants.some((v) => !new URL(v.url).searchParams.has('blur')))
          variants = variants.filter((v) => !new URL(v.url).searchParams.has('blur'));
        try {
          previous.item = normalizeItem(platform, { ...item, variants });
        } catch {}
        if (source(node)?.startsWith('https://i.redd.it/')) previous.node = node;
      } else unique.set(key, { node, nodes: [node], item });
    }
    const cached = cache.get(id);
    if (cached?.length && nodes.length)
      return cached.map((item, index) => {
        const match = [...unique.values()].find(
          (e) =>
            e.item.id === item.id ||
            e.item.variants.some((v) =>
              item.variants.some((other) => pathKey(v.url) === pathKey(other.url)),
            ),
        );
        const matched =
          match?.nodes ||
          (platform === 'instagram'
            ? nodes.filter((node) => instagramSlideIndex(node, cached.length) === index)
            : []);
        return { item, node: match?.node || matched[0] || nodes[0], nodes: matched };
      });
    return [...unique.values()];
  }
  function add(node, root, id, item, entries) {
    const { parent, layout, after, native } = adapter.getActionMount(root);
    if (!parent) return;
    const host = document.createElement('span');
    host.dataset.linkliftDownload = '';
    host.dataset.layout = layout;
    host.dataset.platform = platform;
    host.dataset.mode = pageMode(window, root);
    const shadow = host.attachShadow({ mode: 'open' }),
      style = document.createElement('style');
    style.textContent = STYLE;
    shadow.append(style);
    if (platform === 'reddit') {
      const reference =
        native?.shadowRoot?.querySelector('button') || native?.querySelector('button') || native;
      if (reference) {
        const css = window.getComputedStyle(reference),
          bg = css.backgroundColor;
        if (bg && !/rgba\([^)]*,\s*0\)$/.test(bg) && bg !== 'transparent')
          host.style.setProperty('--ll-pill-bg', bg);
        host.style.setProperty('--ll-pill-fg', css.color);
        host.style.fontFamily = css.fontFamily;
        host.style.fontSize = css.fontSize;
      }
    }
    const el = (tag, text) => {
        const n = document.createElement(tag);
        if (text) n.textContent = text;
        return n;
      },
      split = el('div'),
      download = el('button'),
      options = el('button'),
      form = el('form'),
      status = el('div'),
      cancel = el('button', 'Cancel');
    split.className = 'split';
    download.type = options.type = cancel.type = 'button';
    download.dataset.action = 'download';
    download.title = 'Download best available quality';
    download.setAttribute('aria-label', 'Download best available quality');
    download.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg><span class="download-label">Download</span>';
    if (platform === 'instagram')
      download.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
    if (platform === 'tiktok')
      download.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.5 3a1.5 1.5 0 0 1 3 0v9.38l2.94-2.94a1.5 1.5 0 0 1 2.12 2.12l-5.5 5.5a1.5 1.5 0 0 1-2.12 0l-5.5-5.5a1.5 1.5 0 0 1 2.12-2.12l2.94 2.94V3ZM4 16a1.5 1.5 0 0 1 1.5 1.5V20h13v-2.5a1.5 1.5 0 0 1 3 0v3A2.5 2.5 0 0 1 19 23H5a2.5 2.5 0 0 1-2.5-2.5v-3A1.5 1.5 0 0 1 4 16Z"/></svg>';
    options.innerHTML =
      '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m7 10 5 5 5-5"/></svg>';
    form.id = 'download-options';
    form.setAttribute('aria-label', 'Download options');
    options.setAttribute('aria-controls', form.id);
    options.dataset.action = 'options';
    options.setAttribute('aria-label', 'Download quality and format');
    options.setAttribute('aria-expanded', 'false');
    split.append(download, options);
    form.hidden = true;
    form.setAttribute('popover', 'manual');
    status.className = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    cancel.className = 'cancel';
    cancel.hidden = true;
    if (typeof form.showPopover !== 'function') form.removeAttribute('popover');
    const mediaLabel = el('label', 'Media'),
      media = el('select');
    media.setAttribute('aria-label', 'Media');
    mediaLabel.append(media);
    const qualityLabel = el('label', 'Quality'),
      quality = el('select');
    quality.setAttribute('aria-label', 'Quality');
    qualityLabel.append(quality);
    const formatLabel = el('label', 'Format'),
      format = el('select');
    format.setAttribute('aria-label', 'Format');
    formatLabel.append(format);
    const gifLabel = el('label', 'GIF size'),
      preset = el('select');
    preset.setAttribute('aria-label', 'GIF size');
    for (const [value, text] of [
      ['best', 'Full size · up to 15 fps'],
      ['small', 'Up to 720px · 10 fps'],
      ['compact', 'Up to 480px · 8 fps'],
    ]) {
      const option = el('option', text);
      option.value = value;
      preset.append(option);
    }
    gifLabel.append(preset);
    const checkLabel = el('label', 'Choose save location'),
      check = el('input');
    checkLabel.className = 'check';
    check.type = 'checkbox';
    checkLabel.prepend(check);
    const save = el('button', 'Download selected');
    save.type = 'submit';
    const advanced = el('div'),
      galleryPrompt = el('div'),
      current = el('button', 'Download this image'),
      all = el('button', 'Download all images');
    galleryPrompt.className = 'gallery-prompt';
    galleryPrompt.hidden = true;
    current.type = all.type = 'button';
    current.dataset.action = 'download-current';
    all.dataset.action = 'download-all';
    galleryPrompt.append(el('p', 'Choose what to download'), current, all);
    advanced.append(mediaLabel, qualityLabel, formatLabel, gifLabel, checkLabel, save);
    form.append(galleryPrompt, advanced);
    const feedback = el('div');
    feedback.className = 'feedback';
    feedback.append(status, cancel);
    shadow.append(split, form, feedback);
    if (after) after.after(host);
    else parent.append(host);
    const control = {
      host,
      parent,
      root,
      id,
      item,
      node,
      status,
      download,
      options,
      cancel,
      quality,
      format,
      preset,
      gifLabel,
      form,
      save,
      update,
      setEntries,
      entries: [],
      selectedId: item.id,
      cancelled: false,
      state: 'idle',
      operationId: null,
      statusTimer: null,
      onTerminal: null,
    };
    controls.set(root, control);
    nearby.add(root);
    visibility?.observe(root);
    layoutWork.schedule();
    if (platform === 'instagram' || platform === 'tiktok') {
      feedback.setAttribute('popover', 'manual');
      control.feedbackObserver = new window.MutationObserver(() => {
        try {
          if (status.textContent && !disposed && host.isConnected) feedback.showPopover?.();
          else feedback.hidePopover?.();
        } catch {}
      });
      control.feedbackObserver.observe(status, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    function selectEntry(index) {
      const entry = control.entries[index];
      if (!entry) return;
      node = entry.node;
      control.node = node;
      control.selectedId = entry.item.id;
      media.value = String(index);
      update(entry.item);
    }
    function setEntries(next) {
      control.entries = next;
      const index = Math.max(
        0,
        next.findIndex((e) => e.item.id === control.selectedId),
      );
      media.replaceChildren();
      next.forEach((e, i) => {
        const option = el(
          'option',
          (e.item.kind === 'image' ? 'Image' : e.item.kind === 'gif' ? 'GIF' : 'Video') +
            ' ' +
            (i + 1),
        );
        option.value = String(i);
        media.append(option);
      });
      media.value = String(index);
      mediaLabel.hidden = next.length < 2;
      if (next[index]) {
        node = next[index].node;
        control.node = node;
        control.selectedId = next[index].item.id;
        update(next[index].item);
      }
    }
    media.addEventListener('change', () => {
      selectEntry(Number(media.value));
      positionMenu(control);
    });
    function update(next) {
      control.item = next;
      const entry = control.entries.find((e) => e.item.id === next.id);
      if (entry) entry.item = next;
      quality.replaceChildren();
      const variants = next.variants.length ? next.variants : [null];
      variants.forEach((v, i) => {
        const option = el(
          'option',
          v ? variantLabel(v, i) : 'Best available · resolve on download',
        );
        option.value = String(i);
        quality.append(option);
      });
      format.replaceChildren();
      for (const [value, text] of next.kind === 'gif'
        ? [['original', 'GIF']]
        : next.kind === 'video'
          ? platform === 'tiktok'
            ? [['original', 'MP4']]
            : [
                ['original', 'Source format'],
                ['mp4', 'MP4 · local remux'],
              ]
          : next.kind === 'pending'
            ? [['original', 'Resolve source format']]
            : [['original', 'Original image']]) {
        const option = el('option', text);
        option.value = value;
        format.append(option);
      }
      gifLabel.hidden = next.kind !== 'gif';
    }
    setEntries(entries);
    for (const type of ['click', 'pointerdown', 'mousedown', 'contextmenu'])
      host.addEventListener(type, (event) => event.stopPropagation());
    let resolving = null;
    async function resolveItem(qualities) {
      if (resolving) {
        await resolving;
        return;
      }
      resolving = (async () => {
        if (
          ['reddit', 'instagram', 'tiktok'].includes(platform) &&
          control.item.kind === 'pending' &&
          !cache.has(id)
        ) {
          const permalink =
            root.getAttribute('permalink') ||
            root.querySelector('a[href*="/comments/"]')?.pathname ||
            window.location.pathname;
          const profile = root.querySelector('a[data-e2e="video-author-avatar"]')?.pathname;
          const link =
            tiktokLink(root, id)?.pathname ||
            (profile && /^\/@[\w.]+$/.test(profile)
              ? profile + '/video/' + id
              : window.location.pathname);
          await new Promise((resolve, reject) => {
            const cleanup = () => {
              window.clearTimeout(timeout);
              if (resolvers.get(id) === complete) resolvers.delete(id);
              control.cancelResolution = null;
            };
            const complete = () => {
                cleanup();
                resolve();
              },
              timeout = window.setTimeout(() => {
                cleanup();
                reject(new Error('MEDIA_UNAVAILABLE'));
              }, 12000);
            control.cancelResolution = complete;
            resolvers.set(id, complete);
            window.postMessage(
              {
                channel: MEDIA_CHANNEL,
                type: platform + '-post',
                postId: id,
                path:
                  platform === 'tiktok'
                    ? link
                    : permalink.endsWith('/')
                      ? permalink
                      : permalink + '/',
              },
              window.location.origin,
            );
          });
        }
        if (
          control.cancelled ||
          disposed ||
          !(['instagram', 'tiktok'].includes(platform) ? root : node).isConnected ||
          postId(root) !== id
        )
          throw new Error('CANCELLED');
        const next = entriesFor(root, id);
        if (batch?.control !== control && next.length && entriesChanged(control.entries, next))
          setEntries(next);
        let latest = control.item;
        if (qualities && latest.variants.some((v) => v.manifestUrl)) {
          latest = normalizeItem(
            platform,
            await request(
              api,
              'download.resolve',
              'background',
              { spec: { platform, item: latest } },
              25000,
            ),
          );
          const items = cache.get(id);
          if (items)
            cache.set(
              id,
              items.map((i) => (i.id === latest.id ? latest : i)),
            );
        }
        if (latest.kind === 'pending') throw new Error('MEDIA_UNAVAILABLE');
        if (JSON.stringify(control.item) !== JSON.stringify(latest)) update(latest);
      })();
      try {
        await resolving;
      } finally {
        resolving = null;
      }
    }
    options.addEventListener('click', (event) => {
      if (!isTrusted(event)) return;
      closeMenus(host);
      event.preventDefault();
      if (!form.hidden) {
        closeControl(control);
        return;
      }
      galleryPrompt.hidden = true;
      advanced.hidden = false;
      openControl(control);
      control.cancelled = false;
      save.disabled = true;
      status.textContent = 'Finding available qualities…';
      void resolveItem(true)
        .then(
          () => {
            if (!active) status.textContent = '';
            positionMenu(control);
          },
          (error) => {
            status.dataset.error = 'true';
            status.textContent =
              ERRORS[error.message] || 'Could not load quality choices. Please retry.';
          },
        )
        .finally(() => {
          save.disabled = false;
        });
    });
    async function start(event, choose, waitForCompletion = false) {
      event.preventDefault();
      if (!isTrusted(event) || active || (batch && batch.control !== control))
        return { ok: false, code: 'BUSY' };
      const completion = waitForCompletion
        ? new Promise((resolve) => {
            control.onTerminal = resolve;
          })
        : null;
      active = control;
      control.cancelled = false;
      control.state = 'preparing';
      control.operationId = uuid();
      jobs.set(control.operationId, control);
      window.clearTimeout(control.statusTimer);
      download.disabled = options.disabled = save.disabled = true;
      cancel.hidden = false;
      status.dataset.error = 'false';
      status.textContent = stageText(control, 'Preparing download…');
      closeControl(control);
      try {
        await resolveItem(choose);
        if (platform === 'instagram' && !choose && control.entries.length > 1) {
          const current =
              instagramCode(window.location.href) === id
                ? new URL(window.location.href).searchParams.get('img_index')
                : null,
            index = /^[1-9]\d{0,3}$/.test(current || '') ? Number(current) - 1 : -1;
          const selected =
            index >= 0 && index < control.entries.length
              ? index
              : root.matches('a[href]')
                ? 0
                : currentGalleryIndex(root, control.entries, window, -1);
          if (selected < 0) {
            control.state = 'idle';
            jobs.delete(control.operationId);
            closeMenus(host);
            galleryPrompt.hidden = true;
            advanced.hidden = false;
            openControl(control);
            status.textContent = 'Choose the media to download.';
            return { ok: false, code: 'MEDIA_SELECTION_REQUIRED' };
          }
          selectEntry(selected);
        }
        if (control.cancelled || disposed || !node.isConnected || postId(root) !== id)
          throw new Error('CANCELLED');
        const latest = control.item,
          index = choose ? Number(quality.value) : 0,
          v = latest.variants[index];
        if (!v) throw new Error('MEDIA_UNAVAILABLE');
        await request(
          api,
          'download.start',
          'background',
          {
            documentToken: token,
            operationId: control.operationId,
            spec: {
              platform,
              postId: id,
              item: { ...latest, variants: [v] },
              quality: 0,
              format: choose ? format.value : 'original',
              gifPreset: choose ? preset.value : 'best',
              saveAs: choose && check.checked,
            },
          },
          600000,
        );
        if (control.state === 'preparing') {
          control.state = 'downloading';
          status.textContent = stageText(control, 'Downloading…');
        }
      } catch (error) {
        finish(control, false, error.message);
      } finally {
        if (active === control) active = null;
        if (control.state !== 'downloading') {
          download.disabled = options.disabled = save.disabled = false;
          cancel.hidden = true;
        }
      }
      return completion ? await completion : { ok: control.state !== 'failed' };
    }
    function showGallery(event) {
      event.preventDefault();
      if (!isTrusted(event) || active || batch) return;
      const latest = entriesFor(root, id);
      if (latest.length) setEntries(latest);
      selectEntry(currentGalleryIndex(root, control.entries, window));
      closeMenus(host);
      galleryPrompt.hidden = false;
      advanced.hidden = true;
      openControl(control);
    }
    async function downloadAll(event) {
      event.preventDefault();
      if (!isTrusted(event) || active || batch) return;
      const snapshot = control.entries
        .filter((e) => e.item.kind === 'image' || e.item.kind === 'gif')
        .map((e) => e.item.id);
      batch = { control, cancelled: false, index: 0, total: snapshot.length };
      let completed = 0;
      try {
        for (const itemId of snapshot) {
          if (batch.cancelled || disposed) break;
          const index = control.entries.findIndex((e) => e.item.id === itemId);
          if (index < 0) break;
          batch.index = completed + 1;
          selectEntry(index);
          const result = await start(event, false, true);
          if (!result.ok) break;
          completed++;
        }
      } finally {
        const cancelled = batch?.cancelled;
        batch = null;
        if (completed === snapshot.length) {
          control.state = 'complete';
          status.dataset.error = 'false';
          status.textContent = `Downloaded ${completed} images`;
          window.clearTimeout(control.statusTimer);
          control.statusTimer = window.setTimeout(() => {
            status.textContent = '';
          }, 1600);
        } else if (cancelled)
          status.textContent = `Cancelled · ${completed} of ${snapshot.length} downloaded`;
        else if (completed)
          status.textContent =
            `${completed} of ${snapshot.length} downloaded. ` + status.textContent;
        download.disabled = options.disabled = save.disabled = false;
        cancel.hidden = true;
      }
    }
    download.addEventListener('click', (event) => {
      if (
        platform === 'reddit' &&
        control.entries.length > 1 &&
        control.entries.every((e) => e.item.kind === 'image' || e.item.kind === 'gif')
      )
        showGallery(event);
      else void start(event, false);
    });
    current.addEventListener('click', (event) => void start(event, false));
    all.addEventListener('click', (event) => void downloadAll(event));
    form.addEventListener('submit', (event) => void start(event, true));
    cancel.addEventListener('click', (event) => {
      event.preventDefault();
      if (isTrusted(event)) {
        control.cancelled = true;
        if (batch?.control === control) batch.cancelled = true;
        resolvers.get(id)?.();
        void request(api, 'download.cancel', 'background', {
          documentToken: token,
          operationId: control.operationId,
        }).catch(() => {});
      }
    });
  }
  function scan(partial = false) {
    if (disposed) return;
    const live = new Set(),
      candidates = new Map(),
      roots = partial ? [...dirty] : rootsIn(document);
    dirty.clear();
    fullScan = false;
    if (downloadEnabled(settings, platform))
      for (const root of roots) {
        if (!root.isConnected) continue;
        if (
          platform === 'x' &&
          root.matches('[role="dialog"]') &&
          root.querySelector('article[data-testid="tweet"]')
        )
          continue;
        const id = postId(root);
        if (!id) continue;
        const entries = entriesFor(root, id);
        if (!entries.length) continue;
        const key = platform === 'instagram' ? id : root,
          score =
            (root.closest('[role="dialog"]') ? 1000 : 0) +
            (root.querySelector('[aria-label="Save"]') ? 100 : 0) +
            (root.querySelector('[aria-label="Share"]') ? 20 : 0) +
            (entries.some((e) => e.item.kind === 'video' || isVideoNode(e.node)) ? 10 : 0);
        if (!candidates.has(key) || candidates.get(key).score < score)
          candidates.set(key, { root, id, entries, score });
      }
    for (const { root, id, entries } of candidates.values()) {
      live.add(root);
      let c = controls.get(root);
      if (c && c.id !== id) {
        remove(root);
        c = null;
      }
      if (!c) {
        add(entries[0].node, root, id, entries[0].item, entries);
        c = controls.get(root);
      } else if (active !== c && batch?.control !== c && entriesChanged(c.entries, entries))
        c.setEntries(entries);
      if (c) mountControl(c);
    }
    for (const root of [...controls.keys()])
      if (!root.isConnected || ((!partial || roots.includes(root)) && !live.has(root)))
        remove(root);
    layoutWork.cancel();
    positionControls();
  }
  function mountControl(c) {
    const mount = adapter.getActionMount(c.root);
    if (
      c.host.parentNode !== mount.parent ||
      c.host.dataset.layout !== mount.layout ||
      (mount.after && mount.after.nextElementSibling !== c.host)
    ) {
      c.host.dataset.layout = mount.layout;
      c.parent = mount.parent;
      if (mount.after) mount.after.after(c.host);
      else mount.parent.append(c.host);
    }
    if (
      mount.layout === 'preview' &&
      !c.previewPosition &&
      ['', 'static'].includes(window.getComputedStyle(c.root).position)
    ) {
      c.previewPosition = {
        value: c.root.style.getPropertyValue('position'),
        priority: c.root.style.getPropertyPriority('position'),
      };
      c.root.style.setProperty('position', 'relative');
    }
  }
  function schedule() {
    fullScan = true;
    queueScan();
  }
  function queueScan() {
    if (!timer && !disposed)
      timer = window.setTimeout(() => {
        timer = null;
        scan(!fullScan);
      }, 150);
  }
  const observer = new window.MutationObserver((records) => {
    let changed = false;
    for (const record of records) {
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (
        nodes.length &&
        nodes.every(
          (node) =>
            node.nodeType === 1 &&
            node.matches('[data-linklift-download]') &&
            (node.isConnected ||
              ![...controls.values()].some((c) => c.host === node && c.root.isConnected)),
        )
      )
        continue;
      let target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest('[data-linklift-download]')) continue;
      if (target?.getRootNode() instanceof window.ShadowRoot) target = target.getRootNode().host;
      const root = target?.closest(
        platform === 'x' ? 'article[data-testid="tweet"]' : 'shreddit-post,.thing[data-fullname]',
      );
      // Complex modal/reel discovery can change ownership outside the mutated card.
      if (['x', 'reddit'].includes(platform) && root && controls.has(root)) dirty.add(root);
      else fullScan = true;
      changed = true;
    }
    if (changed) queueScan();
  });
  function closeControl(c) {
    try {
      c.form.hidePopover?.();
    } catch {}
    c.form.hidden = true;
    c.options.setAttribute('aria-expanded', 'false');
  }
  function openControl(c) {
    c.form.hidden = false;
    c.options.setAttribute('aria-expanded', 'true');
    try {
      c.form.showPopover?.();
    } catch {}
    positionMenu(c);
    const first = [...c.form.querySelectorAll('select,button,input')].find(
      (node) => !node.disabled && !node.closest('[hidden]'),
    );
    first?.focus({ preventScroll: true });
  }
  function closeMenus(except) {
    for (const c of controls.values()) if (c.host !== except) closeControl(c);
  }
  function outside(event) {
    for (const c of controls.values()) if (!event.composedPath().includes(c.host)) closeControl(c);
  }
  function escape(event) {
    if (event.key === 'Escape') {
      for (const c of controls.values())
        if (!c.form.hidden) {
          closeControl(c);
          c.options.focus();
        }
    }
  }
  function positionMenu(c) {
    if (c.form.hidden) return;
    const anchored =
      !!window.CSS?.supports?.('position-anchor', '--ll-options') &&
      window.CSS.supports('position-area', 'bottom span-left') &&
      window.CSS.supports('position-try-fallbacks', 'flip-block');
    c.form.dataset.anchored = String(anchored);
    if (anchored) {
      c.form.style.left = '';
      c.form.style.top = '';
      return;
    }
    const rect = c.options.getBoundingClientRect(),
      height = c.form.getBoundingClientRect().height;
    c.form.style.left = Math.max(12, Math.min(window.innerWidth - 262, rect.right - 250)) + 'px';
    c.form.style.top =
      (window.innerHeight - rect.bottom > height + 12
        ? rect.bottom + 6
        : Math.max(12, rect.top - height - 6)) + 'px';
  }
  function readPosition(c) {
    if (c.host.dataset.layout === 'inactive')
      return () => {
        c.host.hidden = true;
      };
    if (c.host.dataset.layout !== 'floating')
      return () => {
        c.host.style.left = '';
        c.host.style.top = '';
        c.host.hidden = false;
      };
    const marker =
      platform === 'tiktok'
        ? tiktokShare(c.root)
        : c.root.querySelector('[aria-label="Share"],[aria-label="Send"]') ||
          c.root.querySelector('[aria-label="Save"]');
    const anchor = marker?.closest('button,[role="button"]') || marker || c.node,
      rect = anchor.getBoundingClientRect();
    const hidden =
      !rect.width ||
      !rect.height ||
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth;
    const left = marker ? rect.right + 4 : rect.right - 66;
    const x = Math.max(8, Math.min(window.innerWidth - 70, left)) + 'px',
      y =
        Math.max(8, Math.min(window.innerHeight - 40, marker ? rect.top : rect.bottom + 6)) + 'px';
    return () => {
      c.host.hidden = hidden;
      c.host.style.left = x;
      c.host.style.top = y;
    };
  }
  function finish(c, ok, code) {
    jobs.delete(c.operationId);
    c.state = ok ? 'complete' : 'failed';
    c.download.disabled = c.options.disabled = c.save.disabled = false;
    c.cancel.hidden = true;
    c.status.dataset.error = String(!ok);
    c.status.textContent = ok ? 'Downloaded' : ERRORS[code] || 'Download failed. Please retry.';
    window.clearTimeout(c.statusTimer);
    if (ok || code === 'CANCELLED')
      c.statusTimer = window.setTimeout(() => {
        c.status.textContent = '';
      }, 1600);
    const terminal = c.onTerminal;
    c.onTerminal = null;
    terminal?.({ ok, code });
  }
  function stageText(c, text) {
    return batch?.control === c ? `Image ${batch.index} of ${batch.total} · ${text}` : text;
  }
  function moved(event) {
    if (![...controls.values()].some((c) => event.composedPath?.().includes(c.host))) closeMenus();
    layoutWork.schedule();
    if (platform === 'tiktok') schedule();
  }
  function releasePage(operationId) {
    window.postMessage(
      { channel: MEDIA_CHANNEL, type: 'tiktok-download-release', operationId },
      window.location.origin,
    );
    const pending = pageRequests.get(operationId);
    if (pending) {
      pageRequests.delete(operationId);
      window.clearTimeout(pending.timer);
      pending.reject(new Error('CANCELLED'));
    }
  }
  function preparePage(payload) {
    if (platform !== 'tiktok' || !jobs.has(payload.operationId))
      return Promise.reject(new Error('INVALID_MESSAGE'));
    const url = safeMediaUrl(platform, payload.url);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => releasePage(payload.operationId), 130000);
      pageRequests.set(payload.operationId, { resolve, reject, timer });
      window.postMessage(
        {
          channel: MEDIA_CHANNEL,
          type: 'tiktok-download',
          documentToken: token,
          operationId: payload.operationId,
          postId: payload.postId,
          url,
        },
        window.location.origin,
      );
    });
  }
  function onMessage(event) {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      event.data?.channel !== MEDIA_CHANNEL
    )
      return;
    const data = event.data;
    if (data.type === 'records') receive(data.posts);
    if (data.type === 'tiktok-download-result' && data.documentToken === token) {
      const pending = pageRequests.get(data.operationId);
      if (!pending) return;
      pageRequests.delete(data.operationId);
      window.clearTimeout(pending.timer);
      if (data.error) {
        pending.reject(new Error(data.error));
        return;
      }
      try {
        safePageVideoUrl(data.result?.blobUrl, window.location.origin);
        if (
          !Number.isSafeInteger(data.result.byteLength) ||
          data.result.byteLength <= 0 ||
          data.result.byteLength > MAX_MEDIA_BYTES
        )
          throw new Error('INVALID_MEDIA');
        pending.resolve(data.result);
      } catch (error) {
        releasePage(data.operationId);
        pending.reject(error);
      }
    }
  }
  function runtime(m, sender, reply) {
    if (m?.target !== 'download-ui') return false;
    if (!validEnvelope(m) || sender.id !== api.runtime.id) {
      reply(failure(m, new Error('INVALID_MESSAGE')));
      return false;
    }
    if (m.command === 'content.identify') {
      reply(success(m, { documentToken: token }));
      return false;
    }
    if (m.payload.documentToken !== token) {
      reply(failure(m, new Error('STALE_CONTEXT')));
      return false;
    }
    if (m.command === 'download.page.prepare') {
      void preparePage(m.payload).then(
        (result) => reply(success(m, result)),
        (error) => reply(failure(m, error)),
      );
      return true;
    }
    if (m.command === 'download.page.release') {
      releasePage(m.payload.operationId);
      reply(success(m, {}));
      return false;
    }
    if (m.command === 'media.owner') {
      if (m.payload.hold && !port) {
        port = api.runtime.connect({ name: 'linklift.download-owner.v1' });
        port.onDisconnect.addListener(() => {
          port = null;
        });
      }
      if (!m.payload.hold && port) {
        const old = port;
        port = null;
        old.disconnect();
      }
    } else if (m.command === 'download.progress') {
      const c = jobs.get(m.payload.operationId) || active;
      if (c)
        c.status.textContent = stageText(
          c,
          m.payload.stage +
            (Number.isFinite(m.payload.fraction)
              ? ` · ${Math.round(m.payload.fraction * 100)}%`
              : ''),
        );
    } else if (m.command === 'action.result') {
      const c = jobs.get(m.payload.operationId);
      if (c) {
        if (m.payload.outcome === 'download-complete') finish(c, true);
        else if (m.payload.outcome === 'failed') finish(c, false, m.payload.code);
        else if (m.payload.outcome === 'download-started') {
          c.state = 'downloading';
          c.status.textContent = stageText(c, 'Downloading…');
        }
      }
    }
    reply(success(m, {}));
    return false;
  }
  function changed(changes, area) {
    if (area === 'local' && changes[DOWNLOAD_KEY]) {
      revision++;
      settings = changes[DOWNLOAD_KEY].newValue || {};
      schedule();
    }
  }
  const initial = revision;
  const ready = api.storage.local.get(DOWNLOAD_KEY).then((value) => {
    if (revision === initial) settings = value[DOWNLOAD_KEY] || {};
    scan();
  });
  window.addEventListener('message', onMessage);
  api.runtime.onMessage.addListener(runtime);
  api.storage.onChanged.addListener(changed);
  observer.observe(document, { childList: true, subtree: true });
  window.postMessage({ channel: MEDIA_CHANNEL, type: 'ready' }, window.location.origin);
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape);
  window.addEventListener('scroll', moved, true);
  window.addEventListener('resize', moved);
  function pagehide(event) {
    if (batch) batch.cancelled = true;
    if (!event.persisted) dispose();
    else if (active || batch)
      void request(api, 'download.cancel', 'background', { documentToken: token }).catch(() => {});
  }
  function dispose() {
    disposed = true;
    layoutWork.cancel();
    visibility?.disconnect();
    if (active) active.cancelled = true;
    for (const id of [...pageRequests.keys()]) releasePage(id);
    for (const resolve of [...resolvers.values()]) resolve();
    window.clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('message', onMessage);
    window.removeEventListener('pagehide', pagehide);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape);
    window.removeEventListener('scroll', moved, true);
    window.removeEventListener('resize', moved);
    api.runtime.onMessage.removeListener(runtime);
    api.storage.onChanged.removeListener(changed);
    port?.disconnect();
    for (const node of [...controls.keys()]) remove(node);
    jobs.clear();
  }
  window.addEventListener('pagehide', pagehide);
  return { ready, scan, receive, dispose };
}
if (typeof window !== 'undefined' && getApi()?.runtime?.id)
  installDownloads({ window, api: getApi() });
