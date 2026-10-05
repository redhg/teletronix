import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Accordion,
    ActionIcon,
    Badge,
    Collapse,
    Group,
    Paper,
    Stack,
    Tabs,
    Text,
    Textarea,
    Tooltip,
    UnstyledButton,
} from "@mantine/core";
import { useMergedRef } from "@mantine/hooks";
import { useEffect, useMemo, useRef } from "react";
import { HAND_FORMS } from "./forms/ElementForms.tsx";
import { describe, JsonField, jsonSchemaOf, SchemaField } from "./SchemaForm.tsx";
import { ELEMENT_TYPES, type ElementFile, summarize, typeOf } from "./screens.ts";

/** Each element type's schema as JSON Schema, made once each, when first needed. */
const schemas = new Map<string, ReturnType<typeof jsonSchemaOf>>();
function schemaFor(type: string) {
    if (!schemas.has(type)) {
        const entry = ELEMENT_TYPES.find((candidate) => candidate.type === type);
        if (!entry) return null;
        schemas.set(type, jsonSchemaOf(entry.schema));
    }
    return schemas.get(type) ?? null;
}

interface Props {
    /** Its id in the list it can be dragged around */
    sortableId: string;
    element: ElementFile;
    /** Its place in the list, from 0 */
    index: number;
    count: number;
    /** Changes it: the whole element, or one of its properties */
    onChange: (element: ElementFile) => void;
    /** Mistakes in it: by property ("" for the element itself) */
    errors: Map<string, string>;
    expanded: boolean;
    onToggle: () => void;
    onMove: (by: number) => void;
    onDuplicate: () => void;
    /** Copies it, to paste into a screen */
    onCopy: () => void;
    onDelete: () => void;
}

/**
 * An element in a screen's content: a row saying what it is, which opens to edit it: its
 * settings, in a form built from its type's schema, or as JSON.
 */
