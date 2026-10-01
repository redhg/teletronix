import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../runtime/screen-run.ts";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "./program.ts";

const file = (preset: object, extra: object = {}): TeletronixFile => ({
    config: { name: "Test", reveal: "instant" },
    screens: {
        boot: { preset: { type: "boot", ...preset }, ...extra } as never,
        home: { content: ["HOME"] },
    },
});

const texts = (input: TeletronixFile) => {
    const result = parseProgram(input);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("boot")?.content ?? [];
};

describe("the boot preset", () => {
    it("becomes a title, a memory test, a checklist and a last line", () => {
        const content = texts(file({}));
        expect(content.map((element) => element.type)).toEqual([
            "text",
            "text",
            "text",
            "counter",
            "text",
            "checklist",
            "text",
            "text",
        ]);
        expect(content[0]).toMatchObject({ text: "TELETRONIX SYSTEM BIOS v1.0" });
        expect(content[3]).toMatchObject({ to: 640, label: "MEMORY TEST: ", done: " OK" });
        expect(content.at(-1)).toMatchObject({ text: "BOOT COMPLETE." });
    });

    it("takes its own wording, and leaves out what's false", () => {
        const content = texts(
            file({
                title: "MU-TH-UR 6000",
                copyright: false,
                memory: { size: 64, unit: " WORDS" },
                checks: ["LIFE SUPPORT", { text: "CRYO", status: "[FAIL]" }],
                status: "[ONLINE]",
                ready: false,
            }),
        );
        expect(content.map((element) => element.type)).toEqual([
            "text",
            "text",
            "counter",
            "text",
            "checklist",
        ]);
        expect(content[0]).toMatchObject({ text: "MU-TH-UR 6000" });
        expect(content[2]).toMatchObject({ to: 64, unit: " WORDS", label: "MEMORY TEST: " });
        expect(content[4]).toMatchObject({
            status: "[ONLINE]",
            items: ["LIFE SUPPORT", { text: "CRYO", status: "[FAIL]" }],
        });
        expect(texts(file({ memory: 128 }))[3]).toMatchObject({ to: 128 });
    });

    it("puts the screen's own content after it, then the pause", () => {
        const content = texts(file({ pause: "HIT A KEY" }, { content: ["EXTRA"] }));
        expect(content.slice(-3)).toMatchObject([
            { text: "EXTRA" },
            { text: "" },
            { type: "pause", text: "HIT A KEY" },
        ]);
        expect(texts(file({ pause: true })).at(-1)).toMatchObject({
            type: "pause",
            text: "PRESS ANY KEY TO CONTINUE",
        });
    });

    it("goes to its next screen once it has finished", () => {
        const { terminal, ticker } = createTestTerminal(file({ next: "home", after: 500 }));
        terminal.navigate("boot");
        ticker.advance(20_000, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
    });

    it("waits for a key first, with a pause", () => {
        const { terminal, ticker } = createTestTerminal(file({ next: "home", pause: true }));
        terminal.navigate("boot");
        ticker.advance(20_000, 10);
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(run.screen.id).toBe("boot");
        terminal.pressKey(" ");
        ticker.advance(10, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
    });

    it("is needed by a screen without content", () => {
        const result = parseProgram({ config: { name: "Test" }, screens: { empty: {} } });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ path: "screens.empty.content" })]),
        );
    });

    it("reports an unknown next screen", () => {
        const result = parseProgram({
            config: { name: "Test" },
            screens: { boot: { preset: { type: "boot", next: "nowhere" } } },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]?.message).toBe('Unknown screen "nowhere"');
    });
});

const screenFile = (preset: object, extra: object = {}): TeletronixFile => ({
    config: { name: "Test", reveal: "instant", start: "home" },
    screens: {
        home: { content: ["HOME"] },
        preset: { preset, ...extra } as never,
        elsewhere: { content: ["ELSEWHERE"] },
    },
});

const expanded = (preset: object) => {
    const result = parseProgram(screenFile(preset));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const screen = result.program.screens.get("preset");
    return { content: screen?.content ?? [], next: screen?.next };
};

