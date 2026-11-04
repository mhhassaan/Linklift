import test from 'node:test';
import assert from 'node:assert/strict';
const rules = await import('../src/shared/settings.js').catch(() => ({}));
test('normalizes known service shortcuts and HTTPS origins', () => {
  assert.equal(typeof rules.normalizeService, 'function', 'Settings rules must exist');
  assert.equal(rules.normalizeService(' fixupx '), 'fixupx.com');
  assert.equal(rules.normalizeService('fxtwitter'), 'fxtwitter.com');
  assert.equal(rules.normalizeService('https://EXAMPLE.com/'), 'example.com');
});
test('rejects guessed suffixes, credentials, paths, ports, IPs and schemes', () => {
  for (const value of ['unknown','http://example.com','example.com/path','user:pass@example.com','example.com:443','127.0.0.1','https://example.com/?x=1','javascript:alert(1)']) assert.throws(() => rules.normalizeService(value), value);
});
test('repairs invalid entries and restores the default when active service disappears', () => {
  assert.deepEqual(rules.repairSettings({version:1,services:['custom.example','bad/path'],activeDomain:'gone.example'}).settings, {version:1,services:['custom.example','fixupx.com'],activeDomain:'fixupx.com'});
});
test('preserves an unknown newer schema instead of overwriting it', () => {
  const newer = {version:2,services:['something'],extra:'keep'};
  assert.throws(() => rules.repairSettings(newer), {message:'CONFIG_VERSION'});
  assert.equal(newer.extra,'keep');
});
