// Ajouté au service worker : boutons « Pause » et « Stop » de la notification du chrono (Android).
// L'appli ouverte est prévenue par message ; sinon elle est ouverte avec #chrono=pause|stop.
self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'ouvrir';
  event.notification.close();
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = fenetres.find((c) => c.url.startsWith(self.registration.scope));
      if (app) {
        if (action !== 'ouvrir') app.postMessage({ chrono: action });
        return app.focus();
      }
      return self.clients.openWindow(`${self.registration.scope}${action !== 'ouvrir' ? `#chrono=${action}` : ''}`);
    })(),
  );
});
