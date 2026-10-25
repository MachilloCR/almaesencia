import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PushState = "loading" | "inactive" | "active" | "unsupported" | "denied" | "needs-install";

const vapidPublicKey = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY;

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function AdminPushSettings() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
    } else if (Notification.permission === "denied") {
      setState("denied");
    } else if (ios && !isStandaloneApp()) {
      setState("needs-install");
    } else {
      navigator.serviceWorker.getRegistration("/admin/")
        .then((registration) => registration?.pushManager.getSubscription())
        .then((subscription) => setState(subscription ? "active" : "inactive"))
        .catch(() => setState("inactive"));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function activateNotifications() {
    setError(null);

    if (!vapidPublicKey) {
      setError("Las notificaciones todavía no están configuradas en el servidor.");
      return;
    }
    if (isIos && !isStandaloneApp()) {
      setState("needs-install");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "inactive");
        return;
      }

      const registration = await navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" });
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidPublicKey) as BufferSource,
      });
      const response = await fetch("/api/admin/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("No fue posible guardar la suscripción en el servidor.");
      setState("active");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible activar las notificaciones.");
      setState("inactive");
    }
  }

  async function deactivateNotifications() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/admin/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/admin/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("No fue posible desactivar la suscripción en el servidor.");
        await subscription.unsubscribe();
      }
      setState("inactive");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible desactivar las notificaciones.");
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-[0_4px_20px_-2px_rgba(134,54,93,0.05)] sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text-primary">Avisos de nuevos pedidos</h2>
        <p className="mt-1 text-xs leading-5 text-text-secondary" aria-live="polite">
          {state === "active" && "Este teléfono recibirá un aviso cuando llegue una solicitud."}
          {state === "inactive" && "Activa los avisos para enterarte de nuevas solicitudes."}
          {state === "loading" && "Revisando la configuración de este teléfono…"}
          {state === "unsupported" && "Este navegador no admite notificaciones web. Prueba desde la app instalada."}
          {state === "denied" && "El navegador bloqueó los avisos. Permítelos en la configuración del sitio."}
          {state === "needs-install" && "En iPhone, instala esta página en la pantalla de inicio y ábrela desde su icono para activar avisos."}
        </p>
        {error && <p className="mt-2 text-xs text-text-primary" role="alert">{error}</p>}
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap gap-2 sm:mt-0">
        {installPrompt && (
          <button className="min-h-11 rounded-full border border-brand-primary px-4 text-xs font-semibold text-brand-primary transition hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={installApp}>
            Instalar app
          </button>
        )}
        {state === "active" ? (
          <button className="min-h-11 rounded-full border border-border-subtle px-4 text-xs font-semibold text-text-secondary transition hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={deactivateNotifications}>
            Desactivar avisos
          </button>
        ) : state === "inactive" ? (
          <button className="min-h-11 rounded-full bg-brand-primary px-4 text-xs font-semibold text-white transition hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2" type="button" onClick={activateNotifications}>
            Activar avisos
          </button>
        ) : null}
      </div>
    </section>
  );
}
