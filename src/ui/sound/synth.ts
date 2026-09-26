import type { Cue, ResolvedSound } from "../../engine/index.ts";

/** Sounds the interface asks for directly, on top of the engine's cues. */
export type InterfaceCue =
    /** Choosing something: a link, a toggle, a command */
    | { type: "select" }
    /** A slider moving a step */
    | { type: "tick" }
    /** A key typed into a prompt */
    | { type: "keypress" }
    /** A command the prompt doesn't know */
    | { type: "error" };

export type SoundCue = Cue | InterfaceCue;

const KEY_GAP = 0.03;
const TICK_GAP = 0.04;
const MAX_BURST = 3;

/**
 * Makes every sound on the fly with the Web Audio API: filtered noise, square waves, a
 * mains hum. Nothing is loaded. Browsers only allow sound after the player has clicked or
 * pressed a key, so it stays silent until unlock() is called from such an event.
 */
export class Synth {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private settings: ResolvedSound | null = null;
    private muted = false;
    private lastKey = 0;
    private lastTick = 0;
    private hum: AudioScheduledSourceNode[] = [];
    private hiss: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
    private hissLevel = 0;

    get unlocked(): boolean {
        return this.context !== null;
    }

    /** Starts audio. Call from a click or key press. */
    unlock(): void {
        if (!this.context) {
            this.context = new AudioContext();
            this.master = this.context.createGain();
            this.master.connect(this.context.destination);
            this.noise = this.makeNoise(this.context);
            this.apply();
        }
        // resuming can fail harmlessly, e.g. if the page is being left
        this.context.resume().catch(() => {});
    }

    configure(settings: ResolvedSound | null, muted: boolean): void {
        this.settings = settings;
        this.muted = muted;
        this.apply();
    }

    /** A steady hiss under the static effect, at `level` (0 to 1). */
    setHiss(level: number): void {
        this.hissLevel = level;
        this.apply();
    }

    play(cue: SoundCue): void {
        const { context, settings } = this;
        if (!context || !settings || this.muted) return;
        const now = context.currentTime;

        switch (cue.type) {
            case "key":
            case "keypress":
                if (!settings.typing || now - this.lastKey < KEY_GAP) return;
                this.lastKey = now;
                this.click(now);
                return;
            case "glitch":
                if (settings.glitch) this.glitch(now, Math.min(cue.duration / 1000, MAX_BURST));
                return;
            case "static":
                if (settings.static) this.burst(now, cue.duration / 1000);
                return;
            case "dialog":
                if (!settings.interface) return;
                if (cue.alert) {
                    this.tone(now, 440, 0.12, "square", 0.08);
                    this.tone(now + 0.14, 330, 0.18, "square", 0.08);
                } else {
                    this.tone(now, 660, 0.1, "sine", 0.2);
                }
                return;
            case "select":
                if (!settings.interface) return;
                this.tone(now, 880, 0.03, "square", 0.06);
                this.tone(now + 0.035, 1320, 0.04, "square", 0.06);
                return;
            case "tick":
                if (!settings.interface || now - this.lastTick < TICK_GAP) return;
                this.lastTick = now;
                this.tone(now, 1600, 0.015, "square", 0.04);
                return;
            case "error":
                if (settings.interface) this.tone(now, 110, 0.18, "square", 0.08);
                return;
        }
    }

    // ─── Voices ─────────────────────────────────────────────────────────────

    /** A key click: a tiny burst of band-passed noise at a slightly random pitch. */
    private click(at: number): void {
        const filter = this.filter("bandpass", 1800 + Math.random() * 1400, 1.2);
        this.noiseThrough(filter, at, 0.018, 0.5);
    }

    /** A burst of hiss that fades out. */
    private burst(at: number, duration: number): void {
        this.noiseThrough(this.filter("highpass", 1000, 0.7), at, duration, 0.5);
    }

    /** Digital crackle: noise gated in random stutters, over a hopping square wave. */
    private glitch(at: number, duration: number): void {
        const context = this.context as AudioContext;
        const gate = context.createGain();
        const osc = context.createOscillator();
        const oscGain = context.createGain();
        osc.type = "square";
        oscGain.gain.value = 0.04;
        osc.connect(oscGain).connect(gate);

        const noise = context.createBufferSource();
        noise.buffer = this.noise;
        noise.loop = true;
        const band = this.filter("bandpass", 2500, 0.8);
        noise.connect(band).connect(gate);
        gate.connect(this.master as GainNode);

        for (let t = 0; t < duration; t += 0.012 + Math.random() * 0.03) {
            // fewer, quieter stutters towards the end
            const fade = 1 - t / duration;
            gate.gain.setValueAtTime(Math.random() < 0.55 * fade + 0.1 ? 0.3 * fade : 0, at + t);
            osc.frequency.setValueAtTime(120 + Math.random() * 1800, at + t);
            band.frequency.setValueAtTime(800 + Math.random() * 4000, at + t);
        }
        gate.gain.setValueAtTime(0, at + duration);
        osc.start(at);
        noise.start(at, Math.random());
        osc.stop(at + duration);
        noise.stop(at + duration);
    }

    private tone(
        at: number,
        frequency: number,
        duration: number,
        type: OscillatorType,
        level: number,
    ): void {
        const context = this.context as AudioContext;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        osc.connect(gain).connect(this.master as GainNode);
        osc.start(at);
        osc.stop(at + duration + 0.01);
    }

    // ─── Plumbing ───────────────────────────────────────────────────────────

    private filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
        const filter = (this.context as AudioContext).createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        return filter;
    }

    private noiseThrough(filter: AudioNode, at: number, duration: number, level: number): void {
        const context = this.context as AudioContext;
        const source = context.createBufferSource();
        source.buffer = this.noise;
        const gain = context.createGain();
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        source
            .connect(filter)
            .connect(gain)
            .connect(this.master as GainNode);
        source.start(at, Math.random());
        source.stop(at + duration + 0.01);
    }

    private makeNoise(context: AudioContext): AudioBuffer {
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    /** Brings the volume, the hum and the hiss in line with the settings. */
    private apply(): void {
        const { context, master, settings } = this;
        if (!context || !master) return;
        const on = settings !== null && !this.muted;
        master.gain.setTargetAtTime(on ? (settings?.volume ?? 0) : 0, context.currentTime, 0.02);

        const wantHum = on && settings?.hum === true;
        if (wantHum && this.hum.length === 0) this.startHum(context, master);
        if (!wantHum && this.hum.length > 0) {
            for (const source of this.hum) source.stop();
            this.hum = [];
        }

        const hissLevel = on && settings?.static ? this.hissLevel * 0.25 : 0;
        if (hissLevel > 0 && !this.hiss) {
            const source = context.createBufferSource();
            source.buffer = this.noise;
            source.loop = true;
            const gain = context.createGain();
            gain.gain.value = 0;
            source
                .connect(this.filter("highpass", 2000, 0.5))
                .connect(gain)
                .connect(master);
            source.start();
            this.hiss = { source, gain };
        }
        this.hiss?.gain.gain.setTargetAtTime(hissLevel, context.currentTime, 0.1);
    }

    /** A CRT's mains hum (60 Hz and its harmonic) and flyback whine (15.7 kHz). */
    private startHum(context: AudioContext, master: GainNode): void {
        const voices: [number, number][] = [
            [60, 0.05],
            [120, 0.025],
            [15734, 0.006],
        ];
        this.hum = voices.map(([frequency, level]) => {
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.frequency.value = frequency;
            gain.gain.value = level;
            osc.connect(gain).connect(master);
            osc.start();
            return osc;
        });
    }
}
