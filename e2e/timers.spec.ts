import { expect, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: {
        name: "Timers",
        start: "bridge",
        timers: { destruct: { from: 3, format: "ss", onComplete: { screen: "boom" } } },
        footer: [{ right: "DESTRUCT: {destruct}" }],
    },
    screens: {
        bridge: {
            content: [
                {
                    type: "link",
                    text: "> ARM",
                    action: { startTimer: "destruct", screen: "corridor" },
                },
                { type: "link", text: "> AIRLOCK", action: { screen: "airlock" } },
            ],
        },
        corridor: {
            content: [
                { type: "timer", label: "T-MINUS ", timer: "destruct" },
                { type: "link", text: "> RUN", action: { screen: "stairs" } },
            ],
        },
        stairs: { content: ["STILL RUNNING"] },
        airlock: {
            content: [
                { type: "timer", label: "CYCLING ", from: 2, onComplete: { screen: "space" } },
            ],
        },
        boom: { content: ["BOOM"] },
        space: { content: ["OUT IN SPACE"] },
    },
};

test("a program timer counts down on screen and in the status bar, across screens", async ({
    page,
    player,
}) => {
    await player.open(program);
    const footer = page.locator(".bar-footer");
    await expect(footer).toContainText("DESTRUCT: 3");

    await player.link("> ARM").click();
    await expect(player.screen.getByRole("timer")).toContainText("T-MINUS 3");
    await expect(footer).toContainText("DESTRUCT: 2");
    await expect(player.screen.getByRole("timer")).toContainText("T-MINUS 2");

    // it keeps going on another screen, and goes off there
    await player.link("> RUN").click();
    await expect(player.screen).toContainText("STILL RUNNING");
    await expect(player.screen).toContainText("BOOM", { timeout: 5000 });
});

test("a timer element's own countdown runs onComplete", async ({ player }) => {
    await player.open(program);
    await player.link("> AIRLOCK").click();
    await expect(player.screen.getByRole("timer")).toContainText("CYCLING 00:02");
    await expect(player.screen.getByRole("timer")).toContainText("CYCLING 00:01");
    await expect(player.screen).toContainText("OUT IN SPACE", { timeout: 5000 });
});
