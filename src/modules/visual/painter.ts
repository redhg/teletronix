import type { VisualElement } from "./definition.ts";
import { type Mesh, mesh, mixAt, nextValue, project, rotate, terrainHeight } from "./geometry.ts";

/** Seconds between a chart's values. */
const CHART_STEP = 0.12;
/** Seconds for a radar's sweep to go round. */
const SWEEP = 3;

interface Blip {
    angle: number;
    distance: number;
}

/**
 * Draws one visual, frame by frame. It keeps what changes from frame to frame (a chart's
 * values, a radar's blips), so each visual on a screen moves in its own way.
 */
export class VisualPainter {
    private readonly visual: VisualElement;
    private readonly random: () => number;
    private readonly noise: number[];
    private values: number[] = [];
    private stepped = 0;
    private readonly blips: Blip[];
    private readonly mesh: Mesh | null;

    constructor(visual: VisualElement, random: () => number = Math.random) {
        this.visual = visual;
        this.random = random;
        this.noise = Array.from({ length: 32 * 32 }, () => random() * 2 - 1);
        let value = 0.5;
        this.values = Array.from({ length: 200 }, () => {
            value = nextValue(value, visual.volatility, random);
            return value;
        });
        this.blips = Array.from({ length: visual.blips }, () => this.newBlip());
        this.mesh =
            visual.kind === "wireframe" && visual.shape !== "terrain" ? mesh(visual.shape) : null;
    }

    private newBlip(): Blip {
        return { angle: this.random() * Math.PI * 2, distance: 0.2 + this.random() * 0.75 };
    }

    /** Draws the visual as it is `time` seconds in (already sped up), in `color`. */
    draw(context: CanvasRenderingContext2D, time: number, color: string, scale: number): void {
        const { width, height } = context.canvas;
        context.clearRect(0, 0, width, height);
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = 1.25 * scale;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.shadowColor = color;
        context.shadowBlur = 5 * scale;
        context.globalAlpha = 1;

        switch (this.visual.kind) {
            case "waveform":
                this.waveform(context, width, height, time, scale);
                break;
            case "chart":
                this.chart(context, width, height, time, scale);
                break;
            case "radar":
                this.radar(context, width, height, time, scale);
                break;
            case "wireframe":
                if (this.mesh) this.wireframe(context, this.mesh, width, height, time);
                else this.terrain(context, width, height, time);
                break;
        }
    }

    private line(
        context: CanvasRenderingContext2D,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
    ) {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
    }

    /** A scope's graticule: 10 divisions across, 8 down, with the middle lines stronger. */
    private graticule(context: CanvasRenderingContext2D, width: number, height: number) {
        if (!this.visual.grid) return;
        context.save();
        context.shadowBlur = 0;
        context.lineWidth = Math.max(1, context.lineWidth * 0.6);
        for (let i = 0; i <= 10; i++) {
            context.globalAlpha = i === 5 ? 0.35 : 0.15;
            const x = Math.round((i / 10) * (width - 1)) + 0.5;
            this.line(context, x, 0, x, height);
        }
        for (let j = 0; j <= 8; j++) {
            context.globalAlpha = j === 4 ? 0.35 : 0.15;
            const y = Math.round((j / 8) * (height - 1)) + 0.5;
            this.line(context, 0, y, width, y);
        }
        context.restore();
    }

