import { Button, Kbd, Text } from "@mantine/core";
import { Spotlight, type SpotlightActionGroupData, spotlight } from "@mantine/spotlight";

/** A command in the palette: a label to find it by, and what it does. */
export interface Command {
    id: string;
    label: string;
    /** A line under the label, e.g. a screen's id */
    description?: string;
    /** More words that find it */
    keywords?: string[];
    run: () => void;
}

/** Commands under a heading, e.g. "Go to" or "Timers". */
export interface CommandGroup {
    group: string;
    commands: Command[];
}

/** The most commands shown at once, so a big program's screens don't swamp the list. */
const LIMIT = 40;

/**
 * A command palette, opened with Cmd/Ctrl+K (in text fields too) or its button: every command
 * the app has, found by typing a few letters of it.
 */
export function Palette({ groups, placeholder }: { groups: CommandGroup[]; placeholder: string }) {
    const actions: SpotlightActionGroupData[] = groups
        .filter((group) => group.commands.length > 0)
        .map((group) => ({
            group: group.group,
            actions: group.commands.map((command) => ({
                id: `${group.group}:${command.id}`,
                label: command.label,
                ...(command.description ? { description: command.description } : {}),
                keywords: [group.group, ...(command.keywords ?? [])],
                onClick: command.run,
            })),
        }));
    return (
        <Spotlight
            actions={actions}
            limit={LIMIT}
            shortcut="mod + K"
            tagsToIgnore={[]}
            highlightQuery
            nothingFound="Nothing like that"
            scrollable
            maxHeight={440}
            searchProps={{ placeholder, "aria-label": "Command" }}
        />
    );
}

/** The button that opens the palette, showing its shortcut. */
export function PaletteButton() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    return (
        <Button
            size="xs"
            variant="default"
            onClick={() => spotlight.open()}
            rightSection={<Kbd size="xs">{mac ? "⌘K" : "Ctrl K"}</Kbd>}
            aria-label="Commands"
        >
            <Text size="xs" c="dimmed">
                Commands…
            </Text>
        </Button>
    );
}
