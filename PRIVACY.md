# Privacy Policy

[Overview](README.md) · **Privacy Policy** · [Terms of Use](TERMS.md)

**Last updated: November 12, 2026** · Developer: [mhhassaan](https://github.com/mhhassaan)

## At a glance

- No analytics, advertising trackers, developer-operated backend or sale of user data.
- Preferences stay in local extension storage; Linklift does not use browser sync.
- Linklift writes requested links or images to the clipboard. It does not read existing clipboard contents.
- GIF conversion and audio/video joining run inside your browser.

## What stays in your browser

Linklift processes supported post URLs, media URLs, available qualities and page appearance to provide its features. It observes supported pages' existing media responses and embedded metadata, retaining a bounded in-page cache of post/media identifiers, rendition URLs, dimensions and bitrates. This discovery cache does not retain complete response bodies, account information, authorization headers or cookies.

Your selected services, custom domains and per-site switches remain in local extension storage until you change them, clear the extension's data or uninstall it.

## Network requests

| Action | What happens |
| :--- | :--- |
| **Copy an embed link** | The proxy URL is constructed locally. Copying alone does not contact the proxy. |
| **Open or share that link** | The selected proxy and destination application may receive the shared URL and normal connection information, such as an IP address. Their own privacy practices apply. |
| **Copy or download X photos** | The selected image is requested from `pbs.twimg.com`; normal browser request policies apply. |
| **Download post media** | The requested media is fetched from a supported platform CDN. Quality choices may request a media manifest; unresolved media may request the post's metadata or page. |
| **Download Instagram MP4s** | The browser's download manager requests the selected original MP4 directly. |
| **Download TikTok videos** | The open TikTok page requests the selected video using its normal session. The browser may attach existing cookies under its ordinary cookie and cross-origin policies. |

These third-party services receive normal request information, including your IP address. CDN requests made by Linklift's local processing helper omit cookies. Linklift does not read, inspect or store cookies or passwords. It does not upload media to a conversion service. Fonts, logos and icons are bundled locally.

## Temporary data and saved files

- Selected media bytes are held temporarily to copy, convert or download the requested file. TikTok videos use a temporary page-owned Blob URL.
- Temporary source references, workers and media URLs are released after completion, failure, cancellation or expiry. Download leases expire after five minutes.
- Download-association metadata is stored in browser session storage and cleaned up when work finishes; it does not survive browser shutdown.
- MP4-backed GIFs save as actual GIFs. No intermediate MP4 is saved to Downloads.
- Final downloaded files, browser download records and copied clipboard content remain under your control. Linklift does not automatically delete them. Your browser and operating system manage their own memory and network caches.

## Permissions

| Permission | Purpose |
| :--- | :--- |
| **Supported websites and media CDNs** | Find post actions and available media; fetch requested files and metadata. |
| **Clipboard writing** | Copy requested links and images. |
| **Downloads** | Save media and track completion, cancellation or failure. The browser may describe this as access to download history; Linklift uses it to manage its own downloads, not to collect browsing history. |
| **Context menus** | Offer X photo-copy and download actions. |
| **Storage** | Keep local preferences and temporary download-association metadata. |
| **Offscreen document — Chrome** | Process media locally. |

## Your choices

You can disable link rewriting and download controls independently for each website, remove custom services, cancel active work, clear stored preferences or uninstall Linklift. Turning off a site's controls does not revoke its browser-granted permissions; site access is managed in your browser's extension settings.

## Contact and changes

Ask privacy questions through [GitHub Issues](https://github.com/mhhassaan/Linklift/issues). This policy will be updated if Linklift's data handling changes.