    private waveform(
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        time: number,
        scale: number,
    ) {
        const { wave, frequency, amplitude } = this.visual;
        this.graticule(context, width, height);
        context.beginPath();
        const step = 2 * scale;
        for (let x = 0; x <= width; x += step) {
            const phase = (x / width) * frequency + time * 0.5;
            const y = height / 2 - mixAt(wave, phase, this.noise) * amplitude * (height / 2) * 0.95;
            if (x === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.stroke();
    }

    private chart(
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        time: number,
        scale: number,
    ) {
        // new values arrive at a steady rate, however often it's drawn
        const due = Math.floor(time / CHART_STEP);
        for (; this.stepped < due; this.stepped++) {
            const last = this.values.at(-1) ?? 0.5;
            this.values.push(nextValue(last, this.visual.volatility, this.random));
            this.values.shift();
        }
        const into = time / CHART_STEP - due;
        const spacing = 6 * scale;
        const count = Math.min(this.values.length, Math.ceil(width / spacing) + 2);
        const shown = this.values.slice(-count);
        // the newest value at the right edge, scrolling left
        const xOf = (i: number) => width - (count - 1 - i + into) * spacing;
        const yOf = (value: number) => height - value * height;

        this.graticule(context, width, height);
        if (this.visual.style === "bars") {
            shown.forEach((value, i) => {
                context.fillRect(xOf(i) - spacing * 0.3, yOf(value), spacing * 0.6, height);
            });
            return;
        }
        context.beginPath();
        shown.forEach((value, i) => {
            if (i === 0) context.moveTo(xOf(i), yOf(value));
            else context.lineTo(xOf(i), yOf(value));
        });
        context.stroke();
    }

    private radar(
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        time: number,
        scale: number,
    ) {
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) / 2 - 3 * scale;
        const sweep = ((time / SWEEP) % 1) * Math.PI * 2;

        context.save();
        context.shadowBlur = 0;
        context.globalAlpha = 0.25;
        for (const ring of [1 / 3, 2 / 3, 1]) {
            context.beginPath();
            context.arc(cx, cy, radius * ring, 0, Math.PI * 2);
            context.stroke();
        }
        this.line(context, cx - radius, cy, cx + radius, cy);
        this.line(context, cx, cy - radius, cx, cy + radius);
        context.restore();

        // the arm, with a fading trail behind it
        for (let i = 24; i >= 0; i--) {
            const angle = sweep - i * 0.03;
            context.globalAlpha = i === 0 ? 1 : (1 - i / 24) * 0.3;
            this.line(
                context,
                cx,
                cy,
                cx + Math.cos(angle) * radius,
                cy + Math.sin(angle) * radius,
            );
        }

        // blips flare as the arm passes, then fade; now and then one moves on
        for (const [index, blip] of this.blips.entries()) {
            const since = (((sweep - blip.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            if (since < 0.05 && this.random() < 0.02) this.blips[index] = this.newBlip();
            // (never quite gone: a faint echo until the arm comes round again)
            context.globalAlpha = 0.15 + 0.85 * Math.exp(-since * 0.9);
            context.beginPath();
            context.arc(
                cx + Math.cos(blip.angle) * blip.distance * radius,
                cy + Math.sin(blip.angle) * blip.distance * radius,
                3.5 * scale,
                0,
                Math.PI * 2,
            );
            context.fill();
        }
        context.globalAlpha = 1;
    }

    private wireframe(
        context: CanvasRenderingContext2D,
        shape: Mesh,
        width: number,
        height: number,
        time: number,
    ) {
        const yaw = time * 0.6;
        const pitch = 0.45 + Math.sin(time * 0.3) * 0.3;
        const turned = shape.points.map((point) => rotate(point, yaw, pitch));
        const flat = turned.map((point) => project(point, width, height));
        for (const [a, b] of shape.edges) {
            const pa = flat[a];
            const pb = flat[b];
            if (!pa || !pb) continue;
            // the far side dimmer, for depth
            const depth = ((turned[a]?.[2] ?? 0) + (turned[b]?.[2] ?? 0)) / 2;
            context.globalAlpha = Math.min(1, Math.max(0.25, 0.65 - depth * 0.35));
            this.line(context, pa[0], pa[1], pb[0], pb[1]);
        }
        context.globalAlpha = 1;
    }

    /** A wireframe landscape flying towards the viewer, like an old flight simulator. */
    private terrain(
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        time: number,
    ) {
        const travelled = time * 1.5;
        const ahead = Math.floor(travelled);
        const into = travelled - ahead;
        const horizon = height * 0.25;
        const eye = 2.4;
        const rows = 16;
        const half = 10;
        const at = (x: number, row: number): [number, number] => {
            const depth = row + 1 - into;
            // (sampled at half the grid's scale, for rolling hills rather than spikes)
            const rise = terrainHeight(this.noise, (x + 16) / 2, (row + ahead) / 2) * 1.3;
            return [
                width / 2 + (x / depth) * width * 0.35,
                horizon + ((eye - rise) / depth) * height * 0.6,
            ];
        };

        context.globalAlpha = 0.4;
        this.line(context, 0, horizon, width, horizon);
        for (let row = rows; row >= 0; row--) {
            // further rows fainter
            context.globalAlpha = Math.max(0.12, 1 - row / rows);
            context.beginPath();
            for (let x = -half; x <= half; x++) {
                const [px, py] = at(x, row);
                if (x === -half) context.moveTo(px, py);
                else context.lineTo(px, py);
            }
            context.stroke();
            if (row === 0) continue;
            for (let x = -half; x <= half; x++) {
                const [x1, y1] = at(x, row);
                const [x2, y2] = at(x, row - 1);
                this.line(context, x1, y1, x2, y2);
            }
        }
        context.globalAlpha = 1;
    }
}
