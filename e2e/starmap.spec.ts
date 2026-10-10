import { expect, type Page, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: {
        name: "Star map",
        start: "home",
        reveal: "instant",
        variables: { target: "NONE", sx: 10, sy: 10, signal: false },
    },
    screens: {
        home: {
            content: [
                {
                    type: "starmap",
                    width: 100,
                    height: 50,
                    cols: 60,
                    rows: 15,
                    stars: 0,
                    sectors: [50, 25],
                    cursor: "ship",
                    variable: "target",
                    status: "{sector} {x},{y} {target}",
                    markers: [
                        { id: "ship", kind: "you", x: "sx", y: "sy", label: "SHIP", range: 20 },
                        {
                            id: "lv426",
                            kind: "planet",
                            x: 70,
                            y: 40,
                            label: "LV-426",
                            action: { set: { sx: 66, sy: 38 } },
                        },
                        { x: 40, y: 12, label: "THEDUS" },
                        { x: 90, y: 5, label: "SIGNAL", if: { signal: true } },
                    ],
                    routes: [{ path: ["ship", "lv426"], dashed: true }],
                },
                "TARGET {target}",
                { type: "link", text: "> LISTEN", action: { set: { signal: true } } },
            ],
        },
    },
};

/** Where a place on the map is on the page, at the map's whole (zoom 1). */
async function pixelOf(page: Page, at: { x: number; y: number }) {
    const box = await page.locator(".starmap canvas").boundingBox();
    if (!box) throw new Error("no map");
    const scale = Math.min(box.width / 100, box.height / 50);
    return {
        x: box.x + box.width / 2 + (at.x - 50) * scale,
        y: box.y + box.height / 2 + (at.y - 25) * scale,
    };
}

test.describe("a star map", () => {
    test("goes from marker to marker with the arrow keys, and selects one", async ({
        page,
        player,
    }) => {
        await player.open(program);
        const map = player.screen.locator(".starmap");
        const status = map.locator(".starmap-status");
        await expect(map).toBeFocused();
        await expect(map.locator(".starmap-label")).toHaveText(["SHIP", "LV-426", "THEDUS"]);
        await expect(map.locator(".starmap-sector")).toHaveText(["A", "B", "1", "2"]);
        await expect(status).toHaveText("A1 10,10 SHIP");

        await page.keyboard.press("ArrowRight");
        await expect(status).toHaveText("A1 40,12 THEDUS");
        await page.keyboard.press("ArrowDown");
        await expect(status).toHaveText("B2 70,40 LV-426");
        await page.keyboard.press("Enter");
        await expect(status).toHaveText("B2 70,40 LV-426 [LOCKED]");
        await expect(player.screen).toContainText("TARGET LV-426");

        // the ship's marker follows its variables (set by LV-426's action)
        await page.keyboard.press("ArrowLeft");
        await expect(status).toHaveText("B2 66,38 SHIP");
    });

    test("picks a marker with a click, selects it with another, and doesn't skip", async ({
        page,
        player,
    }) => {
        await player.open(program);
        const map = player.screen.locator(".starmap");
        const status = map.locator(".starmap-status");
        const thedus = await pixelOf(page, { x: 40, y: 12 });
        await page.mouse.click(thedus.x + 3, thedus.y - 2);
        await expect(status).toHaveText("A1 40,12 THEDUS");
        await expect(map).toHaveAttribute("data-picked", "2");
        await page.mouse.click(thedus.x, thedus.y);
        await expect(status).toHaveText("A1 40,12 THEDUS [LOCKED]");
        await expect(player.screen).toContainText("TARGET THEDUS");
        // (a click on empty space picks nothing)
        const empty = await pixelOf(page, { x: 20, y: 40 });
        await page.mouse.click(empty.x, empty.y);
        await expect(status).toHaveText("A1 40,12 THEDUS [LOCKED]");
    });

    test("zooms with + and −, back with 0, and with the wheel; and pans with a drag", async ({
        page,
        player,
    }) => {
        await player.open(program);
        const map = player.screen.locator(".starmap");
        await expect(map).toBeFocused();
        await expect(map).toHaveAttribute("data-zoom", "1");
        await page.keyboard.press("+");
        await expect(map).toHaveAttribute("data-zoom", "1.5");
        await page.keyboard.press("-");
        await expect(map).toHaveAttribute("data-zoom", "1");
        for (let i = 0; i < 6; i++) await page.keyboard.press("+");
        // (no further than the map's zoom: 4 by default)
        await expect(map).toHaveAttribute("data-zoom", "4");
        await page.keyboard.press("0");
        await expect(map).toHaveAttribute("data-zoom", "1");

        const middle = await pixelOf(page, { x: 50, y: 25 });
        await page.mouse.move(middle.x, middle.y);
        await page.mouse.wheel(0, -400);
        await expect
            .poll(async () => Number(await map.getAttribute("data-zoom")))
            .toBeGreaterThan(1.5);

        // a drag moves the map under the pointer: dragged right and down, it shows more of the
        // left and top (zoomed in a little, so there's somewhere to go)
        await page.keyboard.press("0");
        await page.keyboard.press("+");
        await expect(map).toHaveAttribute("data-zoom", "1.5");
        const center = async () => (await map.getAttribute("data-center"))?.split(",").map(Number);
        const [x0 = 0, y0 = 0] = (await center()) ?? [];
        await page.mouse.move(middle.x, middle.y);
        await page.mouse.down();
        await page.mouse.move(middle.x + 40, middle.y + 10, { steps: 4 });
        await page.mouse.up();
        await expect.poll(async () => (await center())?.[0] ?? x0).toBeLessThan(x0 - 2);
        expect((await center())?.[1]).toBeLessThanOrEqual(y0);
        // (and a drag doesn't pick anything)
        await expect(map).toHaveAttribute("data-picked", "ship");
    });

    test("shows a marker when its condition holds", async ({ player }) => {
        await player.open(program);
        const map = player.screen.locator(".starmap");
        await expect(map.locator(".starmap-label", { hasText: "SIGNAL" })).toHaveCount(0);
        await player.link("> LISTEN").click();
        await expect(map.locator(".starmap-label", { hasText: "SIGNAL" })).toBeVisible();
        // (and it's in the list for a screen reader)
        await expect(map.locator("li")).toHaveText([
            "You are here: SHIP",
            "Planet: LV-426",
            "Star: THEDUS",
            "Star: SIGNAL",
        ]);
    });
});
