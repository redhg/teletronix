import { describe, expect, it } from "vitest";
import tape7File from "../../../public/data/tape7.json?raw";
import { parseProgram } from "../../engine/schema/program.ts";
import { describeCondition, type MapEdge, programGraph } from "./graph.ts";

const parse = (file: unknown) => {
    const result = parseProgram(file);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program;
};

/** "from → to [label]", for comparing. */
const said = (edges: MapEdge[]) => edges.map((edge) => `${edge.from} → ${edge.to} [${edge.label}]`);

describe("a program's map", () => {
    it("has Tape 7's screens, dialogs and timer, and every way between them", () => {
        const tape7 = parse(JSON.parse(tape7File));
        const { nodes, edges } = programGraph(tape7);
        expect(nodes.find((node) => node.start)?.id).toBe("screen:boot");
        expect(nodes.filter((node) => node.kind === "dialog")).toHaveLength(4);
        expect(nodes.find((node) => node.id === "screen:log")?.lines[0]).toBe("STATION LOG");
        const ways = said(edges);
        expect(ways).toContain("screen:boot → screen:archive [at once]");
        expect(ways).toContain("screen:archive → screen:desk [3. SECURITY DESK if secure]");
        expect(ways).toContain("screen:archive → screen:login [3. SECURITY DESK]");
        expect(ways).toContain("screen:search → screen:found [03:14]");
        // a dialog's answer, the timer it starts, and where that leads when it runs out
        expect(ways).toContain("dialog:recover → screen:recovering [RECOVER]");
        expect(ways).toContain("dialog:recover → timer:purge [RECOVER (starts it)]");
        expect(ways).toContain("timer:purge → screen:purged [runs out]");
        // a video's end, from a tile of the desk's monitor
        expect(ways).toContain(
            "screen:desk → screen:ending [CAM 3 · AIRLOCK if recovered, once it's played]",
        );
        // (text in brackets that isn't markup stays)
        expect(
            ways.some((way) => way.includes("> TAPE 07 · [MISSING] (shown if not recovered)")),
        ).toBe(true);
    });

    it("says what moves on, and when, and which of several at random", () => {
        const program = parse({
            config: {
                name: "T",
                start: "home",
                variables: { keycard: false, credits: 0 },
                header: [{ left: { text: "[HOME]", action: { screen: "home" } } }],
            },
            screens: {
                home: {
                    next: [
                        { after: 2500, key: "Enter", action: { screen: "a" } },
                        { key: "any", if: { keycard: true }, action: { screen: "b" } },
                    ],
                    content: [
                        "[alert]HOME[/]",
                        {
                            type: "link",
                            text: "> GAMBLE",
                            action: [
                                { if: { credits: { atLeast: 30 } }, screen: ["a", "b"] },
                                { view: { src: "data/video/x.mp4", onEnd: { screen: "a" } } },
                            ],
                        },
                        { type: "link", text: "> SHOW B", action: { frame: "f", screen: "b" } },
                        { type: "frames", frames: [{ name: "f", content: ["NOTHING YET"] }] },
                    ],
                },
                a: { content: ["A"] },
                b: { content: ["B"] },
            },
        });
        const { nodes, edges } = programGraph(program);
        expect(nodes.find((node) => node.id === "screen:home")?.lines).toEqual([
            "HOME",
            "NOTHING YET",
        ]);
        expect(said(edges)).toEqual(
            expect.arrayContaining([
                "screen:home → screen:a [after 2.5 s or Enter]",
                "screen:home → screen:b [any key if keycard]",
                "screen:home → screen:a [> GAMBLE if credits ≥ 30]",
                "screen:home → screen:b [> GAMBLE if credits ≥ 30]",
                "screen:home → screen:a [> GAMBLE, once it's played]",
                "screen:home → screen:b [> SHOW B (in a frame)]",
                "bars → screen:home [bar link]",
            ]),
        );
        expect(edges.filter((edge) => edge.random)).toHaveLength(2);
    });
});

describe("a condition, in a few words", () => {
    it("reads as it would be said", () => {
        expect(describeCondition({ variable: "keycard", equals: true })).toBe("keycard");
        expect(describeCondition({ variable: "alarm", equals: false })).toBe("not alarm");
        expect(describeCondition({ variable: "power", equals: "LOW" })).toBe('power = "LOW"');
        expect(
            describeCondition({
                all: [
                    { variable: "hull", atMost: 20 },
                    {
                        any: [
                            { variable: "a", equals: true },
                            { not: { variable: "b", equals: true } },
                        ],
                    },
                ],
            }),
        ).toBe("hull ≤ 20 and a or not (b)");
    });
});
