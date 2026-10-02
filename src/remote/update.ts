import { useEffect, useState } from "react";

/**
 * A new version of Teletronix waiting to take over. Normally it waits until every Teletronix
 * tab and window has closed (so it never interrupts a game); this lets the GM choose the
 * moment instead. Returns a function that switches to it and reloads, or null if there's
 * nothing waiting (or no offline cache, e.g. the dev server or a plain-http address).
 */
export function useWaitingUpdate(): (() => void) | null {
    const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        let stopped = false;
        const check = (registration: ServiceWorkerRegistration) => {
            // (the first install takes over by itself: only a replacement waits)
            if (!stopped && registration.waiting && navigator.serviceWorker.controller) {
                setWaiting(registration.waiting);
            }
        };
        navigator.serviceWorker.getRegistration().then((registration) => {
            if (!registration || stopped) return;
            check(registration);
            registration.addEventListener("updatefound", () => {
                const installing = registration.installing;
                installing?.addEventListener("statechange", () => {
                    if (installing.state === "installed") check(registration);
                });
            });
            // (look for one now, rather than at the browser's next check)
            registration.update().catch(() => {});
        });
        return () => {
            stopped = true;
        };
    }, []);

    if (!waiting) return null;
    return () => {
        navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
            once: true,
        });
        waiting.postMessage({ type: "SKIP_WAITING" });
    };
}
