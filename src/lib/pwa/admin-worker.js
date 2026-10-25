const fallbackNotification = {
  title: "Nueva solicitud",
  body: "Recibiste un nuevo pedido en Alma Esencia CR.",
  url: "/admin/",
};

self.addEventListener("push", (event) => {
  let message = fallbackNotification;

  try {
    const payload = event.data?.json();
    message = {
      title: typeof payload?.title === "string" ? payload.title : fallbackNotification.title,
      body: typeof payload?.body === "string" ? payload.body : fallbackNotification.body,
      url: typeof payload?.url === "string" && payload.url.startsWith("/admin/")
        ? payload.url
        : fallbackNotification.url,
      tag: typeof payload?.tag === "string" ? payload.tag : "almaesencia-new-order",
    };
  } catch {
    // Show a useful fallback if the push provider sends an empty payload.
  }

  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    icon: "/admin/icon-192.png",
    badge: "/admin/icon-192.png",
    data: { url: message.url },
    tag: message.tag,
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin/", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const adminWindow = windows.find((client) => client.url.startsWith(`${self.location.origin}/admin/`));

    if (adminWindow) {
      await adminWindow.focus();
      if ("navigate" in adminWindow && adminWindow.url !== targetUrl) await adminWindow.navigate(targetUrl);
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});
