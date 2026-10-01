import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import type { Element } from "../../engine/schema/elements.ts";

/** A section's contents as written: bare strings or elements, before ids are assigned. */
export type RawContent = string | ({ type: string } & Record<string, unknown>);

export const SectionMarkersSchema = z
    .strictObject({
        closed: z
            .string()
            .default("[+]")
            .meta({ description: 'Before the title while collapsed (default: "[+]")' }),
        open: z
            .string()
            .default("[-]")
            .meta({ description: 'Before the title while expanded (default: "[-]")' }),
    })
    .meta({ description: "What a section's header shows before its title" });

/**
 * The section schema, given the schema for its contents. Its contents are elements, which
 * can be sections, so the element registry (schema/elements.ts) builds it with its own
 * content schema, rather than this module importing that and making an import cycle.
 */
export const createSectionSchema = (content: () => z.ZodType<RawContent[], RawContent[]>) =>
    z
        .strictObject({
            type: z.literal("section"),
            title: z.string().min(1).meta({ description: "The header's text" }),
            seenTitle: z
                .string()
                .min(1)
                .optional()
                .meta({
                    description:
                        "The header's text once the section has been opened, remembered when " +
                        "you come back: e.g. without an unread mark",
                }),
            open: z
                .boolean()
                .default(false)
                .meta({ description: "Start expanded (default: false)" }),
            markers: SectionMarkersSchema.default({ closed: "[+]", open: "[-]" }).meta({
                description: "What the header shows before its title, e.g. ▶ and ▼",
            }),
            indent: z
                .int()
                .min(0)
                .default(0)
                .meta({
                    description:
                        "Columns to indent the contents by, to show they belong to the header. " +
                        "They wrap to the narrower width (default: 0)",
                }),
            content: z.lazy(content).meta({
                description:
                    "The elements shown when expanded, revealed in order like a screen's. They " +
                    "can include other sections.",
            }),
            ...ElementBaseShape,
        })
        .meta({
            description:
                "A header that expands and collapses the elements under it. Expanding reveals them " +
                '(set the section\'s reveal to change how, e.g. "instant"); collapsing hides them ' +
                "at once. It remembers whether it's open when you come back.",
        });

export type SectionElement = Omit<z.output<ReturnType<typeof createSectionSchema>>, "content"> &
    ElementIdentity & { content: Element[] };

/** A section's memory is whether it's expanded. */
export type SectionMemory = boolean;

export const sectionModule: ModuleDefinition<SectionElement, SectionMemory> = {
    text: (section, memory) => {
        const marker = sectionOpen(section, memory) ? section.markers.open : section.markers.closed;
        return `${marker} ${sectionTitle(section, memory)}`;
    },
};

/**
 * Its title: its seenTitle once it has been opened. (Its memory is only set by opening or
 * closing it, and one that starts open has been seen.)
 */
export function sectionTitle(section: SectionElement, memory: SectionMemory | undefined): string {
    const seen = section.open || memory !== undefined;
    return seen && section.seenTitle !== undefined ? section.seenTitle : section.title;
}

export function sectionOpen(section: SectionElement, memory: SectionMemory | undefined): boolean {
    return memory ?? section.open;
}
