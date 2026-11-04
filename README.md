<p align="center">
  <img src="assets/logo.svg" alt="TweetX logo" width="128" height="128">
</p>
<h1 align="center">TweetX</h1>

TweetX is a browser extension for Chrome and Firefox that copies clean X (Twitter) post links and adds photo copy and download actions.

## Features

- Copy a clean proxy link when choosing **Copy link** in a post's Share menu. Opening Share alone does not change the clipboard.
- Remove tracking parameters and URL fragments from copied post links.
- Choose an embed service or add a custom domain. The default service is `fixupx.com`.
- Copy or download a still photo from the browser's **TweetX** context menu.
- Keep settings locally without analytics or remote tracking.

Example:

```text
https://x.com/username/status/1234567890?s=20
                         ↓
https://fixupx.com/username/status/1234567890
```

## Requirements

- Desktop Chrome or Firefox.
- Node.js 24, version 24.15.0 or newer, and npm to build from source.

The recommended Node.js version is recorded in `.node-version`.

## Build

```sh
npm ci
npm run build
```

The build produces `dist/chrome/` and `dist/firefox/`.

On Windows PowerShell, use `npm.cmd` if the `npm` script launcher is restricted.

## Installation

### Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose the `dist/chrome/` directory.
3. Refresh any open X tabs.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose `dist/firefox/manifest.json`.
3. Allow the requested site access and refresh any open X tabs.

Temporary Firefox add-ons must be loaded again after restarting the browser. Persistent distribution requires a signed add-on.

After rebuilding, reload the extension in the browser's extension manager and refresh X tabs.

## Usage

### Share a post

Click the post's existing Share button, then choose **Copy link**. TweetX copies the cleaned proxy link and shows a confirmation. Opening the Share menu or choosing another sharing option does not trigger TweetX copying. Paste the copied link into the destination application.

If copying fails, use the displayed original link or select **Use original Share**, reopen the post's Share menu, and choose **Copy link** again to use X's original copying behavior once.

### Copy or download a photo

Right-click a photo and select **TweetX → Copy image** or **TweetX → Download image**. TweetX tries the original-size image first and falls back to the displayed rendition if necessary.

### Configure an embed service

Open the TweetX toolbar popup to add, select, or remove a service. Accepted entries include `fixupx`, `fxtwitter`, and full HTTPS domains such as `example.com`. Custom URL paths and templates are not supported.

## Privacy and permissions

TweetX stores service preferences in local extension storage. It does not collect analytics, read clipboard contents, or send post links to a proxy when copying them.

The extension requests access to X/Twitter pages and `pbs.twimg.com`, plus permissions for clipboard writing, context menus, downloads, and storage. Chrome also uses an offscreen document to process images. Image requests occur only after a photo action and use the browser's existing access.

Image data is held temporarily for copying or downloading. Download association metadata is kept in session memory and cleaned up when work finishes. Copied clipboard content and saved files remain under user control.

## Limitations

- Still photos only; video and GIF downloading are not supported.
- Images are limited to 32 MiB and 48 million decoded pixels, with at most two retained downloads.
- Incomplete or paused downloads expire after five minutes. Closing or navigating the originating Firefox tab can cancel an incomplete download.
- Embed availability depends on the selected proxy and destination platform.
- Changes to X's interface may affect post or photo detection. Unrecognized Share controls retain X's native behavior.

## Development

```sh
npm test                 # Unit tests
npm run check            # Build, unit tests, and package checks
npm run build:validation # Separate development builds with fault controls
```

Validation builds are written to `dist/validation/chrome/` and `dist/validation/firefox/`. Load only one release or validation copy per browser at a time.

The project uses vanilla JavaScript, Manifest V3, esbuild, and Node's test runner with jsdom. Source code is in `src/`, browser manifests in `manifests/`, and extension artwork in `assets/`.
