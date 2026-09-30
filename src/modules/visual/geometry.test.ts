import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.ts";
import {
    mesh,
    mixAt,
    nextValue,
    type Point3,
    project,
    rotate,
    smoothNoise,
    terrainHeight,
    waveAt,
} from "./geometry.ts";

const noise = Array.from({ length: 64 }, (_, i) => Math.sin(i * 12.9898) % 1);

describe("waves", () => {
    it("each stay within -1 to 1, and repeat every cycle", () => {
        for (const wave of ["sine", "square", "saw", "triangle"] as const) {
            for (let phase = 0; phase < 3; phase += 0.07) {
                const value = waveAt(wave, phase, noise);
                expect(Math.abs(value)).toBeLessThanOrEqual(1);
                expect(waveAt(wave, phase + 1, noise)).toBeCloseTo(value, 6);
            }
        }
        expect(waveAt("square", 0.25, noise)).toBe(1);
        expect(waveAt("triangle", 0.5, noise)).toBe(1);
    });

    it("mix into one within -1 to 1", () => {
        for (let phase = 0; phase < 3; phase += 0.05) {
            expect(Math.abs(mixAt(["sine", "square", "noise"], phase, noise))).toBeLessThanOrEqual(
                1,
            );
        }
    });

    it("are smooth where they're noise", () => {
        expect(smoothNoise([0, 1], 0)).toBe(0);
        expect(smoothNoise([0, 1], 0.5)).toBe(0.5);
        expect(smoothNoise([0, 1], 1)).toBe(1);
    });
});

describe("a chart's values", () => {
    it("wander, but stay on the chart", () => {
        const random = seededRandom(3);
        let value = 0.5;
        const seen = new Set<number>();
        for (let i = 0; i < 2000; i++) {
            value = nextValue(value, 1, random);
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThan(1);
            seen.add(Math.round(value * 10));
        }
        expect(seen.size).toBeGreaterThan(4);
    });

    it("barely move with no volatility", () => {
        expect(nextValue(0.5, 0, seededRandom(1))).toBe(0.5);
    });
});

describe("shapes", () => {
    it("have the edges they should", () => {
        expect(mesh("cube").edges).toHaveLength(12);
        expect(mesh("pyramid").edges).toHaveLength(8);
        expect(mesh("octahedron").edges).toHaveLength(12);
        expect(mesh("icosahedron").edges).toHaveLength(30);
        expect(mesh("torus").edges).toHaveLength(16 * 8 * 2);
    });

    it("all reach a unit from the middle, and so fit their canvas however they turn", () => {
        for (const shape of ["cube", "pyramid", "octahedron", "icosahedron", "torus"] as const) {
            const { points } = mesh(shape);
            const reach = Math.max(...points.map(([x, y, z]) => Math.hypot(x, y, z)));
            expect(reach).toBeCloseTo(1, 6);
            for (let turn = 0; turn < 6; turn += 0.3) {
                for (const point of points) {
                    const [x, y] = project(rotate(point, turn, turn * 0.7), 100, 60);
                    expect(x).toBeGreaterThanOrEqual(0);
                    expect(x).toBeLessThanOrEqual(100);
                    expect(y).toBeGreaterThanOrEqual(0);
                    expect(y).toBeLessThanOrEqual(60);
                }
            }
        }
    });

    it("turn without changing size", () => {
        const point: Point3 = [0.3, -0.4, 0.5];
        const turned = rotate(point, 1.1, 0.4);
        expect(Math.hypot(...turned)).toBeCloseTo(Math.hypot(...point), 9);
    });
});

describe("terrain", () => {
    it("is between 0 and 1 high", () => {
        const grid = Array.from({ length: 16 }, (_, i) => (i % 3) - 1);
        for (let x = 0; x < 8; x += 0.37) {
            for (let z = 0; z < 8; z += 0.41) {
                const height = terrainHeight(grid, x, z);
                expect(height).toBeGreaterThanOrEqual(0);
                expect(height).toBeLessThanOrEqual(1);
            }
        }
    });
});
