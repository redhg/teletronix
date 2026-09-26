import type { Cue, ResolvedSound } from "../../engine/index.ts";
import type { Recipe } from "../../engine/sound/recipe.ts";
import { renderRecipe, SAMPLE_RATE } from "../../engine/sound/sfxr.ts";
import { copyVoices, type VoiceName, type Voices } from "../../engine/sound/voices.ts";

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

/** Longest a glitch sound runs, however long the glitch. */
const MAX_BURST = 3;
/** How many rendered recipes to keep, so repeated sounds aren't rendered again. */
const RECIPE_CACHE = 32;

/**
 * Makes every sound on the fly with the Web Audio API: filtered noise, simple waves, a
 * mains hum. Nothing is loaded. Browsers only allow sound after the player has clicked or
 * pressed a key, so it stays silent until unlock() is called from such an event.
 *
 * Every number it uses comes from `voices` (see voices.ts), which can change at any time.
 */
export class Synth {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private settings: ResolvedSound | null = null;
    private muted = false;
    private voices: Voices;
    private lastKey = Number.NEGATIVE_INFINITY;
    private lastTick = Number.NEGATIVE_INFINITY;
    private hum: { oscillators: OscillatorNode[]; gains: GainNode[] } | null = null;
    private hiss: {
        source: AudioBufferSourceNode;
        filter: BiquadFilterNode;
        gain: GainNode;
    } | null = null;
    private hissLevel = 0;
    private rendered = new Map<string, AudioBuffer>();
    /** The program's sounds, by name (see Program.sounds). */
    private library: ReadonlyMap<string, Recipe> = new Map();

    constructor(voices: Voices = copyVoices()) {
        this.voices = voices;
    }

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

    /** Applies a program's sound settings, including its voices. */
    configure(settings: ResolvedSound | null, muted: boolean): void {
        this.settings = settings;
        this.muted = muted;
        if (settings) this.voices = settings.voices;
        this.apply();
    }

    /** The program's own sounds, for "sound" cues and replacing built-in sounds. */
    setLibrary(library: ReadonlyMap<string, Recipe>): void {
        this.library = library;
    }

