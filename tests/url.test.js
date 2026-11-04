import test from 'node:test';
import assert from 'node:assert/strict';
const rules = await import('../src/shared/url.js').catch(() => ({}));

test('transforms the supplied link without rounding the post ID', () => {
  assert.equal(typeof rules.transformPostUrl, 'function', 'URL rules must exist');
  assert.equal(rules.transformPostUrl('https://x.com/DAIEvolutionHub/status/2117531010070122972?a=tracking&s=20', 'fixupx.com'), 'https://fixupx.com/DAIEvolutionHub/status/2117531010070122972');
});
test('canonicalizes viewer routes and legacy hosts while removing fragments', () => {
  assert.equal(rules.canonicalPostUrl('https://twitter.com/person/status/123/photo/2?s=20#x'), 'https://x.com/person/status/123');
  assert.equal(rules.canonicalPostUrl('https://www.x.com/person/status/123/video/1'), 'https://x.com/person/status/123');
});
test('rejects unrelated hosts, non-post routes and unsafe replacement domains', () => {
  for (const url of ['https://x.com.evil.test/a/status/1','https://x.com/home','http://x.com/a/status/1','https://x.com/a/status/1/anything']) assert.throws(() => rules.canonicalPostUrl(url));
  assert.throws(() => rules.transformPostUrl('https://x.com/a/status/1','evil.test/a'));
});
