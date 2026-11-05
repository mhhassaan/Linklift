<p align="center">
  <img src="assets/logo.svg" alt="Linklift logo" width="128" height="128">
</p>
<h1 align="center">Linklift</h1>

Linklift is a browser extension for Chrome and Firefox that copies clean embed links from X (Twitter), Instagram, Reddit, and TikTok. It also adds photo copy and download actions on X.

## Features

- Copy a clean proxy link when choosing **Copy link** in a post's Share menu. Opening Share alone does not change the clipboard.
- Remove tracking parameters and URL fragments from copied post links.
- Choose an embed service or add a custom domain independently for each platform.
- Enable or disable link rewriting separately for each website to copy its original links whenever preferred.
- Manage all platforms together in a single dashboard, accessible from the popup's **Dashboard** button or the extension's options page.
- Copy or download an X still photo from the browser's **Linklift** context menu.
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
3. Refresh any open supported social-media tabs. When upgrading, approve the added site access if prompted.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose `dist/firefox/manifest.json`.
3. Allow the requested site access and refresh any open supported social-media tabs.

Temporary Firefox add-ons must be loaded again after restarting the browser. Persistent distribution requires a signed add-on.

After rebuilding, reload the extension in the browser's extension manager and refresh supported social-media tabs.

## Usage

### Share a post

Use the post's existing **Copy link** action, usually inside its Share menu. Linklift changes a recognized post URL to the selected proxy and removes tracking. Opening Share alone does not change the clipboard. X keeps Linklift's copy confirmation; the other platforms retain their own menu and copy feedback.

| Platform | Supported links | Default service | Included alternative |
| --- | --- | --- | --- |
| X / Twitter | Posts | `fixupx.com` | `fxtwitter.com` |
| Instagram | Posts, reels, carousel images | `zzinstagram.com` | `ddinstagram.com` |
| Reddit | Posts and comment permalinks | `vxreddit.com` | `rxddit.com` |
| TikTok | Videos and photo posts | `tfxktok.com` | `tnktok.com` |

Instagram carousel image selection (`img_index`) is preserved. Profile, feed, and unrecognized links retain their original copying behavior. Opaque short links are left unchanged unless the originating Reddit post supplies its canonical permalink.

On X, if copying fails, use the displayed original link or select **Use original Share**, reopen the post's Share menu, and choose **Copy link** again to use X's original copying behavior once. Other platforms retain their native error handling.

### Copy or download a photo

On X, right-click a photo and select **Linklift → Copy image** or **Linklift → Download image**. Linklift tries the original-size image first and falls back to the displayed rendition if necessary.

### Configure an embed service

Open the Linklift toolbar popup to add, select, or remove a service for the active platform. Use the platform buttons to switch sites, or open **Dashboard** to see every platform at once. Changes apply to the next copied link without refreshing the site.

Use the **On / Off** switch beside each platform's heading to toggle link rewriting. When off, the site's Copy link action copies its original URL, including any parameters the site supplies. Your selected proxy stays saved for when you turn rewriting back on. Changes apply to open tabs without a refresh. Turning off X link rewriting leaves its photo tools available.

Accepted entries include `fixupx`, `fxtwitter`, and full HTTPS domains such as `example.com`. A service must support that platform's original post path; custom URL paths and templates are not supported.

The bundled choices are documented by [InstaEmbedRouter](https://github.com/Knoppiix/InstaEmbedRouter), [InstaFix](https://github.com/Wikidepia/InstaFix), [vxReddit](https://github.com/dylanpdx/vxReddit), [FixReddit](https://github.com/MinnDevelopment/fxreddit), [FxTikTok](https://tfxktok.com/), and [fxTikTok](https://github.com/okdargy/fxTikTok). These are independent third-party services; inclusion does not guarantee uptime or embed compatibility. The original InstaFix repository is archived.

## Privacy and permissions

Linklift stores service preferences in local extension storage. It does not collect analytics, read clipboard contents, or send post links to a proxy when copying them.

The extension requests access to supported X/Twitter, Instagram, Reddit, and TikTok pages and `pbs.twimg.com`, plus permissions for clipboard writing, context menus, downloads, and storage. Chrome also uses an offscreen document to process images. Image requests occur only after a photo action and use the browser's existing access.

Image data is held temporarily for copying or downloading. Download association metadata is kept in session memory and cleaned up when work finishes. Copied clipboard content and saved files remain under user control.

## Limitations

- Still photos only; video and GIF downloading are not supported.
- Images are limited to 32 MiB and 48 million decoded pixels, with at most two retained downloads.
- Incomplete or paused downloads expire after five minutes. Closing or navigating the originating Firefox tab can cancel an incomplete download.
- Embed availability depends on the selected proxy and destination platform.
- Native Copy link detection currently recognizes English labels and supported site control identifiers. Other languages or interface changes can leave a link unchanged.
- Site changes may affect post, copy-action, photo, or light/dark theme detection. Unrecognized controls retain native behavior.

## Asset credits

[Varela Round](https://github.com/google/fonts/tree/main/ofl/varelaround) is distributed under the SIL Open Font License. Interface icons come from [Google Material Design Icons](https://github.com/google/material-design-icons) under Apache 2.0. Platform logo vectors come from [Simple Icons](https://github.com/simple-icons/simple-icons) under CC0; platform names and logos belong to their respective owners. Asset licenses are included in both browser packages.
