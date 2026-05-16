// version.js — version string for the CLIENT (shown in Settings).
//
// ⚠️ When releasing, bump BOTH this file AND sw.js (top of file).
// The strings MUST match. They're in two files because the service worker's
// own bytes need to change for the browser to detect a new version
// (importScripts dependencies are NOT reliably re-checked across browsers).

self.APP_VERSION = '1.0.3';
