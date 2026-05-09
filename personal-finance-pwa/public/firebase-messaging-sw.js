// Firebase Cloud Messaging Service Worker
// This handles background push notifications when the app is not in focus

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// TODO: Replace with your actual Firebase configuration
firebase.initializeApp({
  apiKey: "AIzaSyBAIhHX1sfUPpRpHTdLUf5TE0snqI904hg",
  authDomain: "spenza-notifications.firebaseapp.com",
  projectId: "spenza-notifications",
  storageBucket: "spenza-notifications.firebasestorage.app",
  messagingSenderId: "663004583066",
  appId: "1:663004583066:web:86e047231fb0cb858afb23"
});

const messaging = firebase.messaging();

// Handle background messages (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'Spenza 💸';
  const notificationOptions = {
    body: payload.notification?.body || "Don't forget to log your expenses!",
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'spenza-reminder',
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { 
      url: payload.data?.url || '/daily',
      dateOfArrival: Date.now()
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification.tag);
  
  event.notification.close();

  // Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const url = event.notification.data?.url || '/daily';
        
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window if not already open
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
