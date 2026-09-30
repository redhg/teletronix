// The maths behind the visuals, apart from any canvas so it can be tested.

import type { SHAPES, WAVES } from "./definition.ts";

export type Wave = (typeof WAVES)[number];
export type Shape = (typeof SHAPES)[number];

/** Smooth noise in [-1, 1]: random values at whole numbers, eased between. */
export function smoothNoise(values: readonly number[], x: number): number {
    const n = values.length;
    const i = Math.floor(x);
    const a = values[((i % n) + n) % n] ?? 0;
    const b = values[(((i + 1) % n) + n) % n] ?? 0;
    const t = x - i;
    const eased = t * t * (3 - 2 * t);
    return a + (b - a) * eased;
}

/** A wave's height in [-1, 1] at `phase` (in cycles). `noise` is for the noise wave. */
export function waveAt(wave: Wave, phase: number, noise: readonly number[]): number {
    const cycle = phase - Math.floor(phase);
    switch (wave) {
        case "sine":
            return Math.sin(phase * Math.PI * 2);
        case "square":
            return cycle < 0.5 ? 1 : -1;
        case "saw":
            return cycle * 2 - 1;
        case "triangle":
            return 1 - 4 * Math.abs(cycle - 0.5);
        case "noise":
            return smoothNoise(noise, phase * 8);
    }
}

/** Several waves added together, scaled back into [-1, 1]. */
export function mixAt(waves: readonly Wave[], phase: number, noise: readonly number[]): number {
    let sum = 0;
    waves.forEach((wave, i) => {
        // each wave after the first a little faster, so a mix isn't just one wave taller
        sum += waveAt(wave, phase * (1 + i * 0.5), noise);
    });
    return waves.length > 0 ? sum / waves.length : 0;
}

/**
 * A chart's next value, in (0, 1): a random walk that drifts back to the middle, with a
 * spike now and then.
 */
export function nextValue(value: number, volatility: number, random: () => number): number {
    let next = value + (random() - 0.5) * volatility * 0.4 + (0.5 - value) * 0.05;
    if (random() < 0.03 * volatility) next += (random() < 0.5 ? -1 : 1) * 0.35;
    return Math.min(0.97, Math.max(0.03, next));
}

export type Point3 = readonly [number, number, number];

export interface Mesh {
    points: Point3[];
    edges: [number, number][];
}

/** Joins every pair of points that are the shortest distance apart (e.g. a polyhedron's edges). */
function nearestEdges(points: Point3[]): [number, number][] {
    const distance = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let shortest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            shortest = Math.min(shortest, distance(points[i] as Point3, points[j] as Point3));
        }
    }
    const edges: [number, number][] = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (distance(points[i] as Point3, points[j] as Point3) < shortest * 1.01) {
                edges.push([i, j]);
            }
        }
    }
    return edges;
}

/** A shape's points (reaching a unit from the middle) and edges. Not for "terrain". */
export function mesh(shape: Exclude<Shape, "terrain">): Mesh {
    const { points, edges } = rawMesh(shape);
    // every shape the same size, so none is cut off at the canvas's edges
    const reach = Math.max(...points.map(([x, y, z]) => Math.hypot(x, y, z)));
    return { points: points.map((p) => p.map((v) => v / reach) as unknown as Point3), edges };
}

function rawMesh(shape: Exclude<Shape, "terrain">): Mesh {
    switch (shape) {
        case "cube": {
            const points: Point3[] = [];
            for (const x of [-1, 1])
                for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([x, y, z]);
            return { points, edges: nearestEdges(points) };
        }
        case "pyramid": {
            const points: Point3[] = [
                [-1, 0.7, -1],
                [1, 0.7, -1],
                [1, 0.7, 1],
                [-1, 0.7, 1],
                [0, -1.2, 0],
            ];
            return {
                points,
                edges: [
                    [0, 1],
                    [1, 2],
                    [2, 3],
                    [3, 0],
                    [0, 4],
                    [1, 4],
                    [2, 4],
                    [3, 4],
                ],
            };
        }
        case "octahedron": {
            const points: Point3[] = [
                [1.3, 0, 0],
                [-1.3, 0, 0],
                [0, 1.3, 0],
                [0, -1.3, 0],
                [0, 0, 1.3],
                [0, 0, -1.3],
            ];
            return { points, edges: nearestEdges(points) };
        }
        case "icosahedron": {
            const g = (1 + Math.sqrt(5)) / 2;
            const points: Point3[] = [];
            for (const a of [-1, 1]) {
                for (const b of [-g, g]) {
                    points.push([0, a, b], [a, b, 0], [b, 0, a]);
                }
            }
            const scale = 1.2 / Math.hypot(1, g);
            const scaled = points.map((p) => p.map((v) => v * scale) as unknown as Point3);
            return { points: scaled, edges: nearestEdges(scaled) };
        }
        case "torus": {
            const around = 16;
            const across = 8;
            const points: Point3[] = [];
            const edges: [number, number][] = [];
            for (let i = 0; i < around; i++) {
                const u = (i / around) * Math.PI * 2;
                for (let j = 0; j < across; j++) {
                    const v = (j / across) * Math.PI * 2;
                    const r = 1 + 0.4 * Math.cos(v);
                    points.push([r * Math.cos(u), 0.4 * Math.sin(v), r * Math.sin(u)]);
                    const here = i * across + j;
                    edges.push([here, i * across + ((j + 1) % across)]);
                    edges.push([here, ((i + 1) % around) * across + j]);
                }
            }
            return { points, edges };
        }
    }
}

/** A point turned `yaw` about the vertical axis, then `pitch` about the horizontal one. */
export function rotate([x, y, z]: Point3, yaw: number, pitch: number): Point3 {
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    return [x1, y2, z2];
}

/** Where a point lands on a canvas `width` × `height`, in perspective from `distance` away. */
export function project(
    [x, y, z]: Point3,
    width: number,
    height: number,
    distance = 5,
): [number, number] {
    // (a unit from the middle, even at its nearest, just stays inside the canvas)
    const scale = (Math.min(width, height) * 0.4 * distance) / (distance + z);
    return [width / 2 + x * scale, height / 2 + y * scale];
}

/** Terrain height in [0, 1] at a point on the ground, from a grid of noise. */
export function terrainHeight(noise: readonly number[], x: number, z: number): number {
    const n = Math.sqrt(noise.length) | 0;
    const at = (i: number, j: number) => noise[(((i % n) + n) % n) * n + (((j % n) + n) % n)] ?? 0;
    const i = Math.floor(x);
    const j = Math.floor(z);
    const tx = x - i;
    const tz = z - j;
    const ease = (t: number) => t * t * (3 - 2 * t);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * ease(tx);
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * ease(tx);
    return (top + (bottom - top) * ease(tz) + 1) / 2;
}
