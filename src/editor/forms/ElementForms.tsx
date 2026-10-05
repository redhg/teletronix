import {
    ActionIcon,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from "@mantine/core";
import type { ReactNode } from "react";
import { ActionField } from "./ActionField.tsx";
import { withKind, withSetting } from "./actions.ts";
import { useProgramNames } from "./names.ts";

// Forms made by hand for the most used elements: what matters most first, in words, with
// everything else under "More settings" (built from the schema, as for other elements).

export interface HandFormProps {
    element: Record<string, unknown>;
    /** Sets one of its properties; undefined leaves it out */
    set: (key: string, value: unknown) => void;
    /** Mistakes in it, by property */
    errors: Map<string, string>;
    /** The form built from the schema for one of its properties */
    field: (key: string) => ReactNode;
}

interface HandForm {
    /** The properties it has fields for; the rest go under "More settings" */
    keys: string[];
    Form: (props: HandFormProps) => ReactNode;
}

const monospace = { input: { fontFamily: "var(--mantine-font-family-monospace)" } };

/** A text element: its text (as written, a string or a list of lines), and where it sits. */
function TextForm({ element, set, errors, field }: HandFormProps) {
    const asLines = Array.isArray(element.text);
    const text = Array.isArray(element.text)
        ? element.text.join("\n")
        : typeof element.text === "string"
          ? element.text
          : "";
    return (
        <Stack gap="md">
            <Textarea
                label="Text"
                description="Line breaks are kept. Show a variable with {name}."
                autosize
                minRows={2}
                maxRows={20}
                value={text}
                error={errors.get("text")}
                onChange={(event) => {
                    const next = event.currentTarget.value;
                    set("text", next === "" ? undefined : asLines ? next.split("\n") : next);
                }}
                styles={monospace}
            />
            {field("align")}
        </Stack>
    );
}

/** A link: its text, and what clicking it does. */
function LinkForm({ element, set, errors }: HandFormProps) {
    return (
        <Stack gap="md">
            <TextInput
                label="Text"
                description='e.g. "> OPEN THE POD BAY DOORS"'
                value={typeof element.text === "string" ? element.text : ""}
                error={errors.get("text")}
                onChange={(event) => set("text", event.currentTarget.value || undefined)}
                styles={monospace}
            />
            <ActionField
                label="When it's clicked"
                value={element.action}
                onChange={(action) => set("action", action)}
                error={errors.get("action")}
            />
        </Stack>
    );
}

/** A menu: its items, each with its text, a key that chooses it, and what it does. */
function MenuForm({ element, set, errors, field }: HandFormProps) {
    const names = useProgramNames();
    const items = (Array.isArray(element.items) ? element.items : []) as Record<string, unknown>[];
    const setItems = (next: Record<string, unknown>[]) => set("items", next);
    const setItem = (index: number, key: string, value: unknown) =>
        setItems(items.map((item, at) => (at === index ? withSetting(item, key, value) : item)));
    const move = (index: number, by: number) => {
        const next = [...items];
        const [item] = next.splice(index, 1);
        if (item) next.splice(index + by, 0, item);
        setItems(next);
    };
    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Text size="sm" fw={500}>
                    Items
                </Text>
                {errors.get("items") && (
                    <Text size="xs" c="red">
                        {errors.get("items")}
                    </Text>
                )}
                {items.map((item, index) => {
                    const number = index + 1;
                    return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: items have no ids of their own
                        <Paper key={index} withBorder p="xs" radius="md">
                            <Stack gap="xs">
                                <Group gap="xs" wrap="nowrap">
                                    <Text size="xs" c="dimmed" ff="monospace" w={18} ta="right">
                                        {number}
                                    </Text>
                                    <TextInput
                                        size="xs"
                                        aria-label={`Item ${number}: text`}
                                        placeholder="Its text"
                                        value={typeof item.text === "string" ? item.text : ""}
                                        onChange={(event) =>
                                            setItem(index, "text", event.currentTarget.value)
                                        }
                                        styles={monospace}
                                        style={{ flex: 1 }}
                                    />
                                    <Tooltip label="A key that chooses it from anywhere on the screen">
                                        <TextInput
                                            size="xs"
                                            aria-label={`Item ${number}: key`}
                                            placeholder="key"
                                            value={typeof item.key === "string" ? item.key : ""}
                                            onChange={(event) =>
                                                setItem(index, "key", event.currentTarget.value)
                                            }
                                            styles={monospace}
                                            w={64}
                                        />
                                    </Tooltip>
                                    <Group gap={0} wrap="nowrap">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`Move item ${number} up`}
                                            disabled={index === 0}
                                            onClick={() => move(index, -1)}
                                        >
                                            ↑
                                        </ActionIcon>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`Move item ${number} down`}
                                            disabled={index === items.length - 1}
                                            onClick={() => move(index, 1)}
                                        >
                                            ↓
                                        </ActionIcon>
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            aria-label={`Delete item ${number}`}
                                            disabled={items.length === 1}
                                            onClick={() =>
                                                setItems(items.filter((_, at) => at !== index))
                                            }
                                        >
                                            ✕
                                        </ActionIcon>
                                    </Group>
                                </Group>
                                <ActionField
                                    label={`Item ${number}: when it's chosen`}
                                    value={item.action}
                                    onChange={(action) => setItem(index, "action", action)}
                                />
                            </Stack>
                        </Paper>
                    );
                })}
                <Group>
                    <Button
                        size="xs"
                        variant="light"
                        onClick={() =>
                            setItems([
                                ...items,
                                {
                                    text: "NEW ITEM",
                                    action:
                                        names.screens.length > 0
                                            ? withKind(undefined, "screen", {
                                                  screens: names.screens.map((screen) => screen.id),
                                                  dialogs: names.dialogs,
                                              })
                                            : { back: true },
                                },
                            ])
                        }
                    >
                        Add an item
                    </Button>
                </Group>
            </Stack>
            {field("marker")}
        </Stack>
    );
}

/** The element types with forms of their own. */
export const HAND_FORMS: Record<string, HandForm> = {
    text: { keys: ["text", "align"], Form: TextForm },
    link: { keys: ["text", "action"], Form: LinkForm },
    menu: { keys: ["items", "marker"], Form: MenuForm },
};
