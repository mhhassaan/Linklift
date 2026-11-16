import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanOutput } from '../scripts/output.mjs';
test('clean browser builds remove stale files and preserve other packages and release ZIPs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'linklift-build-'));
  try {
    for (const folder of ['chrome', 'firefox', 'releases']) {
      await mkdir(path.join(root, 'dist', folder), { recursive: true });
      await writeFile(path.join(root, 'dist', folder, 'keep.txt'), 'fixture');
    }
    await cleanOutput(root, 'chrome');
    await assert.rejects(access(path.join(root, 'dist/chrome/keep.txt')));
    await access(path.join(root, 'dist/firefox/keep.txt'));
    await access(path.join(root, 'dist/releases/keep.txt'));
    await assert.rejects(cleanOutput(root, 'releases'), /Invalid build browser/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('build cleanup rejects a directory symlink or junction', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'linklift-link-'));
  try {
    await mkdir(path.join(root, 'actual'));
    try {
      await symlink(path.join(root, 'actual'), path.join(root, 'dist'), 'junction');
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('OS policy prevents creating test junctions');
        return;
      }
      throw error;
    }
    await assert.rejects(cleanOutput(root, 'chrome'), /redirected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
