import { ScanlinesView } from "../effects/scanlines/View.tsx";
import { StaticView } from "../effects/static/View.tsx";
import type { EffectName, EffectOptions, ResolvedEffects } from "../engine/index.ts";
import type { EffectView } from "./effect-view.ts";

// Every effect needs a view; a missing one is a compile error. Effects stack in this
// order, the last one on top.
const views: { [N in EffectName]: EffectView<EffectOptions[N]> } = {
    static: StaticView,
    scanlines: ScanlinesView,
};

/** The effects that are on, layered over the terminal. */
export function EffectsLayer({ effects }: { effects: ResolvedEffects }) {
    return (
        <div className="effects" aria-hidden="true">
            {(Object.keys(views) as EffectName[]).map((name) => {
                const options = effects[name];
                if (!options) return null;
                const View = views[name] as EffectView<typeof options>;
                return <View key={name} options={options} />;
            })}
        </div>
    );
}