describe("the shutdown preset", () => {
    it("stops things, says so, switches off, and waits to go to the start screen", () => {
        const { content, next } = expanded({ type: "shutdown" });
        expect(content.map((element) => element.type)).toEqual([
            "text",
            "text",
            "checklist",
            "text",
            "text",
            "power-off",
            "pause",
        ]);
        expect(content[4]).toMatchObject({ text: "IT IS NOW SAFE TO TURN OFF YOUR COMPUTER." });
        expect(content[5]).toMatchObject({ delay: 1500 });
        expect(next).toEqual([{ after: 0, action: [{ screen: "home" }] }]);
    });

    it("can stay on, or off for good, and go elsewhere", () => {
        const on = expanded({ type: "shutdown", powerOff: false, next: "elsewhere" });
        expect(on.content.slice(-2)).toMatchObject([{ text: "" }, { type: "pause" }]);
        expect(on.next?.[0]?.action).toEqual([{ screen: "elsewhere" }]);

        const forever = expanded({ type: "shutdown", restart: false, checks: false });
        expect(forever.content.at(-1)?.type).toBe("power-off");
        expect(forever.next).toBeUndefined();
    });

    it("switches off, then back on with a key", () => {
        const { terminal, ticker } = createTestTerminal(
            screenFile({ type: "shutdown", after: 100 }),
        );
        terminal.navigate("preset");
        ticker.advance(20_000, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("preset");
        terminal.pressKey("x");
        ticker.advance(10, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
    });
});

describe("the error preset", () => {
    it("puts its lines in a box, each centered, then waits to restart", () => {
        const { content, next } = expanded({
            type: "error",
            title: "OOPS",
            message: ["A LONGER LINE"],
            code: false,
        });
        expect(content[0]).toMatchObject({
            type: "text",
            text: "    OOPS\n\nA LONGER LINE",
            align: "center",
            className: "alert error-box",
        });
        expect(content.at(-1)).toMatchObject({
            type: "pause",
            text: "PRESS ANY KEY TO RESTART",
            className: "alert",
        });
        expect(next?.[0]?.action).toEqual([{ screen: "home" }]);
    });

    it("can stay for good", () => {
        const { content, next } = expanded({ type: "error", restart: false });
        expect(content.map((element) => element.type)).toEqual(["text"]);
        expect(next).toBeUndefined();
    });
});

describe("the crash preset", () => {
    it("goes on for good, unless it has a next screen", () => {
        const forever = expanded({ type: "crash", message: "BOOM" });
        expect(forever.content).toMatchObject([{ type: "crash", message: ["BOOM"] }]);
        expect(forever.next).toBeUndefined();

        const restarts = expanded({ type: "crash", next: "home" });
        expect(restarts.content.map((element) => element.type)).toEqual(["crash", "pause"]);
        expect(restarts.next?.[0]?.action).toEqual([{ screen: "home" }]);
    });
});

describe("the hex editor preset", () => {
    it("is a hex dump filling the screen, with a header bar and an exit", () => {
        const result = parseProgram(
            screenFile({ type: "hexeditor", file: "CREW.DAT", size: 256, text: "SECRET" }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const screen = result.program.screens.get("preset");
        expect(screen?.content).toMatchObject([
            {
                type: "hexdump",
                rows: "fill",
                statusBar: true,
                size: 256,
                text: "SECRET",
                exit: { key: ["escape"], action: [{ screen: "home" }] },
            },
        ]);
        expect(screen?.header).toEqual([
            {
                left: { text: "HEXEDIT 2.1  CREW.DAT" },
                right: { text: "ESC: EXIT", action: [{ screen: "home" }] },
            },
        ]);
        expect(screen?.footer).toBe(false);
        // (no next rule: a tap on the screen shouldn't leave)
        expect(screen?.next).toBeUndefined();
    });
});

describe("the login preset", () => {
    it("is a warning, then a login going to its next screen", () => {
        const { content } = expanded({
            type: "login",
            accounts: [{ user: "ripley", password: "jonesy" }],
            next: "elsewhere",
            attempts: 3,
            lockout: "home",
        });
        expect(content).toMatchObject([
            { type: "text", text: "AUTHORIZED PERSONNEL ONLY", className: "alert" },
            { type: "text", text: "" },
            {
                type: "login",
                attempts: 3,
                granted: "ACCESS GRANTED.",
                action: [{ screen: "elsewhere" }],
                onLocked: [{ screen: "home" }],
            },
        ]);
    });

    it("goes to the start screen by default, and can leave out its lines", () => {
        const { content } = expanded({
            type: "login",
            accounts: [{ user: "a", password: "b" }],
            title: false,
            granted: false,
        });
        expect(content).toHaveLength(1);
        expect(content[0]).toMatchObject({ type: "login", action: [{ screen: "home" }] });
        expect(content[0]).not.toHaveProperty("granted");
    });
});

describe("the decrypt preset", () => {
    it("is a title, then the message decrypting, going on when it's done or fails", () => {
        const { content } = expanded({
            type: "decrypt",
            text: ["SECRET", "PLANS"],
            next: "home",
            failNext: "elsewhere",
            failAt: 60,
        });
        expect(content).toMatchObject([
            { type: "text", text: "INTERCEPTED TRANSMISSION. DECRYPTING..." },
            { type: "text", text: "" },
            {
                type: "decrypt",
                text: "SECRET\nPLANS",
                bar: "DECRYPTING ",
                failAt: 60,
                onComplete: { after: 1500, action: [{ screen: "home" }] },
                onFail: { after: 1500, action: [{ screen: "elsewhere" }] },
            },
        ]);
    });

    it("can leave out its title and bar, and stay", () => {
        const { content } = expanded({ type: "decrypt", text: "X", title: false, bar: false });
        expect(content).toHaveLength(1);
        expect(content[0]).not.toHaveProperty("bar");
        expect(content[0]).not.toHaveProperty("onComplete");
    });
});

describe("the countdown preset", () => {
    it("is a blinking warning, a big timer, and an abort code", () => {
        const { content } = expanded({
            type: "countdown",
            seconds: 90,
            code: 1138,
            aborted: "elsewhere",
            next: "home",
        });
        expect(content).toMatchObject([
            { type: "text", className: "alert blink" },
            { type: "text", text: "" },
            { type: "text", text: "ALL PERSONNEL EVACUATE IMMEDIATELY." },
            { type: "text", text: "" },
            {
                type: "timer",
                label: "T-MINUS ",
                from: 90,
                to: 0,
                big: true,
                onComplete: [{ screen: "home" }],
            },
            { type: "text", text: "" },
            {
                type: "number",
                prompt: "ABORT CODE: ",
                digits: 4,
                on: [{ equals: 1138, action: [{ screen: "elsewhere" }] }],
                unknown: "INVALID CODE.",
            },
        ]);
    });

    it("goes to the start screen by default, without a code to type", () => {
        const { content } = expanded({ type: "countdown", title: false, message: false });
        expect(content).toMatchObject([
            { type: "timer", from: 60, onComplete: [{ screen: "home" }] },
        ]);
    });
});

describe("the transmission preset", () => {
    it("locks on, types the message slowly through static, and signs off", () => {
        const result = parseProgram(
            screenFile({
                type: "transmission",
                from: "FROM: NOSTROMO",
                text: ["THIS IS RIPLEY.", "SIGNING OFF."],
                pause: true,
                next: "home",
            }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const screen = result.program.screens.get("preset");
        expect(screen?.content).toMatchObject([
            { type: "text", text: "INCOMING TRANSMISSION" },
            { type: "spinner", label: "ACQUIRING SIGNAL ", done: "LOCKED" },
            { type: "text", text: "FROM: NOSTROMO" },
            { type: "text", text: "" },
            {
                type: "text",
                text: "THIS IS RIPLEY.\nSIGNING OFF.",
                reveal: { type: "teletype", speed: 40 },
            },
            { type: "text", text: "" },
            { type: "text", text: "-- END OF TRANSMISSION --" },
            { type: "text", text: "" },
            { type: "pause", text: "PRESS ANY KEY TO CONTINUE" },
        ]);
        expect(screen?.next).toEqual([{ after: 0, action: [{ screen: "home" }] }]);
        expect(screen?.effects).toMatchObject({ static: { opacity: 0.12 }, flicker: true });
    });

    it("can be quiet, and keep the screen's own effects", () => {
        const quiet = parseProgram(
            screenFile({ type: "transmission", text: "HI", noise: false, acquire: false }),
        );
        if (!quiet.ok) throw new Error(JSON.stringify(quiet.errors));
        expect(quiet.program.screens.get("preset")?.effects).toBeUndefined();
        const own = parseProgram(
            screenFile({ type: "transmission", text: "HI" }, { effects: { vignette: true } }),
        );
        if (!own.ok) throw new Error(JSON.stringify(own.errors));
        expect(own.program.screens.get("preset")?.effects).toEqual({ vignette: true });
    });
});

describe("the modem preset", () => {
    it("resets, dials, shakes hands with a crackle, and connects", () => {
        const { content, next } = expanded({ type: "modem", next: "home" });
        expect(content).toMatchObject([
            { type: "text", text: "ATZ" },
            { type: "text", text: "OK" },
            { type: "text", text: "ATDT 555-0199" },
            { type: "spinner", label: "DIALING " },
            { type: "text", text: "CARRIER DETECTED", reveal: { type: "glitch", duration: 2500 } },
            { type: "text", text: "CONNECT 2400" },
        ]);
        expect(next).toEqual([{ after: 1000, action: [{ screen: "home" }] }]);
    });

    it("can leave out its steps", () => {
        const { content } = expanded({
            type: "modem",
            init: false,
            dialing: false,
            carrier: false,
            connect: false,
            dial: "ATDT 911",
        });
        expect(content).toMatchObject([{ type: "text", text: "ATDT 911" }]);
    });
});

describe("the inbox preset", () => {
    it("lists messages in columns, each opening to show its body", () => {
        const { content } = expanded({
            type: "inbox",
            messages: [
                {
                    from: "MOTHER",
                    subject: "SPECIAL ORDER 937",
                    date: "06-03",
                    body: "CREW EXPENDABLE.",
                    unread: true,
                },
                { from: "DALLAS", subject: "CREW MEETING", body: ["MESS HALL.", "1800 HOURS."] },
            ],
        });
        expect(content).toMatchObject([
            { type: "text", text: "INBOX" },
            { type: "text", text: "" },
            { type: "text", text: "    FROM    SUBJECT            DATE" },
            {
                type: "section",
                title: "* MOTHER  SPECIAL ORDER 937  06-03",
                markers: { closed: "►", open: "▼" },
                content: [{ text: "" }, { text: "CREW EXPENDABLE." }, { text: "" }],
            },
            {
                type: "section",
                title: "  DALLAS  CREW MEETING",
                content: [
                    { text: "" },
                    { text: "MESS HALL." },
                    { text: "1800 HOURS." },
                    { text: "" },
                ],
            },
        ]);
    });

    it("cuts long columns short", () => {
        const { content } = expanded({
            type: "inbox",
            title: false,
            labels: false,
            messages: [{ from: "A VERY LONG SENDER NAME INDEED", subject: "HI", body: "X" }],
        });
        expect(content[0]).toMatchObject({ title: "  A VERY LONG SEN~  HI" });
    });
});

describe("the directory preset", () => {
    const entries = [
        { name: "LOGS", dir: true, date: "06-01-22" },
        { name: "CREW.DAT", size: 2048, date: "06-03-22", action: { screen: "home" } },
        { name: "NOTES.TXT", size: 128 },
    ];

    it("lists files DOS-style, with links for those that open", () => {
        const { content } = expanded({ type: "directory", path: "C:\\NOSTROMO", entries });
        expect(content).toMatchObject([
            { type: "text", text: " Volume in drive C is TELETRONIX" },
            { type: "text", text: " Directory of C:\\NOSTROMO" },
            { type: "text", text: "" },
            { type: "text", text: "LOGS          <DIR>  06-01-22" },
            { type: "link", text: "CREW.DAT      2,048  06-03-22", action: [{ screen: "home" }] },
            { type: "text", text: "NOTES.TXT       128" },
            { type: "text", text: "         2 file(s)         2,176 bytes" },
        ]);
    });

    it("lists files Unix-style", () => {
        const { content } = expanded({ type: "directory", style: "unix", entries, total: false });
        expect(content).toMatchObject([
            { type: "text", text: "$ ls -l /home/user" },
            { type: "text", text: "drwxr-xr-x   4096  06-01-22  LOGS/" },
            { type: "link", text: "-rw-r--r--   2048  06-03-22  CREW.DAT" },
            { type: "text", text: "-rw-r--r--    128            NOTES.TXT" },
        ]);
    });
});
