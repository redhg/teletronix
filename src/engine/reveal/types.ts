export type SegmentKind = "visible" | "cursor" | "hidden";

export interface Segment {
    kind: SegmentKind;
    text: string;
}

/**
 * One rendered moment of an element. Before line breaks are applied, the segments'
 * lengths add up to exactly the source text's length, so layout never shifts.
 */
export type Frame = readonly Segment[];

/** A way of making text appear (or disappear). */
export interface Reveal {
    /** Total running time in ms. The element reaches Done once this much time has elapsed. */
    readonly duration: number;
    /**
     * The frame at `elapsed` ms since activation, for 0 <= elapsed < duration. Reveals may
     * keep state between frames (glitch does), so call this with non-decreasing times.
     * Return the previous frame object when nothing changed.
     */
    frame(elapsed: number): Frame;
    /** The fully revealed frame, or the last one if the reveal was interrupted. */
    final(): Frame;
    /**
     * Stops the reveal where it is, at `elapsed`, if it can be interrupted; `key` is the key
     * press (a KeyboardEvent.key) that did it.
     */
    interrupt?(elapsed: number, key: string): void;
}
