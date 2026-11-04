import {normalizeService} from './settings.js';
export const X_HOSTS = new Set(['x.com','www.x.com','twitter.com','www.twitter.com']);
export function isXUrl(input) {
  try { const url=new URL(input); return url.protocol==='https:' && X_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password; } catch { return false; }
}
export function canonicalPostUrl(input) {
  if(!isXUrl(input)) throw new Error('INVALID_POST');
  const url=new URL(input);
  const match=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,30})(?:\/(?:photo|video)\/[1-9]\d*)?\/?$/);
  if(!match) throw new Error('INVALID_POST');
  return `https://x.com/${match[1]}/status/${match[2]}`;
}
export function transformPostUrl(input,domain) {
  const canonical=new URL(canonicalPostUrl(input));
  return `https://${normalizeService(domain)}${canonical.pathname}`;
}
