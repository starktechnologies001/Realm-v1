self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    
    // Client-side Mute Check (redundant if Server filters, but good safety)
    if (data.muted === true) return;

    const options = {
      body: data.body,
      icon: '/pwa-192x192.png', // Fallback to standard PWA icon location or vite.svg
      badge: '/vite.svg',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
        click_action: data.url
      },
      tag: data.tag || 'general-notification'
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (err) {
    console.error('Error processing push event:', err);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Open the app or focus existing tab
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is open, focus it
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/');
      }
    })
  );
});
