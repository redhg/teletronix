import { describe, expect, it } from "vitest";
import { seededRandom } from "../random.ts";
import {
    compactRecipe,
    defaultRecipe,
    fillRecipe,
    mutateRecipe,
    PRESETS,
    presetRecipe,
    RecipeSchema,
} from "./recipe.ts";
import { renderRecipe, SAMPLE_RATE } from "./sfxr.ts";

describe("renderRecipe", () => {
    it("renders the default recipe for its envelope's length", () => {
        // sustain 0.3 and decay 0.4: (0.3² + 0.4²) × 100000 samples
        const samples = renderRecipe(defaultRecipe());
        expect(samples.length).toBeGreaterThan(24990);
        expect(samples.length).toBeLessThan(25010);
    });

    it("makes valid samples for every preset", () => {
        for (const preset of PRESETS) {
            for (let seed = 1; seed <= 10; seed++) {
                const samples = renderRecipe(
                    presetRecipe(preset, seededRandom(seed)),
                    seededRandom(seed),
                );
                expect(samples.length).toBeGreaterThan(0);
                expect(samples.every((x) => Number.isFinite(x) && x >= -1 && x <= 1)).toBe(true);
            }
        }
    });

    it("is deterministic for a seed", () => {
        const recipe = presetRecipe("explosion", seededRandom(4));
        expect(renderRecipe(recipe, seededRandom(9))).toEqual(
            renderRecipe(recipe, seededRandom(9)),
        );
    });

    it("stops at 10 seconds, whatever the recipe", () => {
        const endless = { ...defaultRecipe(), sustain: 1, decay: 1, attack: 1, repeatSpeed: 0.1 };
        expect(renderRecipe(endless).length).toBeLessThanOrEqual(SAMPLE_RATE * 10);
    });
});

describe("recipes", () => {
    it("writes only what differs from the defaults", () => {
        expect(compactRecipe(defaultRecipe())).toEqual({});
        const recipe = { ...defaultRecipe(), wave: "noise" as const, slide: -0.123456 };
        expect(compactRecipe(recipe)).toEqual({ wave: "noise", slide: -0.1235 });
    });

    it("round-trips through the schema", () => {
        const recipe = presetRecipe("laser", seededRandom(3));
        const parsed = RecipeSchema.parse(compactRecipe(recipe));
        const filled = fillRecipe(parsed);
        for (const [key, value] of Object.entries(recipe)) {
            if (typeof value === "number")
                expect(filled[key as keyof typeof filled]).toBeCloseTo(value, 3);
            else expect(filled[key as keyof typeof filled]).toBe(value);
        }
    });

    it("keeps presets and mutations inside the schema's ranges", () => {
        for (const preset of PRESETS) {
            for (let seed = 1; seed <= 20; seed++) {
                const recipe = mutateRecipe(
                    presetRecipe(preset, seededRandom(seed)),
                    seededRandom(seed),
                );
                expect(RecipeSchema.safeParse(compactRecipe(recipe)).success).toBe(true);
            }
        }
    });

    it("rejects settings out of range", () => {
        expect(RecipeSchema.safeParse({ slide: -2 }).success).toBe(false);
        expect(RecipeSchema.safeParse({ decay: -0.1 }).success).toBe(false);
        expect(RecipeSchema.safeParse({ wave: "triangle" }).success).toBe(false);
    });
});
