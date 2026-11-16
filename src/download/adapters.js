import {
  instagramRoots,
  instagramPostId,
  isCommentMedia,
  isVideoNode,
  redditMedia,
  actionMount,
} from './dom.js';
import { tiktokRoots, tiktokPostId, tiktokMediaScope } from './tiktok-dom.js';

/**
 * Platform discovery boundary. Lifecycle, jobs and controls stay in content.js.
 * @param {'x'|'instagram'|'reddit'|'tiktok'} platform
 * @param {Window} window
 * @param {(root: ShadowRoot) => void} observeShadow
 */
export function createPlatformAdapter(platform, window, observeShadow) {
  const document = window.document;
  return {
    findPosts() {
      if (platform === 'instagram') return instagramRoots(document, window.location);
      if (platform === 'tiktok') return tiktokRoots(document);
      return [
        ...document.querySelectorAll(
          platform === 'x'
            ? 'article[data-testid="tweet"],[role="dialog"]'
            : 'shreddit-post,.thing[data-fullname]',
        ),
      ];
    },
    getPostId(root) {
      if (platform === 'instagram') return instagramPostId(root, window.location);
      if (platform === 'tiktok') return tiktokPostId(root, window.location);
      if (platform === 'reddit')
        return (
          (root.getAttribute('post-id') || root.getAttribute('data-fullname') || '').replace(
            /^t3_/,
            '',
          ) ||
          root.querySelector('a[href*="/comments/"]')?.href.match(/\/comments\/([a-z0-9]+)/)?.[1]
        );
      const links = [...root.querySelectorAll('a[href*="/status/"]')].filter(
        (link) => !link.closest('[data-testid="quoteTweet"]'),
      );
      const link = links.find((link) => link.querySelector('time')) || links[0];
      return (link?.href || window.location.href).match(/\/status\/(\d+)/)?.[1];
    },
    getMedia(root) {
      if (platform === 'tiktok') root = tiktokMediaScope(root, window.location);
      const nodes =
        platform === 'reddit'
          ? redditMedia(root, observeShadow)
          : [
              ...root.querySelectorAll(
                platform === 'x'
                  ? '[data-testid="tweetPhoto"] img,[data-testid="videoPlayer"] video,video'
                  : 'img,video',
              ),
            ];
      let clean = nodes.filter(
        (node) =>
          !(platform === 'instagram' && isCommentMedia(node, root)) &&
          !node.closest(
            'header,[data-testid="UserAvatar-Container"],.author,[data-testid="quoteTweet"],[hidden],[aria-hidden="true"]',
          ) &&
          !/profile picture/i.test(node.alt || '') &&
          !(
            node.tagName === 'IMG' &&
            ((node.width > 0 && node.width < 100) || (node.height > 0 && node.height < 70))
          ),
      );
      if (platform === 'instagram' && clean.length && root.querySelector('[aria-label="Save"]')) {
        let branch = clean[0];
        while (
          branch.parentElement &&
          branch.parentElement !== root &&
          !branch.parentElement.querySelector('[aria-label="Save"]')
        )
          branch = branch.parentElement;
        if (branch !== clean[0]) clean = clean.filter((node) => branch.contains(node));
      }
      if (platform === 'instagram' || platform === 'tiktok') {
        const videos = clean.filter(isVideoNode);
        if (videos.length)
          return platform === 'instagram'
            ? clean.filter(
                (node) =>
                  isVideoNode(node) ||
                  (node.closest('li') && !node.closest('li').querySelector('video')),
              )
            : videos;
        if (platform === 'tiktok') {
          const player = root.querySelector('[data-e2e="feed-video"]');
          if (player && !/\/photo\//.test(window.location.pathname)) return [player];
        }
      }
      return clean;
    },
    getActionMount(root) {
      return actionMount(root, platform);
    },
  };
}