export function ElementEditor({
    sortableId,
    element,
    index,
    count,
    onChange,
    errors,
    expanded,
    onToggle,
    onMove,
    onDuplicate,
    onCopy,
    onDelete,
}: Props) {
    const type = typeOf(element);
    const summary = summarize(element);
    const schema = useMemo(
        () => (typeof element === "string" ? null : schemaFor(type)),
        [element, type],
    );
    const defs = schema?.$defs ?? {};
    const problems = errors.size;
    // opened (e.g. just added, or from the problems list): brought into view
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (expanded) box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [expanded]);
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: sortableId });
    const ref = useMergedRef(box, setNodeRef);

    // its settings: each a field built from its schema, or (for the most used types) a form
    // made for it, with the rest under "More settings"
    const keys = Object.keys(schema?.properties ?? {}).filter((key) => key !== "type");
    const hand = typeof element === "string" ? undefined : HAND_FORMS[type];
    const more = hand ? keys.filter((key) => !hand.keys.includes(key)) : [];
    const moreSet =
        typeof element === "string" ? 0 : more.filter((key) => element[key] !== undefined).length;
    const set = (key: string, value: unknown) => {
        if (typeof element === "string") return;
        const next = { ...element };
        if (value === undefined) delete next[key];
        else next[key] = value;
        onChange(next);
    };
    const field = (key: string) => {
        const property = schema?.properties?.[key];
        if (!property || typeof element === "string") return null;
        return (
            <SchemaField
                key={key}
                name={key}
                schema={property}
                defs={defs}
                value={element[key]}
                error={errors.get(key)}
                required={schema?.required?.includes(key)}
                onChange={(value) => set(key, value)}
            />
        );
    };

    const form =
        typeof element === "string" ? (
            <Textarea
                label="Text"
                description="A line of text (a bare string is shorthand for a text element)"
                autosize
                minRows={1}
                value={element}
                error={errors.get("")}
                onChange={(event) => onChange(event.currentTarget.value)}
                styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            />
        ) : schema ? (
            <Stack gap="md">
                {errors.get("") && (
                    <Text size="sm" c="red">
                        {errors.get("")}
                    </Text>
                )}
                {hand ? (
                    <>
                        <hand.Form element={element} set={set} errors={errors} field={field} />
                        {more.length > 0 && (
                            <Accordion
                                variant="contained"
                                defaultValue={more.some((key) => errors.has(key)) ? "more" : null}
                            >
                                <Accordion.Item value="more">
                                    <Accordion.Control>
                                        <Group gap="xs">
                                            <Text size="sm" fw={500}>
                                                More settings
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {moreSet === 0 ? "none set" : `${moreSet} set`}
                                            </Text>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="md">{more.map(field)}</Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            </Accordion>
                        )}
                    </>
                ) : (
                    keys.map(field)
                )}
            </Stack>
        ) : (
            <Text size="sm" c="red">
                There's no element of type "{type}": edit it as JSON.
            </Text>
        );

    return (
        <Paper
            ref={ref}
            withBorder
            radius="md"
            className="editor-element"
            data-expanded={expanded || undefined}
            data-dragging={isDragging || undefined}
            style={{ transform: CSS.Translate.toString(transform), transition }}
        >
            <Group gap="xs" wrap="nowrap" pl={4} pr="sm" py={6}>
                <Tooltip label="Drag to move (or Space, then the arrow keys)" openDelay={500}>
                    <ActionIcon
                        ref={setActivatorNodeRef}
                        variant="subtle"
                        color="gray"
                        className="editor-element-handle"
                        {...attributes}
                        {...listeners}
                        aria-label={`Move element ${index + 1}`}
                        aria-roledescription="sortable"
                    >
                        ⠿
                    </ActionIcon>
                </Tooltip>
                <UnstyledButton
                    className="editor-element-summary"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    aria-label={`Element ${index + 1}: ${type}${summary ? `, ${summary}` : ""}`}
                >
                    <Group gap="xs" wrap="nowrap">
                        <Text size="xs" c="dimmed" w={22} ta="right" ff="monospace">
                            {index + 1}
                        </Text>
                        <Badge variant="light" radius="sm" tt="none">
                            {type}
                        </Badge>
                        <Text
                            size="sm"
                            ff="monospace"
                            truncate="end"
                            style={{ flex: 1, minWidth: 0 }}
                        >
                            {summary || (
                                <Text span c="dimmed">
                                    {element === "" ? "(blank line)" : "—"}
                                </Text>
                            )}
                        </Text>
                        {problems > 0 && (
                            <Badge size="sm" color="red" variant="light">
                                {problems === 1 ? "1 problem" : `${problems} problems`}
                            </Badge>
                        )}
                    </Group>
                </UnstyledButton>
                <Group gap={2} wrap="nowrap">
                    <Tooltip label="Move up">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Move up"
                            disabled={index === 0}
                            onClick={() => onMove(-1)}
                        >
                            ↑
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Move down">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Move down"
                            disabled={index === count - 1}
                            onClick={() => onMove(1)}
                        >
                            ↓
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Duplicate">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Duplicate"
                            onClick={onDuplicate}
                        >
                            ⧉
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Copy, to paste into a screen">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Copy"
                            onClick={onCopy}
                        >
                            ⎘
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete">
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label="Delete"
                            onClick={onDelete}
                        >
                            ✕
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
            <Collapse expanded={expanded}>
                {expanded && (
                    <Tabs defaultValue="settings" px="md" pb="md" keepMounted={false}>
                        <Tabs.List mb="sm">
                            <Tabs.Tab value="settings">Settings</Tabs.Tab>
                            <Tabs.Tab value="json">JSON</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="settings">
                            {schema && typeof element !== "string" && (
                                <Text size="xs" c="dimmed" mb="sm">
                                    {describe(schema).text}
                                </Text>
                            )}
                            {form}
                        </Tabs.Panel>
                        <Tabs.Panel value="json">
                            <JsonField
                                label="As JSON"
                                description="The element as written: anything a form can't do"
                                aria-label="As JSON"
                                value={element}
                                maxRows={30}
                                onChange={(value) => {
                                    if (value !== undefined) onChange(value as ElementFile);
                                }}
                            />
                        </Tabs.Panel>
                    </Tabs>
                )}
            </Collapse>
        </Paper>
    );
}
