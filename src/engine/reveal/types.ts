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

/** A way of making text appear. Pure: the same elapsed time always yields the same frame. */
export interface Reveal {
    /** Total running time in ms. The element reaches Done once this much time has elapsed. */
    readonly duration: number;
    /** The frame at `elapsed` ms since activation, for 0 <= elapsed < duration. */
    frame(elapsed: number): Frame;
    /** The fully revealed frame. */
    final(): Frame;
}
