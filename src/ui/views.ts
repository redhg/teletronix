import type { ElementOf, ElementType } from "../engine/index.ts";
import { BitmapView } from "../modules/bitmap/View.tsx";
import { LinkView } from "../modules/link/View.tsx";
import { ProgressView } from "../modules/progress/View.tsx";
import { PromptView } from "../modules/prompt/View.tsx";
import { SliderView } from "../modules/slider/View.tsx";
import { TextView } from "../modules/text/View.tsx";
import { ToggleView } from "../modules/toggle/View.tsx";
import type { ElementView } from "./element-view.ts";

// Every element type needs a view; a missing one is a compile error.
export const views: { [T in ElementType]: ElementView<ElementOf<T>> } = {
    text: TextView,
    link: LinkView,
    toggle: ToggleView,
    prompt: PromptView,
    bitmap: BitmapView,
    progress: ProgressView,
    slider: SliderView,
};
