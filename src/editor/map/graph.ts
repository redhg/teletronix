import { type Action, dialogAction, type Element, type Program } from "../../engine/index.ts";
import { barActions } from "../../engine/schema/bars.ts";
import { forEachElement, moduleFor } from "../../engine/schema/elements.ts";
import type { Condition } from "../../engine/schema/variables.ts";
import { parseMarkup } from "../../engine/text/markup.ts";

// A program as a map: its screens, dialogs and timers, and every way one leads to another (a
// link, a menu item, a key, a delay, a video's end, a dialog's answer, a timer running out),
// labelled with what does it, and when. For the editor's Map view (ProgramMap.tsx).

export type NodeKind = "screen" | "dialog" | "timer" | "bars";

export interface MapNode {
    /** "screen:home", "dialog:warning", "timer:purge", "bars" */
    id: string;
    kind: NodeKind;
    /** Its name: a screen's title (or id, in capitals), a dialog's or timer's id */
    title: string;
    /** Its id in the program, to show beside the title */
    name: string;
    /** Its first few lines of text, to know it by */
    lines: string[];
    /** The program's start screen */
    start?: boolean;
}

export interface MapEdge {
    id: string;
    from: string;
    to: string;
    /** What does it, and when: "> BRIDGE", "after 5 s", "if keycard" */
    label: string;
    /** One of several screens, chosen at random */
    random?: boolean;
}

/** Text as it reads, without its markup: "[alert]LV-426[/]" → "LV-426" ("[MISSING]" stays). */
const plain = (text: string) => parseMarkup(text).text.trim();

const short = (text: string, length = 40) =>
    text.length > length ? `${text.slice(0, length - 1)}…` : text;

/** A condition, as a few words: "keycard", "not alarm", "credits ≥ 30". */
export function describeCondition(condition: Condition): string {
    if ("all" in condition) return condition.all.map(describeCondition).join(" and ");
    if ("any" in condition) return condition.any.map(describeCondition).join(" or ");
    if ("not" in condition) return `not (${describeCondition(condition.not)})`;
    const { variable, equals, atLeast, atMost } = condition;
    const parts: string[] = [];
    if (equals === true) parts.push(variable);
    else if (equals === false) parts.push(`not ${variable}`);
    else if (equals !== undefined) parts.push(`${variable} = ${JSON.stringify(equals)}`);
    if (atLeast !== undefined) parts.push(`${variable} ≥ ${atLeast}`);
    if (atMost !== undefined) parts.push(`${variable} ≤ ${atMost}`);
    return parts.join(" and ") || variable;
}

/** A screen's (or dialog's) first lines of text. */
function firstLines(content: readonly Element[], count = 3): string[] {
    const lines: string[] = [];
    forEachElement(content, (element) => {
        if (lines.length >= count) return;
        if (element.type === "text" && typeof element.text === "string") {
            const line = plain(element.text);
            if (line) lines.push(short(line));
        }
    });
    return lines;
}

/** What each of an element's actions is, in order: its text, its items', or its type. */
function labelsOf(element: Element, count: number): string[] {
    const record = element as unknown as Record<string, unknown>;
    if (typeof record.text === "string") return Array(count).fill(plain(record.text));
    for (const field of [
        "items",
        "buttons",
        "options",
        "commands",
        "entries",
        "markers",
        "tiles",
    ]) {
        const list = record[field];
        if (!Array.isArray(list)) continue;
        const named = list
            .filter((item) => item && typeof item === "object" && "action" in item)
            .map((item: Record<string, unknown>) => {
                const name = item.text ?? item.label ?? item.name ?? item.command;
                return plain(String(Array.isArray(name) ? name[0] : (name ?? element.type)));
            });
        if (named.length === count) return named;
    }
    return Array(count).fill(element.type);
}

/** The keys or delay a screen's `next` rule moves on at. */
function nextLabel(rule: { after?: number; keys?: string[] }): string {
    const parts: string[] = [];
    if (rule.after !== undefined) {
        parts.push(rule.after === 0 ? "at once" : `after ${Math.round(rule.after / 100) / 10} s`);
    }
    if (rule.keys?.length) {
        // (as keys are written on them: "Enter", "Space", "Y")
        const named = rule.keys.map((key) => key.charAt(0).toUpperCase() + key.slice(1));
        parts.push(rule.keys.includes("any") ? "any key" : named.join(" / "));
    }
    return parts.join(" or ") || "next";
}

