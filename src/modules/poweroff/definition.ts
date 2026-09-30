import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

export const DEFAULT_POWER_OFF_DURATION = 900;

export const PowerOffSchema = z
    .strictObject({
        type: z.literal("power-off"),
        delay: z
            .number()
            .min(0)
            .default(0)
            .meta({ description: "Milliseconds to wait before it switches off (default: 0)" }),
        duration: z
            .number()
            .positive()
            .default(DEFAULT_POWER_OFF_DURATION)
            .meta({
                description: `Milliseconds the picture takes to collapse (default: ${DEFAULT_POWER_OFF_DURATION})`,
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Switches the screen off like an old CRT: the picture collapses to a bright line, " +
            "then a dot, then goes dark. It stays dark until the next screen; anything after it " +
            "(e.g. a pause, waiting for a key to switch back on) is there, but can't be seen.",
    });

export type PowerOffElement = z.output<typeof PowerOffSchema> & ElementIdentity;

export const powerOffModule: ModuleDefinition<PowerOffElement> = {
    text: () => "",
    reveal: (element, _spec, context) =>
        createTimedReveal(context.instant ? 0 : element.delay + element.duration),
};
