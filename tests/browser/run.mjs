// Runs in CI on Linux with Xvfb. Uses an isolated copy of the release package.
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const browser = process.argv[2];
if (!['chrome', 'firefox'].includes(browser)) throw new Error('Choose chrome or firefox');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'linklift-browser-'));
const addon = path.join(scratch, 'addon'),
  downloads = path.join(scratch, 'downloads');
await cp(path.resolve('dist', browser), addon, { recursive: true });
await mkdir(downloads);
await cp('tests/browser/probe.html', path.join(addon, 'probe.html'));
await build({
  entryPoints: ['tests/browser/probe.js'],
  outfile: path.join(addon, 'probe.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
});
const manifest = JSON.parse(await readFile(path.join(addon, 'manifest.json'), 'utf8'));
let close = async () => {};
try {
  if (browser === 'chrome') {
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(path.join(scratch, 'profile'), {
      headless: false,
      args: [`--disable-extensions-except=${addon}`, `--load-extension=${addon}`],
      acceptDownloads: true,
    });
    close = () => context.close();
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const origin = new URL(worker.url()).origin,
      probe = await context.newPage();
    await probe.goto(origin + '/probe.html');
    const session = await context.newCDPSession(probe);
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloads,
    });
    await probe.locator('#clipboard').click();
    await probe.waitForFunction(() =>
      document.querySelector('#result').textContent.includes('"clipboard":true'),
    );
    await probe.locator('#paste').focus();
    await probe.keyboard.press('Control+v');
    assert.equal(
      await probe.locator('#paste').inputValue(),
      'https://fixupx.com/linklift/status/123',
    );
    await probe.locator('#download').click();
    await probe.waitForFunction(() =>
      document.querySelector('#result').textContent.includes('"download":true'),
    );
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.stopAllWorkers');
    await probe.locator('#wake').click();
    await probe.waitForFunction(() =>
      document.querySelector('#result').textContent.includes('"background":true'),
    );
    const dashboard = await context.newPage();
    await dashboard.goto(origin + '/dashboard/index.html');
    await dashboard.locator('.platform-card').last().waitFor();
    assert.equal(await dashboard.locator('.platform-card').count(), 4);
    await dashboard.screenshot({ path: 'browser-chrome.png', fullPage: true });
  } else {
    const { Builder, By, Key, until } = await import('selenium-webdriver');
    const { default: firefox } = await import('selenium-webdriver/firefox.js');
    const uuid = '513c3048-b7ed-4dcb-ae1b-6b45c0f336fb',
      id = manifest.browser_specific_settings.gecko.id;
    const options = new firefox.Options()
      .setPreference('xpinstall.signatures.required', false)
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ [id]: uuid }))
      .setPreference('browser.download.folderList', 2)
      .setPreference('browser.download.dir', downloads)
      .setPreference('browser.download.useDownloadDir', true);
    const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
    close = () => driver.quit();
    const zip = path.join(scratch, 'addon.zip');
    execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: addon });
    await driver.installAddon(zip, true);
    const origin = 'moz-extension://' + uuid;
    await driver.get(origin + '/probe.html');
    async function clickAndWait(button, flag) {
      await driver.findElement(By.id(button)).click();
      await driver.wait(async () => {
        const result = JSON.parse((await driver.findElement(By.id('result')).getText()) || '{}');
        if (result.error) throw new Error(result.error);
        return result[flag] === true;
      }, 20000);
    }
    await clickAndWait('clipboard', 'clipboard');
    const paste = await driver.findElement(By.id('paste'));
    await paste.sendKeys(Key.CONTROL, 'v', Key.NULL);
    assert.equal(await paste.getAttribute('value'), 'https://fixupx.com/linklift/status/123');
    await clickAndWait('download', 'download');
    await clickAndWait('wake', 'background');
    await driver.get(origin + '/dashboard/index.html');
    await driver.wait(until.elementLocated(By.css('.platform-card')), 10000);
    assert.equal((await driver.findElements(By.css('.platform-card'))).length, 4);
    await writeFile('browser-firefox.png', await driver.takeScreenshot(), 'base64');
  }
  const image = await readFile(path.join(downloads, 'linklift-browser-smoke.png'));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  console.log(
    `${browser}: installed extension clipboard, native image download, background messaging and dashboard passed${browser === 'chrome' ? ', including service-worker restart' : ''}`,
  );
} finally {
  await close();
  await rm(scratch, { recursive: true, force: true });
}
