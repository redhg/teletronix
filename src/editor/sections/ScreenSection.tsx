import {
    Accordion,
    Button,
    Code,
    Group,
    Menu,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { ScreenSchema } from "../../engine/schema/program.ts";
import { Panel } from "../../mantine/Panel.tsx";
import { ElementEditor } from "../ElementEditor.tsx";
import { describe, jsonSchemaOf, SchemaField } from "../SchemaForm.tsx";
import { ELEMENT_TYPES, type ElementFile, newElement, type ScreenFile } from "../screens.ts";

/** What a screen's mistakes are about: one of its settings, or an element (and its setting). */
export interface ScreenErrors {
    settings: Map<string, string>;
    /** By element, then by its property ("" for the element itself) */
    elements: Map<number, Map<string, string>>;
}

interface Props {
    id: string;
    screen: ScreenFile;
    /** Every screen's id, for parents */
    screens: string[];
    onChange: (screen: ScreenFile) => void;
    /** Renames it; returns why not, if it can't be */
    onRename: (to: string) => string | null;
    onDuplicate: () => void;
    onDelete: () => void;
    onPreview: () => void;
    errors: ScreenErrors;
    /** The open element, if any */
    open: number | null;
    onOpen: (index: number | null) => void;
}

/** A screen: its settings, and its content, an element at a time. */
export function ScreenSection({
    id,
    screen,
    screens,
    onChange,
    onRename,
    onDuplicate,
    onDelete,
    onPreview,
    errors,
    open,
    onOpen,
}: Props) {
    const schema = useMemo(() => jsonSchemaOf(ScreenSchema), []);
    const defs = schema.$defs ?? {};
    const content = (screen.content ?? []) as ElementFile[];
    const setContent = (next: ElementFile[]) => onChange({ ...screen, content: next });
    const set = (key: string, value: unknown) => {
        const next = { ...screen };
        if (value === undefined) delete next[key];
        else next[key] = value;
        onChange(next);
    };
    const settingKeys = Object.keys(schema.properties ?? {}).filter((key) => key !== "content");
    const setCount = settingKeys.filter((key) => screen[key] !== undefined).length;

    return (
        <Stack gap="lg">
            <Header
                id={id}
                onRename={onRename}
                onPreview={onPreview}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
            />

            <Accordion
                variant="contained"
                defaultValue={errors.settings.size > 0 ? "settings" : null}
            >
                <Accordion.Item value="settings">
                    <Accordion.Control>
                        <Group gap="xs">
                            <Text fw={500}>Screen settings</Text>
                            <Text size="sm" c="dimmed">
                                {setCount === 0 ? "all as the program says" : `${setCount} set`}
                            </Text>
                            {errors.settings.size > 0 && (
                                <Text size="sm" c="red">
                                    · {errors.settings.size} problem
                                    {errors.settings.size > 1 && "s"}
                                </Text>
                            )}
                        </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="md">
                            {settingKeys.map((key) => {
                                const property = schema.properties?.[key];
                                if (!property) return null;
                                if (key === "parent") {
                                    return (
                                        <Select
                                            key={key}
                                            label="parent"
                                            description={describe(property).text}
                                            placeholder="None: at the top"
                                            data={screens.filter((other) => other !== id)}
                                            searchable
                                            clearable
                                            value={
                                                typeof screen.parent === "string"
                                                    ? screen.parent
                                                    : null
                                            }
                                            error={errors.settings.get(key)}
                                            onChange={(parent) =>
                                                set("parent", parent ?? undefined)
                                            }
                                        />
                                    );
                                }
                                return (
                                    <SchemaField
                                        key={key}
                                        name={key}
                                        schema={property}
                                        defs={defs}
                                        value={screen[key]}
                                        error={errors.settings.get(key)}
                                        onChange={(value) => set(key, value)}
                                    />
                                );
                            })}
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>

            <Panel title={`Content: ${content.length} element${content.length === 1 ? "" : "s"}`}>
                {screen.preset !== undefined && (
                    <Text size="sm" c="dimmed">
                        This screen is a preset: its own content (if any) comes after the preset's.
                    </Text>
                )}
                <Stack gap={6}>
                    {content.map((element, index) => (
                        <ElementEditor
                            // biome-ignore lint/suspicious/noArrayIndexKey: elements have no ids of their own
                            key={index}
                            element={element}
                            index={index}
                            count={content.length}
                            errors={errors.elements.get(index) ?? new Map()}
                            expanded={open === index}
                            onToggle={() => onOpen(open === index ? null : index)}
                            onChange={(next) =>
                                setContent(content.map((old, at) => (at === index ? next : old)))
                            }
                            onMove={(by) => {
                                const to = index + by;
                                const next = [...content];
                                [next[index], next[to]] = [
                                    next[to] as ElementFile,
                                    next[index] as ElementFile,
                                ];
                                setContent(next);
                                if (open === index) onOpen(to);
                            }}
                            onDuplicate={() => {
                                setContent([
                                    ...content.slice(0, index + 1),
                                    structuredClone(element),
                                    ...content.slice(index + 1),
                                ]);
                                onOpen(index + 1);
                            }}
                            onDelete={() => {
                                setContent(content.filter((_, at) => at !== index));
                                if (open === index) onOpen(null);
                            }}
                        />
                    ))}
                </Stack>
                <AddElement
                    onAdd={(type) => {
                        setContent([...content, newElement(type)]);
                        onOpen(content.length);
                    }}
                />
            </Panel>
        </Stack>
    );
}

/** The screen's id (renamable), and what can be done with it. */
function Header({
    id,
    onRename,
    onPreview,
    onDuplicate,
    onDelete,
}: {
    id: string;
    onRename: (to: string) => string | null;
    onPreview: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const [renaming, setRenaming] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const finish = () => {
        if (renaming === null) return;
        const why = renaming === id ? null : onRename(renaming);
        setProblem(why);
        if (!why) setRenaming(null);
    };
    return (
        <Group justify="space-between" align="start">
            {renaming === null ? (
                <Group gap="xs" align="baseline">
                    <Title order={2}>Screen</Title>
                    <Code fz="lg">{id}</Code>
                    <Button size="compact-xs" variant="subtle" onClick={() => setRenaming(id)}>
                        Rename
                    </Button>
                </Group>
            ) : (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        finish();
                    }}
                >
                    <Group gap="xs" align="start">
                        <TextInput
                            aria-label="Screen id"
                            value={renaming}
                            error={problem}
                            description="Links and other screens that name it are renamed too"
                            onChange={(event) =>
                                setRenaming(event.currentTarget.value.replace(/[^\w-]/g, "-"))
                            }
                            autoFocus
                            styles={{
                                input: { fontFamily: "var(--mantine-font-family-monospace)" },
                            }}
                        />
                        <Button type="submit">Rename</Button>
                        <Button variant="default" onClick={() => setRenaming(null)}>
                            Cancel
                        </Button>
                    </Group>
                </form>
            )}
            <Group gap="xs">
                <Button variant="light" onClick={onPreview}>
                    Show in the preview
                </Button>
                <Menu position="bottom-end">
                    <Menu.Target>
                        <Button variant="default">More</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item onClick={onDuplicate}>Duplicate the screen</Menu.Item>
                        <Menu.Item
                            color="red"
                            onClick={() => {
                                if (confirm(`Delete the screen "${id}"? (Undo brings it back.)`))
                                    onDelete();
                            }}
                        >
                            Delete the screen
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        </Group>
    );
}

/** Adds an element at the end: any type, found by name or what it does. */
function AddElement({ onAdd }: { onAdd: (type: string) => void }) {
    const [value, setValue] = useState<string | null>(null);
    const data = useMemo(
        () =>
            ELEMENT_TYPES.map((entry) => ({
                value: entry.type,
                label: entry.type,
                description: describe({ description: entry.description }).text,
            })),
        [],
    );
    return (
        <Select
            aria-label="Add an element"
            placeholder="+ Add an element…"
            searchable
            value={value}
            data={data}
            maxDropdownHeight={360}
            renderOption={({ option }) => (
                <Stack gap={0}>
                    <Text size="sm" ff="monospace">
                        {option.label}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                        {(option as (typeof data)[number]).description}
                    </Text>
                </Stack>
            )}
            onChange={(type) => {
                if (!type) return;
                onAdd(type);
                setValue(null);
            }}
        />
    );
}