/** The program as a map. */
export function programGraph(program: Program): { nodes: MapNode[]; edges: MapEdge[] } {
    const nodes = new Map<string, MapNode>();
    const edges = new Map<string, MapEdge>();

    for (const screen of program.screens.values()) {
        nodes.set(`screen:${screen.id}`, {
            id: `screen:${screen.id}`,
            kind: "screen",
            title: screen.title ?? screen.id.toUpperCase(),
            name: screen.id,
            lines: firstLines(screen.content),
            ...(screen.id === program.start ? { start: true } : {}),
        });
    }
    for (const dialog of program.dialogs.values()) {
        const content = (dialog as unknown as { content?: unknown }).content;
        const lines = (Array.isArray(content) ? content : [content])
            .filter((line): line is string => typeof line === "string")
            .map((line) => short(plain(line)))
            .filter(Boolean)
            .slice(0, 3);
        nodes.set(`dialog:${dialog.id}`, {
            id: `dialog:${dialog.id}`,
            kind: "dialog",
            title: dialog.id,
            name: dialog.type,
            lines,
        });
    }
    const timer = (name: string) => {
        const id = `timer:${name}`;
        if (!nodes.has(id))
            nodes.set(id, { id, kind: "timer", title: name, name: "timer", lines: [] });
        return id;
    };

    const edge = (from: string, to: string, label: string, random = false) => {
        if (!nodes.has(to)) return;
        const id = `${from}→${to}:${label}`;
        if (!edges.has(id)) edges.set(id, { id, from, to, label, ...(random ? { random } : {}) });
    };

    /** The arrows an action draws, from a node, labelled with what does it. */
    const follow = (action: Action | undefined, from: string, label: string) => {
        for (const choice of action ?? []) {
            const when = choice.if ? `if ${describeCondition(choice.if)}` : "";
            // (a screen shown in a frame on this one, by the frame's name, says so)
            const said = [label, when, choice.frame ? "(in a frame)" : ""]
                .filter(Boolean)
                .join(" ");
            const screens = [choice.screen ?? []].flat();
            for (const id of screens) edge(from, `screen:${id}`, said, screens.length > 1);
            const dialogs = [choice.dialog ?? []].flat();
            for (const id of dialogs) edge(from, `dialog:${id}`, said, dialogs.length > 1);
            if (choice.restart) edge(from, `screen:${program.start}`, `${said} (restart)`);
            if (choice.startTimer) edge(from, timer(choice.startTimer), `${said} (starts it)`);
            if (choice.view?.onEnd) follow(choice.view.onEnd, from, `${said}, once it's played`);
        }
    };

    for (const [name, { onComplete }] of program.timers) {
        if (onComplete) follow(onComplete, timer(name), "runs out");
    }
    for (const dialog of program.dialogs.values()) {
        for (const [answer, confirmed] of [
            ["confirm", true],
            ["cancel", false],
        ] as const) {
            const button = (dialog as unknown as Record<string, { text?: string } | undefined>)[
                answer
            ];
            follow(dialogAction(dialog, confirmed), `dialog:${dialog.id}`, button?.text ?? answer);
        }
    }
    // the program's own bars: on every screen
    const bars = [...barActions(program.header ?? []), ...barActions(program.footer ?? [])];
    if (bars.length > 0) {
        nodes.set("bars", {
            id: "bars",
            kind: "bars",
            title: "HEADER & FOOTER",
            name: "every screen",
            lines: [],
        });
        for (const { action } of bars) follow(action, "bars", "bar link");
    }

    for (const screen of program.screens.values()) {
        const from = `screen:${screen.id}`;
        for (const rule of screen.next ?? []) {
            const when = rule.if ? ` if ${describeCondition(rule.if)}` : "";
            follow(rule.action, from, `${nextLabel(rule)}${when}`);
        }
        for (const bar of [screen.header, screen.footer]) {
            for (const { action } of bar ? barActions(bar) : []) follow(action, from, "bar link");
        }
        forEachElement(screen.content, (element) => {
            const actions = moduleFor(element).actions?.(element) ?? [];
            const labels = labelsOf(element, actions.length);
            const when = element.if ? ` (shown if ${describeCondition(element.if)})` : "";
            for (const [index, action] of actions.entries()) {
                follow(action, from, short(`${labels[index] ?? element.type}${when}`, 48));
            }
            if (element.type === "frame" && element.screen !== undefined) {
                edge(from, `screen:${element.screen}`, "shown in a frame");
            }
        });
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
