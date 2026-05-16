// updater.js — service worker update lifecycle.
//
// Detects when a new service worker is waiting, shows an in-app banner
// "✨ A new version is ready — tap to update", and handles the activate-and-reload
// flow when the user accepts.
//
// First install is silent (no banner) because there is no prior controller.
// Dismissed banner reappears on the next page load if the new SW is still waiting.
//
// Usage:
//   import { initUpdater } from './updater.js';
//   navigator.serviceWorker.register('./sw.js').then(reg => initUpdater(reg));

let registration = null;
let bannerMounted = false;
let reloadOnControllerChange = false;

export function initUpdater(reg) {
  registration = reg;

  // Reload the page exactly once when the new SW takes control (the user's tap
  // on "Update now" triggers SKIP_WAITING → controllerchange fires).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadOnControllerChange) return;
    reloadOnControllerChange = false;
    location.reload();
  });

  // Case A: the page loaded AFTER a new SW had already moved to 'installed'/'waiting'.
  if (reg.waiting && navigator.serviceWorker.controller) {
    onUpdateReady(reg.waiting);
  }

  // Case B: a new SW shows up while this page is open.
  reg.addEventListener('updatefound', () => {
    const newWorker = reg.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        onUpdateReady(newWorker);
      }
    });
  });
}

function onUpdateReady(worker) {
  if (bannerMounted) return; // no double-banner
  const host = document.getElementById('update-banner-host');
  if (!host) return;

  bannerMounted = true;
  host.innerHTML = `
    <div class="update-banner" role="status" aria-live="polite">
      <span class="update-banner-text">✨ A new version is ready</span>
      <button class="update-banner-btn" id="update-now-btn">Update now</button>
      <button class="update-banner-close" id="update-dismiss-btn" aria-label="Dismiss">×</button>
    </div>
  `;

  document.getElementById('update-now-btn').addEventListener('click', () => {
    // Arm the auto-reload BEFORE telling the SW to activate, so we don't miss the event.
    reloadOnControllerChange = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
    removeBanner();
  });

  document.getElementById('update-dismiss-btn').addEventListener('click', removeBanner);
}

function removeBanner() {
  const host = document.getElementById('update-banner-host');
  if (host) host.innerHTML = '';
  bannerMounted = false;
}

// Manual check used by the "Check for updates" button in Settings.
// Returns: 'no-sw' | 'update-found' | 'up-to-date'
// If 'update-found', the auto-banner will (or already does) show the prompt.
export async function checkForUpdates() {
  if (!registration) return 'no-sw';
  await registration.update();
  // Give updatefound + statechange a brief window to fire so we can reliably
  // tell "an update was found" from "nothing new".
  await new Promise(r => setTimeout(r, 800));
  return registration.waiting ? 'update-found' : 'up-to-date';
}
