import { Select, SimpleGrid, Stack } from "@mantine/core";
import { useMemo } from "react";
import { ConfigSchema } from "../../engine/schema/program.ts";
import { Panel } from "../../mantine/Panel.tsx";
import { AmbienceField } from "../forms/AmbienceField.tsx";
import type { Path } from "../paths.ts";
import { describe, jsonSchemaOf, SchemaField } from "../SchemaForm.tsx";
import { APPEARANCE_KEYS } from "./AppearanceSection.tsx";

/** The program's own settings, in the order shown, under their headings. */
const GROUPS: { title: string; keys: string[] }[] = [
    { title: "About", keys: ["name", "author", "description", "start"] },
    {
        title: "How screens appear",
        keys: [
            "reveal",
            "transition",
            "align",
            "waitForReveal",
            "autoscroll",
            "defaults",
            "characters",
        ],
    },
    { title: "Bars", keys: ["header", "footer"] },
    { title: "Players", keys: ["skipKeys", "save", "blockContextMenu"] },
    { title: "Sound", keys: ["ambience"] },
];

interface Props {
    config: Record<string, unknown>;
    /** The program's screens, for the start screen */
    screens: string[];
    set: (path: Path, value: unknown) => void;
    /** Mistakes in the config, by property */
    errors: Map<string, string>;
}

/** The config's settings other than appearance, as fields built from its schema. */
export function ProgramSection({ config, screens, set, errors }: Props) {
    const schema = useMemo(() => jsonSchemaOf(ConfigSchema), []);
    const defs = schema.$defs ?? {};
    const properties = schema.properties ?? {};
    // (anything not in a group, e.g. a setting added later, still shows, at the end)
    const grouped = new Set([
        ...GROUPS.flatMap((group) => group.keys),
        ...APPEARANCE_KEYS,
        // (in a section of their own)
        "variables",
        "timers",
    ]);
    const others = Object.keys(properties).filter((key) => !grouped.has(key));

    const field = (key: string) => {
        const property = properties[key];
        if (!property) return null;
        if (key === "ambience") {
            return (
                <AmbienceField
                    key={key}
                    label="ambience"
                    description={describe(property).text}
                    value={config.ambience}
                    error={errors.get(key)}
                    onChange={(ambience) => set(["ambience"], ambience)}
                />
            );
        }
        if (key === "start") {
            const { text } = describe(property);
            return (
                <Select
                    key={key}
                    label="start"
                    description={text}
                    placeholder="The first screen"
                    data={screens}
                    searchable
                    clearable
                    value={typeof config.start === "string" ? config.start : null}
                    error={errors.get(key)}
                    onChange={(screen) => set(["start"], screen ?? undefined)}
                />
            );
        }
        return (
            <SchemaField
                key={key}
                name={key}
                schema={property}
                defs={defs}
                value={config[key]}
                error={errors.get(key)}
                onChange={(value) => set([key], value)}
            />
        );
    };

    return (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
            {[...GROUPS, ...(others.length > 0 ? [{ title: "Other", keys: others }] : [])].map(
                (group) => (
                    <Panel key={group.title} title={group.title}>
                        <Stack gap="md">{group.keys.map(field)}</Stack>
                    </Panel>
                ),
            )}
        </SimpleGrid>
    );
}
