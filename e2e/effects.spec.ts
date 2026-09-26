import { expect, type Page, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Effects", start: "home" },
    screens: {
        home: {
            content: [
                "HOME",
                { type: "link", text: "> EVERYTHING", action: { screen: "everything" } },
                { type: "link", text: "> CLEAN", action: { screen: "clean" } },
            ],
        },
        everything: {
            effects: {
                bloom: true,
                vignette: true,
                flicker: true,
                static: { opacity: 0.2 },
                fringe: true,
            },
            content: ["EVERYTHING", { type: "link", text: "> BACK", action: { screen: "home" } }],
        },
        clean: {
            effects: { scanlines: false },
            content: ["CLEAN", { type: "link", text: "> BACK", action: { screen: "home" } }],
        },
    },
};

const layers = (page: Page) =>
    page.$$eval(".effects > *", (elements) => elements.map((element) => element.classList[0]));

const flags = (page: Page) =>
    page.evaluate(() => Object.keys(document.documentElement.dataset).sort());

test("scanlines are on by default", async ({ page, player }) => {
    await player.open(program);
    expect(await layers(page)).toEqual(["scanlines"]);
    expect(await flags(page)).toEqual(["scanlines"]);
});

test("a screen can add effects, and they go when it does", async ({ page, player }) => {
    await player.open(program);
    await player.link("> EVERYTHING").click();
    await expect
        .poll(() => layers(page))
        .toEqual(["bloom-filter", "vignette", "flicker", "static", "scanlines"]);
    expect(await flags(page)).toEqual(["bloom", "fringe", "scanlines"]);
    // the static is drawn
    await expect
        .poll(() =>
            page.$eval("canvas.static", (canvas) => {
                const { width, height } = canvas as HTMLCanvasElement;
                const pixels = (canvas as HTMLCanvasElement)
                    .getContext("2d")
                    ?.getImageData(0, 0, width, height).data;
                return pixels ? pixels.some((value, i) => i % 4 !== 3 && value > 0) : false;
            }),
        )
        .toBe(true);

    await player.link("> BACK").click();
    await expect.poll(() => layers(page)).toEqual(["scanlines"]);
    expect(await flags(page)).toEqual(["scanlines"]);
});

test("a screen can turn effects off", async ({ page, player }) => {
    await player.open(program);
    await player.link("> CLEAN").click();
    await expect.poll(() => layers(page)).toEqual([]);
    expect(await flags(page)).toEqual([]);
});

test("the config sets the effects for every screen", async ({ page, player }) => {
    await player.open({ ...program, config: { ...program.config, effects: { vignette: true } } });
    expect(await layers(page)).toEqual(["vignette", "scanlines"]);
});
