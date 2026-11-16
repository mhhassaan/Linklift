# Linklift: stable release and modernization comparison

Comparison date: 16 November 2026.

| Version | Source | Purpose |
| --- | --- | --- |
| Stable | `main`, commit `4bcf690c30d9525e40b010d28ecced396561051f`, release `v0.4.1` | Current downloadable Chrome and Firefox packages |
| Modernization | `modern-web-improvements`, based on that same commit | Separate development branch; does not replace the stable release |

This compares the original and modernized Linklift implementations. Both still build into separate Chrome and Firefox packages. The modernization branch retains manifest version `0.4.1` while it is under development; a future published update needs a new version.

## Overview

| Area | Stable implementation | Modernization branch | Practical result |
| --- | --- | --- | --- |
| Feed updates | Every observed change schedules whole-document discovery | Local changes inside known X/Reddit posts update those posts; new/unknown structures trigger discovery | Less repeated work in long feeds |
| Floating controls | Scroll handlers immediately position every control | Events coalesce into frame work; geometry reads precede position writes; distant controls are skipped/hidden | Fewer repeated positioning passes |
| Platform discovery | Several platform branches inside the download controller | A shared adapter interface exposes discovery, post ID, media and action mount | Easier to maintain platform differences |
| Download options | Unlabelled form, no explicit button association, no initial focus | Labelled form, `aria-controls`, first visible field focus, Escape returns focus | More predictable keyboard use |
| Menu positioning | Manual viewport calculations | Feature-detected CSS anchors with manual positioning fallback | Native positioning where supported; existing browser floors retained |
| Small option arrows | Some hit areas only 16–22 px wide | Minimum 24 px width and 24–28 px height | Easier to target without enlarging the primary icon |
| Settings validation | Shared status message | Error beside the relevant input, invalid state and description association | Clearer correction path |
| Settings list changes | Replacing the card loses draft and focus | Draft and a suitable focus target survive the rebuild | Less disruption when adding/removing services |
| Secondary text | Several labels at 9–11 px | Most secondary controls/labels use 12 px | Better readability; popup can need more scrolling |
| Builds | Write into existing output folders | Remove each exact browser output folder first, reject redirected paths | Stale files cannot silently remain in a new package |
| Quality checks | Build, Node/JSDOM regression tests and package checks | Adds lint, focused checked JavaScript, formatting checks and CI | More repeatable development verification |
| Browser testing | Mocked browser APIs and browser replay fixtures | Adds installed-extension smoke runners for Chromium and Firefox in CI | Real API coverage when those jobs run; not a substitute for live social-site checks |

## Features deliberately preserved

- Supported platforms: X/Twitter, Instagram, Reddit and TikTok.
- Share opens the site's normal menu. Only Copy/Copy link rewrites the URL.
- Per-site services, custom proxy domains, rewriting switches and independent download-button switches.
- Rewriting disabled means copying the original URL.
- Best available download quality by default, with explicit media/quality/save-location choices.
- Reddit's current-image/all-images gallery choice and sequential downloads.
- Instagram post/reel ownership, comment-media filtering and current-carousel selection.
- TikTok video source resolution rather than saving a video cover image.
- Browser-local GIF conversion, real GIF output and no saved intermediate MP4.
- Cancellation, completion feedback, bounded processing, media allowlists and existing recovery logic.
- Linklift branding, bundled Varela Round font, fixed 390 × 520 popup and themed scrollbar.
- Chrome 121+ and Firefox 128+ targets.
- Production permissions, host access, extension IDs, storage keys and settings schema.
- No new analytics, external font requests, remote executable code or runtime framework.

## Performance changes and their boundaries

### Local mutations

The mutation observer records affected, already-known X/Reddit post roots. A source change inside one such root can update its media choices without discovering every post again. Extension-owned control insertion/removal is ignored, avoiding unnecessary follow-up scans caused by its own UI.

New posts, unknown structure changes, preferences and newly received media records still request a full scan. Instagram and TikTok also retain full discovery because dialogs, shared action rails and duplicated previews can move ownership outside the changed node. This is an intentional correctness fallback, not a claim that all document scans have been removed.

The repeatable long-feed test uses **80 X posts**. It changes one image source and asserts **zero additional document-level post-discovery queries**, then inserts and removes a post to verify discovery and cleanup still work. The stable version fails the zero-query assertion. This measures eliminated discovery work, not CPU time, memory usage or a percentage speedup.

### Layout work

Repeated scroll/resize work is coalesced into a frame. Floating-control geometry is read before position updates are written. IntersectionObserver tracks roots near the viewport, with a 600 px margin, and floating controls outside that region are hidden. Browsers without the observer keep the full positioning fallback.

Initial scan placement stays synchronous and batched so controls are positioned correctly when initialization completes. Pending frame work and viewport observation are cancelled on disposal.

## Accessibility and settings behavior

- Download forms have an accessible name and an explicit relationship to their option button within each control's shadow root.
- Opening options focuses the first visible field; gallery prompts focus their first action. Escape closes the panel and restores focus.
- Native form controls are retained; the form is not misrepresented as an ARIA menu.
- CSS anchor positioning is used only when the required positioning features are detected. Manual clamping remains available.
- Custom-service errors identify the input with `aria-invalid` and an error description. Editing clears the error.
- Adding/removing services preserves an in-progress custom-service draft and restores focus to a surviving control or the input.
- Changes still save automatically. There is no new Save step or settings migration.

