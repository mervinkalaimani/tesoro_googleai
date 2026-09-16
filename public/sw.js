// Tesoro service worker: push notifications only. No fetch handler, so nothing
// is cached and the app loads exactly as it would without it.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "Tesoro", body: event.data ? event.data.text() : "" };
  }

  const approval = msg.kind === "approval" && msg.token;
  event.waitUntil(
    self.registration.showNotification(msg.title || "Tesoro", {
      body: msg.body || "",
      tag: msg.tag,
      icon: "/tesoro_app_icon_light.svg",
      badge: "/tesoro_app_icon_light.svg",
      data: msg,
      // Android and desktop Chrome show these as buttons. iOS does not show
      // action buttons: tapping opens the app, where the bell has both.
      actions: approval
        ? [
            { action: "approve", title: "Approve" },
            { action: "reject", title: "Reject" },
          ]
        : [],
      requireInteraction: Boolean(approval),
    }),
  );
});

async function openApp(url) {
  const target = new URL(url || "/", self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin === self.location.origin) {
      await client.focus();
      if ("navigate" in client) return client.navigate(target);
      return;
    }
  }
  return self.clients.openWindow(target);
}

async function decide(msg, decision) {
  try {
    const res = await fetch("/api/push/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: msg.token, decision }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);

    // Tell open tabs so the bell and the admin page drop the request.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: "tesoro-approval-decided", sno: msg.sno });

    await self.registration.showNotification(
      decision === "approve" ? "Access granted" : "Request rejected",
      {
        body: out.name || msg.name || "",
        tag: msg.tag,
        icon: "/tesoro_app_icon_light.svg",
        badge: "/tesoro_app_icon_light.svg",
        data: { url: "/admin" },
      },
    );
  } catch (err) {
    await self.registration.showNotification("Could not update that account", {
      body: `${err && err.message ? err.message : "Something went wrong"} Tap to open the app.`,
      tag: msg.tag,
      icon: "/tesoro_app_icon_light.svg",
      data: { url: msg.url || "/admin" },
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  const msg = event.notification.data || {};
  event.notification.close();
  if ((event.action === "approve" || event.action === "reject") && msg.token) {
    event.waitUntil(decide(msg, event.action));
    return;
  }
  event.waitUntil(openApp(msg.url));
});
