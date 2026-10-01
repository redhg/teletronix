import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import type { ShellElement } from "./definition.ts";
import { complete, promptFor, resolve, runCommand } from "./machine.ts";

const shell = (props: object = {}): ShellElement => {
    const result = parseProgram({
        config: { name: "T", variables: { cleared: false } },
        screens: {
            home: {
                content: [
                    {
                        type: "shell",
                        files: {
                            "readme.txt": "Welcome aboard.",
                            logs: {
                                "0603.log": ["0600 WOKE CREW", "0612 SIGNAL"],
                                old: { "0101.log": "NEW YEAR" },
                            },
                            "mother.exe": { run: { screen: "mother" }, size: 4096 },
                            secret: {
                                folder: { "937.txt": "CREW EXPENDABLE" },
                                if: { cleared: true },
                            },
                        },
                        commands: [
                            { command: ["status", "stat"], output: ["ALL SYSTEMS NOMINAL"] },
                            { command: "destruct", action: { screen: "boom" } },
                        ],
                        exit: { screen: "home" },
                        ...props,
                    },
                ],
            },
            mother: { content: [] },
            boom: { content: [] },
        },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as unknown as ShellElement;
};
const run = (input: string, cwd: string[] = [], props: object = {}, cleared = false) =>
    runCommand(shell(props), input, cwd, () => cleared);

describe("the shell's paths", () => {
    it("lead from the folder it's in, ignoring case, with .. and /", () => {
        const unix = shell();
        expect(resolve(unix, [], "LOGS/Old", () => true)).toEqual(["logs", "old"]);
        expect(resolve(unix, ["logs", "old"], "../..", () => true)).toEqual([]);
        expect(resolve(unix, ["logs"], "/logs/old", () => true)).toEqual(["logs", "old"]);
        expect(resolve(unix, [], "nowhere", () => true)).toBeNull();
        expect(resolve(shell({ style: "dos" }), [], "LOGS\\OLD", () => true)).toEqual([
            "logs",
            "old",
        ]);
    });

    it("show in the prompt", () => {
        expect(promptFor(shell(), ["logs"])).toBe("user@teletronix:/logs$ ");
        expect(promptFor(shell({ style: "dos" }), ["logs", "old"])).toBe("C:\\LOGS\\OLD>");
    });
});

describe("the shell's commands", () => {
    it("list a folder, ls-style", () => {
        expect(run("ls").output).toEqual(["readme.txt  logs/  mother.exe"]);
        expect(run("ls logs").output).toEqual(["0603.log  old/"]);
    });

    it("list a folder, DIR-style", () => {
        const { output } = run("dir", [], { style: "dos" });
        expect(output[0]).toBe(" Directory of C:\\");
        expect(output).toContain("LOGS             <DIR>");
        expect(output).toContain("MOTHER.EXE       4,096");
        expect(output.at(-1)).toBe("         2 file(s)         4,112 bytes");
    });

    it("move between folders, and say where it is", () => {
        expect(run("cd logs/old").cwd).toEqual(["logs", "old"]);
        expect(run("cd ..", ["logs"]).cwd).toEqual([]);
        expect(run("pwd", ["logs"]).output).toEqual(["/logs"]);
        expect(run("cd nowhere")).toMatchObject({ error: true, cwd: [] });
        // DOS: cd.. without a space, and cd alone says where it is
        expect(run("CD..", ["logs"], { style: "dos" }).cwd).toEqual([]);
        expect(run("CD", ["logs"], { style: "dos" }).output).toEqual(["C:\\LOGS"]);
    });

    it("show a file", () => {
        expect(run("cat logs/0603.log").output).toEqual(["0600 WOKE CREW", "0612 SIGNAL"]);
        expect(run("TYPE README.TXT", [], { style: "dos" }).output).toEqual(["Welcome aboard."]);
        expect(run("cat logs")).toMatchObject({
            error: true,
            output: ["cat: logs: Is a directory"],
        });
        // each style has its own commands
        expect(run("type readme.txt").error).toBe(true);
    });

    it("run programs by name", () => {
        expect(run("./mother.exe").action).toEqual([{ screen: "mother" }]);
        expect(run("/mother.exe", ["logs", "old"]).action).toEqual([{ screen: "mother" }]);
        expect(run("../mother.exe", ["logs"]).action).toEqual([{ screen: "mother" }]);
        expect(run("MOTHER", [], { style: "dos" }).action).toEqual([{ screen: "mother" }]);
    });

    it("run its own commands, and exit", () => {
        expect(run("STAT").output).toEqual(["ALL SYSTEMS NOMINAL"]);
        expect(run("destruct").action).toEqual([{ screen: "boom" }]);
        expect(run("exit").action).toEqual([{ screen: "home" }]);
        expect(run("help").output[0]).toContain("status");
    });

    it("clear the screen", () => {
        expect(run("clear").clear).toBe(true);
        expect(run("cls", [], { style: "dos" }).clear).toBe(true);
    });

    it("don't know other commands", () => {
        expect(run("xyzzy")).toMatchObject({ error: true, output: ["xyzzy: command not found"] });
        expect(run("xyzzy", [], { style: "dos" }).output).toEqual(["Bad command or file name"]);
    });

    it("hide what's not there yet", () => {
        expect(run("ls").output[0]).not.toContain("secret");
        expect(run("ls", [], {}, true).output[0]).toContain("secret/");
        expect(run("cat secret/937.txt", [], {}, true).output).toEqual(["CREW EXPENDABLE"]);
    });
});

describe("tab completion", () => {
    const tab = (input: string, cwd: string[] = []) => complete(shell(), input, cwd);

    it("completes commands, and names in folders", () => {
        expect(tab("statu")).toBe("status ");
        // ("sta" could be "status" or its alias "stat")
        expect(tab("sta")).toBe("stat");
        expect(tab("cat read")).toBe("cat readme.txt ");
        expect(tab("cd lo")).toBe("cd logs/");
        expect(tab("cat logs/06")).toBe("cat logs/0603.log ");
    });

    it("goes as far as it's sure", () => {
        // "cat" and "cd"
        expect(tab("c")).toBe("c");
        expect(tab("cl")).toBe("clear ");
        expect(tab("nothing")).toBe("nothing");
    });
});

describe("passwords", () => {
    const locked = (props: object = {}) =>
        shell({
            files: {
                "open.txt": "OPEN",
                "diary.txt": { file: "DEAR DIARY", password: "kane" },
                vault: { folder: { "gold.txt": "GOLD" }, password: "1138" },
                launch: { run: { screen: "mother" }, password: "go" },
            },
            ...props,
        });
    const run = (input: string, unlocked: string[] = [], cwd: string[] = []) =>
        runCommand(locked(), input, cwd, () => true, unlocked);

    it("asks before reading, entering or running what has one", () => {
        expect(run("cat open.txt").output).toEqual(["OPEN"]);
        expect(run("cat diary.txt")).toMatchObject({
            ask: { key: "/diary.txt", password: "kane" },
        });
        expect(run("cd vault")).toMatchObject({ ask: { key: "/vault", password: "1138" } });
        expect(run("launch")).toMatchObject({ ask: { key: "/launch", password: "go" } });
    });

    it("asks for a locked folder on the way, too", () => {
        expect(run("cat vault/gold.txt")).toMatchObject({ ask: { key: "/vault" } });
    });

    it("lets through what's been unlocked", () => {
        expect(run("cat diary.txt", ["/diary.txt"]).output).toEqual(["DEAR DIARY"]);
        expect(run("cat vault/gold.txt", ["/vault"]).output).toEqual(["GOLD"]);
        expect(run("launch", ["/launch"]).action).toEqual([{ screen: "mother" }]);
    });
});
