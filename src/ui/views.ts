import type { ElementOf, ElementType } from "../engine/index.ts";
import { LinkView } from "../modules/link/View.tsx";
import { TextView } from "../modules/text/View.tsx";
import type { ElementView } from "./element-view.ts";

// Every element type needs a view; a missing one is a compile error.
export const views: { [T in ElementType]: ElementView<ElementOf<T>> } = {
    text: TextView,
    link: LinkView,
};
