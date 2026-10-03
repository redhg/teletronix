import {
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
import { useEffect, useMemo, useRef } from "react";
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
    onDelete: () => void;
}

/**
 * An element in a screen's content: a row saying what it is, which opens to edit it: its
 * settings, in a form built from its type's schema, or as JSON.
 */
export function ElementEditor({
    element,
    index,
    count,
    onChange,
    errors,
    expanded,
    onToggle,
    onMove,
    onDuplicate,
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
                {Object.entries(schema.properties ?? {})
                    .filter(([key]) => key !== "type")
                    .map(([key, property]) => (
                        <SchemaField
                            key={key}
                            name={key}
                            schema={property}
                            defs={defs}
                            value={element[key]}
                            error={errors.get(key)}
                            onChange={(value) => {
                                const next = { ...element };
                                if (value === undefined) delete next[key];
                                else next[key] = value;
                                onChange(next);
                            }}
                        />
                    ))}
            </Stack>
        ) : (
            <Text size="sm" c="red">
                There's no element of type "{type}": edit it as JSON.
            </Text>
        );

    return (
        <Paper
            ref={box}
            withBorder
            radius="md"
            className="editor-element"
            data-expanded={expanded || undefined}
        >
            <Group gap="xs" wrap="nowrap" px="sm" py={6}>
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
