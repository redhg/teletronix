// A session's join code, e.g. "BCDF-1234": four letters, then four digits, so each half can
// only be one kind of character, and nothing can be read as something else. The letters are
// consonants without L (no words, rude or otherwise; nothing like a digit). Typed in, it's
// forgiving: any case, any spaces or dashes, and O, I and L read as 0, 1 and 1 among the
// digits. About 1.6 billion of them; the relay limits tries.
//
// A session's secret is the GM's alone: long and random, kept by the panel, never typed.

/** The letters a code's first half is made of. */
export const CODE_LETTERS = "BCDFGHJKMNPQRSTVWXYZ";
const DIGITS = "0123456789";

/** Random numbers, without crypto.randomUUID (which browsers keep for secure pages, and
 * Teletronix served to a network is plain http, e.g. http://192.168.2.139:4173). */
const random = (count: number) => Array.from(crypto.getRandomValues(new Uint32Array(count)));

/** A new join code: "BCDF-1234". */
export function newJoinCode(): string {
    const [a, b, c, d, ...digits] = random(8);
    const letters = [a, b, c, d].map((n) => CODE_LETTERS[(n ?? 0) % CODE_LETTERS.length]);
    return `${letters.join("")}-${digits.map((n) => DIGITS[n % 10]).join("")}`;
}

/** As digits, the letters that look like them. */
const LOOK_ALIKE: Record<string, string> = { O: "0", I: "1", L: "1" };

/**
 * A code as typed, cleaned up ("bcdf 12o4" → "BCDF-1204"), or null if it can't be one. The
 * letters can't be read as digits the other way: no digit looks like one of them.
 */
export function cleanJoinCode(typed: string): string | null {
    const plain = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (plain.length !== 8) return null;
    const letters = plain.slice(0, 4);
    const digits = [...plain.slice(4)].map((char) => LOOK_ALIKE[char] ?? char).join("");
    if (![...letters].every((char) => CODE_LETTERS.includes(char))) return null;
    if (!/^\d{4}$/.test(digits)) return null;
    return `${letters}-${digits}`;
}

/** Whether a code is one, exactly as written ("BCDF-1234"). */
export const isJoinCode = (code: string) => cleanJoinCode(code) === code;

/** A session's secret, for the GM's panel alone: 128 random bits, as 28 letters and digits. */
export const newSecret = (): string =>
    random(4)
        .map((n) => n.toString(36).padStart(7, "0"))
        .join("");

/** A random id, e.g. for a message or a players' window. */
export const randomId = (): string =>
    random(4)
        .map((n) => n.toString(36))
        .join("-");
