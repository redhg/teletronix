// Which relay a page's sessions go through. A page served from this computer or its network
// (`npm run dev`, `npm run table`, the desktop app) has a relay of its own, beside it, so
// sessions work without internet. Anywhere else (Teletronix online, e.g. teletronix.net) has
// none: its sessions go through Teletronix's relay on the internet (relay/cloudflare.ts).
//
// Only a build can choose another (VITE_RELAY, VITE_RELAY_MODE): never an address, which
// anyone could send in a link.

/** Teletronix's relay on the internet. */
export const INTERNET_RELAY: string =
    import.meta.env.VITE_RELAY ?? "wss://teletronix-play.redhg.workers.dev/remote/socket";

/** Hosts on this computer or its local network. */
export function isLocalHost(host: string): boolean {
    const name = host.replace(/^\[|\]$/g, "");
    if (name === "localhost" || name === "::1" || name.endsWith(".local")) return true;
    const parts = name.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
    const [a, b] = parts as [number, number];
    return (
        a === 127 ||
        a === 10 ||
        (a === 192 && b === 168) ||
        (a === 172 && b >= 16 && b <= 31) ||
        // (link-local, e.g. a direct cable between two computers)
        (a === 169 && b === 254)
    );
}

/** The relay's WebSocket for a session, by its join code. */
export function relayAddress(code: string, page: URL = new URL(location.href)): string {
    const internet =
        import.meta.env.VITE_RELAY_MODE === "internet" ||
        (import.meta.env.VITE_RELAY_MODE !== "local" && !isLocalHost(page.hostname));
    const url = internet ? new URL(INTERNET_RELAY) : new URL("remote/socket", page);
    if (!internet) url.protocol = page.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("code", code);
    return url.toString();
}
