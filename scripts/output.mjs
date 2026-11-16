import { lstat, realpath, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Remove only an exact browser build directory, rejecting redirected paths.
 * @param {string} workspace
 * @param {'chrome'|'firefox'} browser
 * @param {boolean} validation
 */
export async function cleanOutput(workspace, browser, validation = false) {
  if (!['chrome', 'firefox'].includes(browser)) throw new Error('Invalid build browser');
  const base = await realpath(workspace),
    parts = validation ? ['dist', 'validation', browser] : ['dist', browser];
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('Refusing redirected build output');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!current.startsWith(base + path.sep)) throw new Error('Output escaped workspace');
  await rm(current, { recursive: true, force: true });
  await mkdir(current, { recursive: true });
  return current;
}
