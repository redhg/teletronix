import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
import { MenuCaret } from "../../mantine/MenuCaret.tsx";
import { Panel } from "../../mantine/Panel.tsx";
import { ElementEditor } from "../ElementEditor.tsx";
import { describe, jsonSchemaOf, SchemaField } from "../SchemaForm.tsx";
import {
    ELEMENT_TYPES,
    type ElementFile,
    newElement,
    type ScreenFile,
    summarize,
    typeOf,
} from "../screens.ts";

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
    /** The element copied, to paste, if any */
    copied: ElementFile | null;
    onCopy: (element: ElementFile) => void;
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
    copied,
    onCopy,
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

    // dragging an element by its handle (or picking it up with Space or Enter, then the arrow
    // keys) moves it; elements have no ids of their own, so they go by their place
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const ids = content.map((_, index) => `element-${index}`);
    const indexOf = (id: string | number) => ids.indexOf(String(id));
    const nameOf = (id: string | number) => {
        const index = indexOf(id);
        const element = content[index];
        if (element === undefined) return "the element";
        const summary = summarize(element);
        return `element ${index + 1}, ${typeOf(element)}${summary ? ` ${summary}` : ""}`;
    };
    const move = (from: number, to: number) => {
        if (from === to || from < 0 || to < 0) return;
        setContent(arrayMove(content, from, to));
        if (open === from) onOpen(to);
        else if (open !== null && from < open && to >= open) onOpen(open - 1);
        else if (open !== null && from > open && to <= open) onOpen(open + 1);
    };
    const dropped = ({ active, over }: DragEndEvent) => {
        if (over) move(indexOf(active.id), indexOf(over.id));
    };
    const setCount = settingKeys.filter((key) => screen[key] !== undefined).length;

    return (
        <Stack gap="lg">
            <Header
                id={id}
                title={typeof screen.title === "string" ? screen.title : undefined}
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
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    onDragEnd={dropped}
                    accessibility={{
                        screenReaderInstructions: {
                            draggable:
                                "To move an element, press Space or Enter to pick it up, the up and down arrow keys to move it, then Space or Enter to drop it, or Escape to put it back.",
                        },
                        announcements: {
                            onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
                            onDragOver: ({ active, over }) =>
                                over
                                    ? `${nameOf(active.id)} is now at ${indexOf(over.id) + 1} of ${content.length}.`
                                    : `${nameOf(active.id)} is outside the list.`,
                            onDragEnd: ({ active, over }) =>
                                over
                                    ? `Dropped ${nameOf(active.id)} at ${indexOf(over.id) + 1}.`
                                    : `Put ${nameOf(active.id)} back.`,
                            onDragCancel: ({ active }) => `Put ${nameOf(active.id)} back.`,
                        },
                    }}
                >
                    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                        <Stack gap={6}>
                            {content.map((element, index) => (
                                <ElementEditor
                                    // biome-ignore lint/suspicious/noArrayIndexKey: elements have no ids of their own
                                    key={index}
                                    sortableId={ids[index] as string}
                                    element={element}
                                    index={index}
                                    count={content.length}
                                    errors={errors.elements.get(index) ?? new Map()}
                                    expanded={open === index}
                                    onToggle={() => onOpen(open === index ? null : index)}
                                    onChange={(next) =>
                                        setContent(
                                            content.map((old, at) => (at === index ? next : old)),
                                        )
                                    }
                                    onMove={(by) => move(index, index + by)}
                                    onDuplicate={() => {
                                        setContent([
                                            ...content.slice(0, index + 1),
                                            structuredClone(element),
                                            ...content.slice(index + 1),
                                        ]);
                                        onOpen(index + 1);
                                    }}
                                    onCopy={() => onCopy(structuredClone(element))}
                                    onDelete={() => {
                                        setContent(content.filter((_, at) => at !== index));
                                        if (open === index) onOpen(null);
                                    }}
                                />
                            ))}
                        </Stack>
                    </SortableContext>
                </DndContext>
                <Group gap="xs" align="start" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                        <AddElement
                            onAdd={(type) => {
                                setContent([...content, newElement(type)]);
                                onOpen(content.length);
                            }}
                        />
                    </div>
                    <Button
                        variant="default"
                        disabled={copied === null}
                        onClick={() => {
                            if (copied === null) return;
                            setContent([...content, structuredClone(copied)]);
                            onOpen(content.length);
                        }}
                    >
                        Paste
                    </Button>
                </Group>
            </Panel>
        </Stack>
    );
}

/** The screen's id (renamable), and what can be done with it. */
function Header({
    id,
    title,
    onRename,
    onPreview,
    onDuplicate,
    onDelete,
}: {
    id: string;
    /** Its name in breadcrumbs, if it has one */
    title?: string;
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
                    {title && (
                        <Text c="dimmed" size="lg">
                            · {title}
                        </Text>
                    )}
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
                        <Button variant="default" rightSection={<MenuCaret />}>
                            More
                        </Button>
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
