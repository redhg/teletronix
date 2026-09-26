import type { ComponentType } from "react";

export interface EffectViewProps<O> {
    options: O;
}

export type EffectView<O> = ComponentType<EffectViewProps<O>>;
