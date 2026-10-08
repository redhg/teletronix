import { describe, expect, it } from "vitest";
import { fitsForm, kindOf, withKind, withSetting } from "./actions.ts";

const choices = { screens: ["home", "bridge"], dialogs: ["warning"] };

describe("an action in the form", () => {
    it("fits when it does one thing, with a sound and variables", () => {
        expect(fitsForm(undefined)).toBe(true);
        expect(fitsForm({ screen: "home", sound: "beep", set: { keycard: true } })).toBe(true);
        expect(fitsForm({ screen: "home", frame: "right" })).toBe(true);
        expect(fitsForm({ back: true })).toBe(true);
        expect(fitsForm({ view: "a.png", sound: "beep" })).toBe(true);
        expect(fitsForm({ view: { src: "t.mp4", osd: true, onEnd: { screen: "x" } } })).toBe(true);
    });

    it("doesn't fit with cases, a choice at random, or a timer", () => {
        expect(fitsForm([{ screen: "home" }])).toBe(false);
        expect(fitsForm({ screen: ["home", "bridge"] })).toBe(false);
        expect(fitsForm({ screen: "home", startTimer: "clock" })).toBe(false);
        expect(fitsForm({ if: { keycard: true }, screen: "home" })).toBe(false);
        expect(fitsForm({ view: { src: "a.png", zoom: 2 } })).toBe(false);
        expect(fitsForm("home")).toBe(false);
    });

    it("says what it mainly does", () => {
        expect(kindOf(undefined)).toBe(null);
        expect(kindOf({ screen: "home", set: {} })).toBe("screen");
        expect(kindOf({ dialog: "warning" })).toBe("dialog");
        expect(kindOf({ view: "a.png" })).toBe("view");
        expect(kindOf({ back: true })).toBe("back");
        expect(kindOf({ restart: true })).toBe("restart");
        expect(kindOf({ sound: "beep" })).toBe("none");
    });

    it("does something else, keeping its sound and variables", () => {
        const action = { screen: "bridge", frame: "right", sound: "beep", set: { n: 1 } };
        expect(withKind(action, "dialog", choices)).toEqual({
            dialog: "warning",
            set: { n: 1 },
            sound: "beep",
        });
        expect(withKind(action, "back", choices)).toEqual({
            back: true,
            set: { n: 1 },
            sound: "beep",
        });
        // a restart starts the variables afresh
        expect(withKind(action, "restart", choices)).toEqual({ restart: true, sound: "beep" });
        expect(withKind(undefined, "screen", choices)).toEqual({ screen: "home" });
        expect(withKind({ dialog: "warning" }, "none", choices)).toEqual({});
        expect(withKind({ view: "a.png", sound: "beep" }, "back", choices)).toEqual({
            back: true,
            sound: "beep",
        });
        expect(withKind(undefined, "view", choices)).toEqual({ view: "" });
    });

    it("changes one setting, leaving out an empty one", () => {
        expect(withSetting({ screen: "home" }, "sound", "beep")).toEqual({
            screen: "home",
            sound: "beep",
        });
        expect(withSetting({ screen: "home", frame: "x" }, "frame", "")).toEqual({
            screen: "home",
        });
    });
});
