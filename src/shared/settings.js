export const SETTINGS_KEY = 'tweetx.settings';
export const DEFAULT_SETTINGS = Object.freeze({version:1, services:['fixupx.com','fxtwitter.com'], activeDomain:'fixupx.com'});
export const defaults = () => structuredClone(DEFAULT_SETTINGS);

export function normalizeService(input) {
  if (typeof input !== 'string') throw new Error('CONFIG_INVALID');
  let value = input.trim().toLowerCase();
  if (value === 'fixupx' || value === 'fxtwitter') value += '.com';
  if (!value || /\s/.test(value)) throw new Error('CONFIG_INVALID');
  // Reject explicit ports, including :443, before URL parsing normalizes them away.
  const authority = value.replace(/^https:\/\//,'').replace(/\/$/,'');
  if (authority.includes(':') || authority.includes('@')) throw new Error('CONFIG_INVALID');
  let url;
  try { url = new URL(value.includes('://') ? value : `https://${value}`); }
  catch { throw new Error('CONFIG_INVALID'); }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || host.length > 253 || !host.includes('.') || /^[\d.]+$/.test(host) || host.endsWith('.') || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('CONFIG_INVALID');
  return host;
}

export function validateSettings(value) {
  if (value?.version !== 1) throw new Error('CONFIG_VERSION');
  if (Object.keys(value).sort().join(',') !== 'activeDomain,services,version' || !Array.isArray(value.services) || value.services.length < 1 || value.services.length > 20) throw new Error('CONFIG_INVALID');
  const services = value.services.map(normalizeService);
  if (new Set(services).size !== services.length || !services.includes(value.activeDomain)) throw new Error('CONFIG_INVALID');
  return {version:1,services,activeDomain:normalizeService(value.activeDomain)};
}

export function repairSettings(value) {
  if (value === undefined || value === null) return {settings:defaults(), repaired:false};
  if (value.version !== 1) throw new Error('CONFIG_VERSION');
  const services = [];
  for (const entry of Array.isArray(value.services) ? value.services : []) {
    try { const host=normalizeService(entry); if(!services.includes(host) && services.length<20) services.push(host); } catch { /* invalid local entry */ }
  }
  let activeDomain;
  try { activeDomain=normalizeService(value.activeDomain); } catch { /* restore default */ }
  if (!services.includes(activeDomain)) {
    activeDomain='fixupx.com';
    if(!services.includes(activeDomain)) { if(services.length===20) services.pop(); services.push(activeDomain); }
  }
  const settings={version:1,services,activeDomain};
  return {settings,repaired:JSON.stringify(value)!==JSON.stringify(settings)};
}
