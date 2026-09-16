// Kill-switch pour l'ancien service worker de la racine.
//
// Quand le calculateur d'horaires vivait à la racine du site, son service
// worker s'y était enregistré avec la portée "/" et mettait "/" et
// "/index.html" en cache. Maintenant que la racine sert la page d'accueil des
// applications, cet ancien worker continuerait à servir le calculateur depuis
// son cache et masquerait la page d'accueil.
//
// Aucune page n'enregistre ce fichier : le navigateur le récupère tout seul
// lors du contrôle de mise à jour de l'enregistrement existant, voit qu'il a
// changé, l'installe, puis ce worker se désinscrit et recharge les onglets
// concernés. Les caches des applications, eux, appartiennent à des
// enregistrements de portée plus étroite (/horaires/, /shadow/, ...) et ne
// sont pas touchés.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      if ("navigate" in client) client.navigate(client.url);
    }
  })());
});
