// An installed app always opens at its start address, with no program in it, so it opens
// the last program played on this device instead (with its options, such as ?kiosk).

const KEY = "teletronix:last-program";

/** Whether this page is running as an installed app, rather than in a browser tab. */
const installed = () =>
    matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches ||
    // Safari on iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Remembers the address of a program as it starts playing. */
export function rememberProgram(search: string): void {
    try {
        localStorage.setItem(KEY, search);
    } catch {
        // not remembered; the app will open the sample
    }
}

/** For an installed app opened with no program: the address of the last one played. */
export function lastProgram(search: string): string {
    if (search || !installed()) return search;
    try {
        return localStorage.getItem(KEY) ?? search;
    } catch {
        return search;
    }
}