Larger text and option targets can consume a little more space. The popup keeps its fixed height and scrolls its content; the browser's outer popup shape remains browser-controlled.

## Build and tooling changes

- New `scripts/output.mjs` removes only `dist/chrome`, `dist/firefox`, or their validation equivalents before rebuilding. It checks for symlinks/junctions along the target path. `dist/releases` is preserved.
- ESLint checks application, test and build JavaScript for correctness issues. Explicit reference release assignments remain allowed.
- Prettier checks the files touched by this modernization; it is not a claim that the entire historical repository has been reformatted.
- Type checking begins with the new frame-scheduling module using JSDoc and `checkJs`. The whole application is **not** type checked yet.
- Error wrapping in media fetch/clipboard adapters now preserves the original error as `cause` without changing user-facing error codes.
- Development dependencies added: ESLint, its recommended config, browser/Node globals, Prettier, TypeScript, Playwright and Selenium WebDriver. They are not bundled as extension runtime dependencies.
- Runtime dependencies remain gifenc and Mediabunny. Their notices and packaged licenses remain included.
- A substantial part of the source diff is formatting of the edited files, rather than new behavior.

New commands:

```sh
npm run lint
npm run format:check
npm run typecheck
npm run check
npm run test:browser:chrome
npm run test:browser:firefox
```

The browser runners target Linux CI with Xvfb. The Firefox runner uses the system `zip` command and installs an unsigned temporary add-on. It is not a portable one-command Windows browser test yet.

## Browser-test scope

The workflow builds the production packages, copies one into a temporary test folder and adds a local probe page. It does not add probe files or broader permissions to released packages.

| Check | Chromium runner | Firefox runner |
| --- | --- | --- |
| Install actual extension package copy | Yes | Yes, temporary add-on |
| Clipboard write and native paste round trip | Yes | Yes |
| Save a packaged PNG with the downloads API and inspect saved bytes | Yes | Yes |
| Request settings through the production background | Yes | Yes |
| Open dashboard and verify four platform cards | Yes | Yes |
| Stop service workers, then wake background with a request | Yes | No equivalent forced event-page suspension check |
| Exercise live X/Instagram/Reddit/TikTok layouts and CDN downloads | No | No |

These smoke checks supplement the existing regression suite. They do not certify every live social-media layout, logged-in state, expiring CDN URL, GIF conversion or browser-version combination. Browser CI results and local verification are recorded below separately.

## Regressions found during implementation

| Finding | Cause | Resolution |
| --- | --- | --- |
| Instagram floating control initially had no position | Moving all placement to a later frame changed initialization behavior | Initial scan now completes batched placement before returning |
| TikTok preloaded-card control was initially visible | Visibility had also been deferred | Initial placement/visibility is restored; existing layout tests pass |
| Offscreen floating control could remain visible | Skipping a distant root did not hide its previously positioned control | Distant floating controls are explicitly hidden and restored on re-entry |
| A removed button did not recover after a website redraw | Mutation filtering treated the site's removal like Linklift's own insertion | Disconnected registered controls are remounted; a new regression test reproduces the baseline recovery behavior |

The first two were caught by existing regression tests; the latter two have new targeted tests. The redraw regression was identified by an independent code review. They are implementation findings, not known remaining defects in the final branch.

## Verification record

- Stable baseline: **158 passing tests** — 153 unit/regression tests plus 5 package tests — and both browser builds.
- Modernization: **167 passing tests** — 162 unit/regression tests plus 5 package tests — with zero failures and zero skips in the final verification run. Both browser builds, lint, formatting check, focused type check and whitespace check pass.
- Nine new tests cover inline errors, draft/focus preservation, panel keyboard behavior, frame coalescing/cancellation, viewport cleanup, local mutation discovery, redraw recovery and clean-build safety. The junction test needed normal Windows execution access; it passed in the final run rather than being silently omitted.
- Browser preview: dashboard and popup visually inspected; an invalid Instagram service produced an inline error and returned focus to the input. Preview uses mocked extension APIs and does not establish installed-extension behavior.
- Installed-browser CI: pending first branch run. No success claim is made before the jobs complete.

## Remaining risks and limits

1. Social platforms can change their markup or deny media requests. Existing unavailable/expired-media cases remain possible; no automatic TikTok retry feature was added.
2. CSS anchor positioning and native popover behavior need real-browser coverage across supported versions. Feature detection retains the older positioning path.
3. Live logged-in layouts and all real CDN downloads have not been exhaustively retested for this branch.
4. Firefox background suspension is covered by existing simulated recovery tests, not a new forced-suspension browser test.
5. Incremental typing and formatting cover a defined starting scope; extending them to the entire repository remains future work.

## Review and rollback

The stable download remains [Linklift v0.4.1](https://github.com/mhhassaan/Linklift/releases/tag/v0.4.1), with both browser ZIPs. The modernization branch is intentionally separate. Compare it with main, test it with a separate browser profile, and publish a new version only after accepting it. Switching back to main and rebuilding restores the stable implementation; no production settings migration is required.
