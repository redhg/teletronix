import { describe, expect, it } from "vitest";
import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import { createTestTerminal } from "./test-helpers.ts";

const FILE: TeletronixFile = {
    config: { name: "Test", reveal: "instant" },
    screens: {
        home: { content: ["home"] },
        boom: { content: ["boom"] },
    },
    dialogs: {
        note: { type: "alert", content: "Just so you know." },
        destruct: {
            type: "confirm",
            content: ["Self-destruct?"],
            confirm: { text: "DO IT", action: { screen: "boom" } },
            cancel: { action: { dialog: "note" } },
        },
        quiet: { type: "confirm", content: ["Sure?"], confirm: { action: { screen: "boom" } } },
    },
};

const screenId = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) =>
    terminal.getSnapshot().screen?.run.screen.id;

describe("dialog schema", () => {
    it("fills in defaults and normalizes content", () => {
        const result = parseProgram(FILE);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(result.program.dialogs.get("note")).toEqual({
            id: "note",
            type: "alert",
            content: ["Just so you know."],
            dismiss: "OK",
        });
        expect(result.program.dialogs.get("quiet")).toMatchObject({
            confirm: { text: "YES", action: [{ screen: "boom" }] },
            cancel: { text: "NO" },
        });
    });

    it("reports unknown targets in dialog actions", () => {
        const result = parseProgram({
            ...FILE,
            dialogs: {
                bad: {
                    type: "confirm",
                    content: ["?"],
                    confirm: { action: { screen: "nowhere" } },
                    cancel: { action: { dialog: "missing" } },
                },
            },
        });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "dialogs.bad.confirm.action", message: 'Unknown screen "nowhere"' },
            { path: "dialogs.bad.cancel.action", message: 'Unknown dialog "missing"' },
        ]);
    });
});

describe("dialogs", () => {
    it("closes an alert without doing anything else", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.dispatch([{ dialog: "note" }]);
        terminal.answerDialog(true);
        expect(terminal.getSnapshot().dialog).toBeNull();
        expect(screenId(terminal)).toBe("home");
    });

    it("runs the confirm action", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.openDialog("destruct");
        terminal.answerDialog(true);
        expect(terminal.getSnapshot().dialog).toBeNull();
        expect(screenId(terminal)).toBe("boom");
    });

    it("runs the cancel action, which can open another dialog", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.openDialog("destruct");
        terminal.answerDialog(false);
        expect(terminal.getSnapshot().dialog?.id).toBe("note");
        expect(screenId(terminal)).toBe("home");
    });

    it("just closes when cancel has no action", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.openDialog("quiet");
        terminal.answerDialog(false);
        expect(terminal.getSnapshot().dialog).toBeNull();
        expect(screenId(terminal)).toBe("home");
    });

    it("closes when navigating", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.openDialog("note");
        terminal.navigate("boom");
        expect(terminal.getSnapshot().dialog).toBeNull();
    });

    it("publishes one snapshot per answer", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.openDialog("destruct");
        let snapshots = 0;
        terminal.subscribe(() => snapshots++);
        terminal.answerDialog(true);
        expect(snapshots).toBe(1);
    });
});
