import type { ElementOf, ElementType } from "../engine/index.ts";
import { AsciiView } from "../modules/ascii/View.tsx";
import { BitmapView } from "../modules/bitmap/View.tsx";
import { ButtonsView } from "../modules/buttons/View.tsx";
import { ChoiceView } from "../modules/choice/View.tsx";
import { ColumnsView } from "../modules/columns/View.tsx";
import { LinkView } from "../modules/link/View.tsx";
import { MenuView } from "../modules/menu/View.tsx";
import { MeterView } from "../modules/meter/View.tsx";
import { NumberView } from "../modules/number/View.tsx";
import { PauseView } from "../modules/pause/View.tsx";
import { ProgressView } from "../modules/progress/View.tsx";
import { PromptView } from "../modules/prompt/View.tsx";
import { SectionView } from "../modules/section/View.tsx";
import { SliderView } from "../modules/slider/View.tsx";
import { TableView } from "../modules/table/View.tsx";
import { TextView } from "../modules/text/View.tsx";
import { TimerView } from "../modules/timer/View.tsx";
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
    section: SectionView,
    pause: PauseView,
    buttons: ButtonsView,
    number: NumberView,
    timer: TimerView,
    columns: ColumnsView,
    meter: MeterView,
    table: TableView,
    choice: ChoiceView,
    menu: MenuView,
    ascii: AsciiView,
};
