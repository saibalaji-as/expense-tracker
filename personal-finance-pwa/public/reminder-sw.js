/**
 * reminder-sw.js
 * Standalone service worker for hourly expense reminders.
 *
 * Strategy: wall-clock based scheduling.
 * - On install/activate, reads the last-notified timestamp from IndexedDB.
 * - Uses setInterval (1-min tick) to check if `intervalMinutes` have elapsed
 *   since the last notification. If so, fires a notification.
 * - Receives config updates from the main thread via postMessage.
 * - On installed PWA (Android/Chrome), this SW stays alive and delivers
 *   notifications even when the app tab is not open.
 */

const DB_NAME = 'spenza-reminder';
const DB_VERSION = 1;
const STORE = 'config';

// Defaults — overridden by postMessage from NotificationService
let intervalMinutes = 60;
let enabled = false;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// ─── Notification dispatch ────────────────────────────────────────────────────

async function fireNotification() {
  await self.registration.showNotification('Spenza 💸', {
    body: "Don't forget to log your expenses!",
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'spenza-reminder',          // replaces previous notification instead of stacking
    renotify: true,
    data: { url: '/daily' },
  });
  await dbSet('lastNotifiedAt', Date.now());
}

// ─── Wall-clock check ─────────────────────────────────────────────────────────

async function checkAndNotify() {
  // Re-read config from IDB in case it was updated while SW was sleeping
  const storedEnabled = await dbGet('enabled');
  const storedInterval = await dbGet('intervalMinutes');

  if (storedEnabled !== undefined) enabled = storedEnabled;
  if (storedInterval !== undefined) intervalMinutes = storedInterval;

  if (!enabled) return;

  const lastNotifiedAt = (await dbGet('lastNotifiedAt')) ?? 0;
  const elapsed = Date.now() - lastNotifiedAt;
  const threshold = intervalMinutes * 60 * 1000;

  if (elapsed >= threshold) {
    await fireNotification();
  }
}

// ─── Tick every minute ────────────────────────────────────────────────────────

let tickHandle = null;

function startTicking() {
  if (tickHandle !== null) return;
  // Check immediately on start, then every minute
  checkAndNotify().catch(() => {});
  tickHandle = setInterval(() => {
    checkAndNotify().catch(() => {});
  }, 60 * 1000);
}

// ─── SW lifecycle ─────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    clients.claim().then(() => {
      startTicking();
    })
  );
});

// ─── Messages from main thread ────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data ?? {};

  if (type === 'REMINDER_CONFIG') {
    enabled = payload.enabled;
    intervalMinutes = payload.intervalMinutes;

    // Persist to IDB so the SW can read it after a restart
    await dbSet('enabled', enabled);
    await dbSet('intervalMinutes', intervalMinutes);

    // If just enabled, reset the clock so the first notification fires
    // after a full interval (not immediately)
    if (enabled) {
      await dbSet('lastNotifiedAt', Date.now());
    }

    startTicking();
  }

  if (type === 'REMINDER_CHECK_NOW') {
    // Called when the app opens — check if we missed a notification
    await checkAndNotify();
  }
});

// ─── Notification click → open app ───────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/daily';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});