    /** Replaces the voices; sounds already playing (the hum, the hiss) follow along. */
    setVoices(voices: Voices): void {
        this.voices = voices;
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
            case "sound": {
                const recipe = this.library.get(cue.name);
                if (recipe) this.playRecipe(recipe);
                return;
            }
            case "key":
            case "keypress":
                if (!settings.typing || now - this.lastKey < this.voices.key.gap) return;
                this.lastKey = now;
                this.voiceOrOwn("key", now);
                return;
            case "glitch":
                if (settings.glitch) this.voice("glitch", now, cue.duration / 1000);
                return;
            case "static":
                if (settings.static) this.voice("burst", now, cue.duration / 1000);
                return;
            case "dialog":
                if (settings.interface) this.voiceOrOwn(cue.alert ? "alert" : "dialog", now);
                return;
            case "select":
                if (settings.interface) this.voiceOrOwn("select", now);
                return;
            case "tick":
                if (!settings.interface || now - this.lastTick < this.voices.tick.gap) return;
                this.lastTick = now;
                this.voiceOrOwn("tick", now);
                return;
            case "error":
                if (settings.interface) this.voiceOrOwn("error", now);
                return;
        }
    }

    /** A built-in sound, or the program's own sound of the same name if it has one. */
    private voiceOrOwn(
        name: "key" | "select" | "tick" | "error" | "dialog" | "alert",
        at: number,
    ): void {
        const own = this.library.get(name);
        if (own) this.playRecipe(own);
        else this.voice(name, at);
    }

    /**
     * Plays a sound recipe (see src/engine/sound/recipe.ts), whatever the settings; callers
     * decide whether it should sound. Returns its length in seconds.
     */
    playRecipe(recipe: Recipe): number {
        const { context, master } = this;
        if (!context || !master) return 0;
        const key = JSON.stringify(recipe);
        let buffer = this.rendered.get(key);
        if (!buffer) {
            const samples = renderRecipe(recipe);
            buffer = context.createBuffer(1, Math.max(1, samples.length), SAMPLE_RATE);
            buffer.getChannelData(0).set(samples);
            this.rendered.set(key, buffer);
            // forget the oldest
            if (this.rendered.size > RECIPE_CACHE) {
                const oldest = this.rendered.keys().next().value;
                if (oldest !== undefined) this.rendered.delete(oldest);
            }
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(master);
        source.start();
        return buffer.duration;
    }

    /** Plays one voice now, whatever the settings (for the sound test page). */
    preview(name: Exclude<VoiceName, "hum" | "hiss">, duration = 1): void {
        if (this.context) this.voice(name, this.context.currentTime, duration);
    }

    // ─── Voices ─────────────────────────────────────────────────────────────

    private voice(name: Exclude<VoiceName, "hum" | "hiss">, at: number, duration = 1): void {
        const v = this.voices;
        switch (name) {
            case "key": {
                // a tiny burst of band-passed noise at a slightly random pitch
                const pitch = v.key.pitch + Math.random() * v.key.spread;
                this.noiseThrough(
                    this.filter("bandpass", pitch, v.key.q),
                    at,
                    v.key.length,
                    v.key.level,
                );
                return;
            }
            case "burst":
                this.noiseThrough(
                    this.filter("highpass", v.burst.highpass, v.burst.q),
                    at,
                    duration,
                    v.burst.level,
                );
                return;
            case "glitch":
                this.glitch(at, Math.min(duration, MAX_BURST));
                return;
            case "select":
                this.tone(at, v.select.from, v.select.length, v.select.wave, v.select.level);
                this.tone(
                    at + v.select.length,
                    v.select.to,
                    v.select.length,
                    v.select.wave,
                    v.select.level,
                );
                return;
            case "tick":
                this.tone(at, v.tick.pitch, v.tick.length, v.tick.wave, v.tick.level);
                return;
            case "dialog":
                this.tone(at, v.dialog.pitch, v.dialog.length, v.dialog.wave, v.dialog.level);
                return;
            case "alert":
                this.tone(at, v.alert.from, v.alert.length, v.alert.wave, v.alert.level);
                this.tone(
                    at + v.alert.length,
                    v.alert.to,
                    v.alert.length,
                    v.alert.wave,
                    v.alert.level,
                );
                return;
            case "error":
                this.tone(at, v.error.pitch, v.error.length, v.error.wave, v.error.level);
                return;
        }
    }

    /** Digital crackle: noise gated in random stutters, over a hopping tone. */
    private glitch(at: number, duration: number): void {
        const context = this.context as AudioContext;
        const g = this.voices.glitch;
        const gate = context.createGain();
        gate.gain.value = 0;
        const osc = context.createOscillator();
        const oscGain = context.createGain();
        osc.type = "square";
        oscGain.gain.value = g.tone;
        osc.connect(oscGain).connect(gate);

        const noise = context.createBufferSource();
        noise.buffer = this.noise;
        noise.loop = true;
        const band = this.filter("bandpass", g.band, 0.8);
        const noiseGain = context.createGain();
        noiseGain.gain.value = g.level;
        noise.connect(band).connect(noiseGain).connect(gate);
        gate.connect(this.master as GainNode);

        for (let t = 0; t < duration; t += g.stutter + Math.random() * g.stutterSpread) {
            // fewer, quieter stutters towards the end
            const fade = 1 - t / duration;
            const on = Math.random() < g.density * fade + 0.1;
            gate.gain.setValueAtTime(on ? fade : 0, at + t);
            osc.frequency.setValueAtTime(g.pitch + Math.random() * g.pitchSpread, at + t);
            band.frequency.setValueAtTime(g.band + Math.random() * g.bandSpread, at + t);
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
        if (level <= 0) return;
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
        if (level <= 0) return;
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

    /** Brings the volume, the hum and the hiss in line with the settings and voices. */
    private apply(): void {
        const { context, master, settings } = this;
        if (!context || !master) return;
        const now = context.currentTime;
        const on = settings !== null && !this.muted;
        master.gain.setTargetAtTime(on ? (settings?.volume ?? 0) : 0, now, 0.02);

        // the hum: mains, its harmonic, and the flyback whine
        const h = this.voices.hum;
        const humVoices: [number, number][] = [
            [h.mains, h.mainsLevel],
            [h.mains * 2, h.harmonicLevel],
            [h.whine, h.whineLevel],
        ];
        const wantHum = on && settings?.hum === true;
        if (wantHum && !this.hum) {
            const oscillators: OscillatorNode[] = [];
            const gains: GainNode[] = [];
            for (const [frequency, level] of humVoices) {
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.frequency.value = frequency;
                gain.gain.value = level;
                osc.connect(gain).connect(master);
                osc.start();
                oscillators.push(osc);
                gains.push(gain);
            }
            this.hum = { oscillators, gains };
        } else if (!wantHum && this.hum) {
            for (const osc of this.hum.oscillators) osc.stop();
            this.hum = null;
        } else if (this.hum) {
            humVoices.forEach(([frequency, level], i) => {
                this.hum?.oscillators[i]?.frequency.setTargetAtTime(frequency, now, 0.02);
                this.hum?.gains[i]?.gain.setTargetAtTime(level, now, 0.02);
            });
        }

        // the hiss under the static effect
        const hissLevel = on && settings?.static ? this.hissLevel * this.voices.hiss.level : 0;
        if (hissLevel > 0 && !this.hiss) {
            const source = context.createBufferSource();
            source.buffer = this.noise;
            source.loop = true;
            const filter = this.filter("highpass", this.voices.hiss.highpass, 0.5);
            const gain = context.createGain();
            gain.gain.value = 0;
            source.connect(filter).connect(gain).connect(master);
            source.start();
            this.hiss = { source, filter, gain };
        }
        if (this.hiss) {
            this.hiss.filter.frequency.setTargetAtTime(this.voices.hiss.highpass, now, 0.05);
            this.hiss.gain.gain.setTargetAtTime(hissLevel, now, 0.1);
        }
    }
}
