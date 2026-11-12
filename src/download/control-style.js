export const CONTROL_STYLE=`
:host{all:initial;position:relative;display:inline-flex;flex-shrink:0;align-items:center;gap:6px;font:inherit;color:#71767b;vertical-align:middle;line-height:1.3;color-scheme:light}
:host([data-layout=row]){display:flex;justify-content:flex-end;flex-basis:100%;grid-column:1/-1;box-sizing:border-box;width:100%;padding:6px 0;gap:8px;flex-wrap:wrap}
:host([data-layout=floating]){position:fixed!important;z-index:1000;display:inline-flex!important;width:auto!important;max-width:64px;isolation:isolate}
*{box-sizing:border-box}button,select,input{font:inherit}button{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:inherit;border-radius:999px;cursor:pointer;min-width:32px;height:32px;padding:0 8px;font-size:12px;font-weight:500;transition:background .12s,color .12s}
button:hover{background:#1d9bf017;color:#1d9bf0}button:disabled{opacity:.55;cursor:wait}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}
.split{display:inline-flex;align-items:center;gap:0;border-radius:999px}.split svg{display:block;width:18px;height:18px;stroke-width:1.8}.split .chevron{width:14px;height:14px}.split [data-action=options]{min-width:22px;padding:0 3px;height:28px}.download-label{display:none;margin-left:5px}:host([data-layout=row]) .download-label{display:inline}:host([data-layout=row]) .split{box-shadow:inset 0 0 0 1px #71767b33;padding:1px 3px}
:host([data-platform=reddit]) .download-label{display:inline;font-weight:600}:host([data-platform=reddit]) .split{background:var(--ll-pill-bg,#e5ebee);color:var(--ll-pill-fg,#0f1a1c);padding:0 4px;box-shadow:none}:host([data-platform=reddit][data-mode=dark]) .split{background:var(--ll-pill-bg,#2a3236);color:var(--ll-pill-fg,#f2f4f5)}:host([data-platform=reddit]) button:hover{background:#88909625;color:inherit}:host([data-platform=reddit]) .split svg{width:16px;height:16px}
:host([data-platform=instagram]){color:#262626}:host([data-platform=instagram][data-mode=dark]){color:#f5f5f5}:host([data-platform=instagram]) [data-action=download]{width:40px;height:40px;padding:8px}:host([data-platform=instagram]) [data-action=download] svg{width:24px;height:24px;stroke-width:2}:host([data-platform=instagram]) .split button:hover{background:transparent;color:inherit;opacity:.65}
.gallery-prompt{display:flex;flex-direction:column;gap:8px}.gallery-prompt p{margin:0 0 4px}.gallery-prompt button{width:100%;justify-content:flex-start;border-radius:8px;background:#1d9bf010}.gallery-prompt button[data-action=download-all]{background:#1d9bf0;color:white}
form{position:fixed;inset:auto;margin:0;z-index:2147483647;background:#fff;color:#0f1419;border:1px solid #e3e7eb;border-radius:14px;padding:14px;box-shadow:0 8px 32px #0003;width:250px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-y:auto;font:13px/1.4 system-ui,sans-serif;text-align:left}
form label{display:block;margin:0 0 12px}select{display:block;width:100%;border:1px solid #d6dce2;border-radius:8px;background:#f5f7f9;color:inherit;padding:7px;margin-top:5px;font-size:12px}label.check{display:flex;align-items:center;gap:7px}input{accent-color:#1d9bf0}form button[type=submit]{width:100%;background:#1d9bf0;color:#fff;height:34px}
.status{font:12px/1.4 system-ui,sans-serif;max-width:240px;white-space:normal}.status[data-error=true]{color:#dc4455}:host([data-layout=action]) .status{position:absolute;right:0;bottom:100%;padding:8px 10px;border-radius:9px;background:#fff;box-shadow:0 2px 12px #0002;z-index:50}.status:empty,[hidden]{display:none!important}.cancel{font-size:12px}
:host([data-mode=dark]){color:#929aa2;color-scheme:dark}:host([data-mode=dark]) form{background:#16181c;color:#e7e9ea;border-color:#333639}:host([data-mode=dark]) select{background:#202327;border-color:#3a3e43}:host([data-mode=dark][data-layout=action]) .status{background:#16181c}
:host([data-layout=floating]) .status{position:absolute;right:0;bottom:100%;min-width:110px;padding:8px 10px;border-radius:9px;background:#fff;box-shadow:0 2px 12px #0002;z-index:50}:host([data-mode=dark][data-layout=floating]) .status{background:#16181c}:host([hidden]){display:none!important}
.feedback{display:contents}
:host([data-layout=native-row]){align-self:center;margin:0 4px;z-index:1}
:host([data-layout=native-rail]){display:flex;flex-direction:column;align-items:center;align-self:center;justify-content:center;width:48px;margin:8px 0;z-index:1}
:host([data-layout=native-rail]) .split{flex-direction:column}
:host([data-layout=native-rail]) .split [data-action=options]{height:20px;width:32px}
:host([data-platform=instagram]){color:#262626}:host([data-platform=instagram][data-mode=dark]){color:#f5f5f5}
:host([data-platform=instagram]) [data-action=download]{width:32px;height:40px;padding:4px}
:host([data-platform=instagram]) .split [data-action=options]{min-width:16px;width:16px;padding:0}
:host([data-platform=instagram][data-layout=native-rail]) [data-action=download]{width:48px;height:48px;padding:12px}
:host([data-platform=tiktok]){color:#161823}:host([data-platform=tiktok][data-mode=dark]){color:#fff}
:host([data-platform=tiktok]) [data-action=download]{width:48px;height:48px;padding:12px;background:#1618230f}
:host([data-platform=tiktok][data-mode=dark]) [data-action=download]{background:#ffffff1f}
:host([data-platform=tiktok]) [data-action=download] svg{width:24px;height:24px;stroke:none}
:host([data-platform=tiktok]) .split{flex-direction:column}
:host([data-platform=tiktok]) .split [data-action=options]{height:20px}
:host([data-platform=instagram]) .feedback,:host([data-platform=tiktok]) .feedback{position:fixed;inset:auto;left:50%;bottom:24px;margin:0;border:0;transform:translateX(-50%);display:flex;align-items:center;gap:14px;max-width:calc(100vw - 32px);width:max-content;padding:12px 16px;background:#262626;color:#fff;border-radius:12px;box-shadow:0 4px 24px #0003;z-index:2147483646}
:host([data-platform=instagram]) .feedback:not(:has(.status:not(:empty))),:host([data-platform=tiktok]) .feedback:not(:has(.status:not(:empty))){display:none}
:host([data-platform=instagram]) .feedback .status,:host([data-platform=tiktok]) .feedback .status{position:static;min-width:0;max-width:300px;background:transparent;padding:0;box-shadow:none;color:inherit}
:host([data-platform=instagram]) .feedback .status[data-error=true],:host([data-platform=tiktok]) .feedback .status[data-error=true]{color:#ffafb8}
.feedback .cancel{flex-shrink:0}
:host([data-platform=instagram]) .feedback .cancel,:host([data-platform=tiktok]) .feedback .cancel{color:#fff;background:#ffffff20;padding:0 12px}
@media(prefers-reduced-motion:reduce){button{transition:none}}
`;
