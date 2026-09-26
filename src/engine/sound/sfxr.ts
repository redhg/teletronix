// Renders a sound recipe to samples. The synthesis is sfxr's, by Tomas Pettersson
// (DrPetter), as ported to JavaScript by jsfxr (https://github.com/chr15m/jsfxr, public
// domain); this is a TypeScript port of jsfxr's renderer, returning floats instead of a
// WAV file.

import type { Random } from "../random.ts";
import type { Recipe } from "./recipe.ts";

export const SAMPLE_RATE = 44100;
const OVERSAMPLING = 8;
/** Longest sound rendered, in samples: a guard against recipes that never end. */
const MAX_SAMPLES = SAMPLE_RATE * 10;

const WAVE_SHAPES = { square: 0, sawtooth: 1, sine: 2, noise: 3 } as const;

/** Renders a recipe to mono samples (-1 to 1) at SAMPLE_RATE. */
export function renderRecipe(recipe: Recipe, random: Random = Math.random): Float32Array {
    const p = recipe;
    const shape = WAVE_SHAPES[p.wave];

    // pitch, duty and arpeggio start over on each repeat
    let period = 0;
    let periodMax = 0;
    let frequencyCutoff = false;
    let periodMult = 0;
    let periodMultSlide = 0;
    let dutyCycle = 0;
    let dutyCycleSlide = 0;
    let arpeggioMultiplier = 0;
    let arpeggioTime = 0;
    let elapsedSinceRepeat = 0;
    const start = () => {
        elapsedSinceRepeat = 0;
        period = 100 / (p.frequency * p.frequency + 0.001);
        periodMax = 100 / (p.minFrequency * p.minFrequency + 0.001);
        frequencyCutoff = p.minFrequency > 0;
        periodMult = 1 - p.slide ** 3 * 0.01;
        periodMultSlide = -(p.deltaSlide ** 3) * 0.000001;
        dutyCycle = 0.5 - p.duty * 0.5;
        dutyCycleSlide = -p.dutySweep * 0.00005;
        arpeggioMultiplier = p.arpeggio >= 0 ? 1 - p.arpeggio ** 2 * 0.9 : 1 + p.arpeggio ** 2 * 10;
        arpeggioTime = Math.floor((1 - p.arpeggioSpeed) ** 2 * 20000 + 32);
        if (p.arpeggioSpeed === 1) arpeggioTime = 0;
    };
    start();

    // filters
    let fltw = p.lowpass ** 3 * 0.1;
    const lowpassOn = p.lowpass !== 1;
    const fltwD = 1 + p.lowpassSweep * 0.0001;
    const fltdmp = Math.min(0.8, (5 / (1 + p.lowpassResonance ** 2 * 20)) * (0.01 + fltw));
    let flthp = p.highpass ** 2 * 0.1;
    const flthpD = 1 + p.highpassSweep * 0.0003;

    const vibratoSpeed = p.vibratoSpeed ** 2 * 0.01;
    const vibratoAmplitude = p.vibratoDepth * 0.5;

    const envelopeLength = [
        Math.floor(p.attack * p.attack * 100000),
        Math.floor(p.sustain * p.sustain * 100000),
        Math.floor(p.decay * p.decay * 100000),
    ];

    let flangerOffset = p.flangerOffset ** 2 * 1020 * (p.flangerOffset < 0 ? -1 : 1);
    const flangerSlide = p.flangerSweep ** 2 * (p.flangerSweep < 0 ? -1 : 1);

    const repeatTime = p.repeatSpeed === 0 ? 0 : Math.floor((1 - p.repeatSpeed) ** 2 * 20000 + 32);
    const gain = Math.exp(p.volume) - 1;

    let fltp = 0;
    let fltdp = 0;
    let fltphp = 0;
    const noise = Array.from({ length: 32 }, () => random() * 2 - 1);
    let envelopeStage = 0;
    let envelopeElapsed = 0;
    let vibratoPhase = 0;
    let phase = 0;
    let ipp = 0;
    const flanger = new Float32Array(1024);
    const out: number[] = [];

    for (let t = 0; out.length < MAX_SAMPLES; t++) {
        if (repeatTime !== 0 && ++elapsedSinceRepeat >= repeatTime) start();

        if (arpeggioTime !== 0 && t >= arpeggioTime) {
            arpeggioTime = 0;
            period *= arpeggioMultiplier;
        }

        periodMult += periodMultSlide;
        period *= periodMult;
        if (period > periodMax) {
            period = periodMax;
            if (frequencyCutoff) break;
        }

        let rfperiod = period;
        if (vibratoAmplitude > 0) {
            vibratoPhase += vibratoSpeed;
            rfperiod = period * (1 + Math.sin(vibratoPhase) * vibratoAmplitude);
        }
        const iperiod = Math.max(OVERSAMPLING, Math.floor(rfperiod));

        dutyCycle = Math.min(0.5, Math.max(0, dutyCycle + dutyCycleSlide));

        if (++envelopeElapsed > (envelopeLength[envelopeStage] ?? 0)) {
            envelopeElapsed = 0;
            if (++envelopeStage > 2) break;
        }
        // (jsfxr divides by zero here for a stage of no length, making a NaN sample)
        const stageLength = envelopeLength[envelopeStage] ?? 0;
        const envf = stageLength > 0 ? envelopeElapsed / stageLength : 0;
        const envelope =
            envelopeStage === 0
                ? envf
                : envelopeStage === 1
                  ? 1 + (1 - envf) * 2 * p.punch
                  : 1 - envf;

        flangerOffset += flangerSlide;
        const iphase = Math.min(1023, Math.abs(Math.floor(flangerOffset)));

        if (flthpD !== 0) flthp = Math.min(0.1, Math.max(0.00001, flthp * flthpD));

        let sample = 0;
        for (let si = 0; si < OVERSAMPLING; si++) {
            let sub = 0;
            phase++;
            if (phase >= iperiod) {
                phase %= iperiod;
                if (shape === WAVE_SHAPES.noise) {
                    for (let i = 0; i < 32; i++) noise[i] = random() * 2 - 1;
                }
            }

            const fp = phase / iperiod;
            if (shape === WAVE_SHAPES.square) {
                sub = fp < dutyCycle ? 0.5 : -0.5;
            } else if (shape === WAVE_SHAPES.sawtooth) {
                sub =
                    fp < dutyCycle
                        ? -1 + (2 * fp) / dutyCycle
                        : 1 - (2 * (fp - dutyCycle)) / (1 - dutyCycle);
            } else if (shape === WAVE_SHAPES.sine) {
                sub = Math.sin(fp * 2 * Math.PI);
            } else {
                sub = noise[Math.floor((phase * 32) / iperiod)] ?? 0;
            }

            // low-pass
            const previous = fltp;
            fltw = Math.min(0.1, Math.max(0, fltw * fltwD));
            if (lowpassOn) {
                fltdp += (sub - fltp) * fltw;
                fltdp -= fltdp * fltdmp;
            } else {
                fltp = sub;
                fltdp = 0;
            }
            fltp += fltdp;

            // high-pass
            fltphp += fltp - previous;
            fltphp -= fltphp * flthp;
            sub = fltphp;

            // flanger
            flanger[ipp & 1023] = sub;
            sub += flanger[(ipp - iphase + 1024) & 1023] ?? 0;
            ipp = (ipp + 1) & 1023;

            sample += sub * envelope;
        }

        out.push(Math.min(1, Math.max(-1, (sample / OVERSAMPLING) * gain)));
    }

    return Float32Array.from(out);
}
