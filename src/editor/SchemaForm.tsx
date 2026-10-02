import {
    ActionIcon,
    Group,
    JsonInput,
    NumberInput,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from "@mantine/core";
import { type ReactNode, useEffect, useState } from "react";
import { z } from "zod";

/** The parts of a JSON Schema the forms read. */
export interface JsonSchema {
    type?: string | string[];
    description?: string;
    default?: unknown;
    enum?: unknown[];
    const?: unknown;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    $ref?: string;
    properties?: Record<string, JsonSchema>;
    minimum?: number;
    maximum?: number;
    $defs?: Record<string, JsonSchema>;
}

/** A schema as JSON Schema, for building forms from: the input side (what people write). */
export function jsonSchemaOf(schema: z.ZodType): JsonSchema {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
}

/** `schema`, with a reference to a named one followed. */
function resolve(schema: JsonSchema, defs: Record<string, JsonSchema>): JsonSchema {
    let at = schema;
    for (let hops = 0; at.$ref && hops < 10; hops++) {
        const name = at.$ref.replace(/^#\/\$defs\//, "");
        const { $ref: _, ...rest } = at;
        at = { ...defs[name], ...rest };
    }
    return at;
}

/** The fixed values a schema allows, if that's all it allows (e.g. "left", "center"…). */
function choicesOf(schema: JsonSchema): string[] | null {
    if (schema.enum?.every((value) => typeof value === "string")) return schema.enum as string[];
    const options = schema.anyOf ?? schema.oneOf;
    if (options?.every((option) => typeof option.const === "string")) {
        return options.map((option) => option.const as string);
    }
    return null;
}

/** A schema's description without its "(default: …)", and the default it gives. */
export function describe(schema: JsonSchema): { text: string; default?: string } {
    const text = schema.description ?? "";
    const match = /\s*\(default: (.+)\)\s*$/.exec(text);
    return match ? { text: text.slice(0, match.index), default: match[1] } : { text };
}

interface FieldProps {
    name: string;
    schema: JsonSchema;
    defs: Record<string, JsonSchema>;
    value: unknown;
    /** Sets the value; undefined leaves it out, for its default */
    onChange: (value: unknown) => void;
    error?: string;
    /** In place of the field's usual input */
    children?: ReactNode;
}

/**
 * A field for one property, built from its schema: a switch, a number, text, a choice of
 * values, or JSON for anything more involved. Leaving it empty (or ↺) uses its default.
 */
export function SchemaField({ name, schema, defs, value, onChange, error, children }: FieldProps) {
    const resolved = resolve(schema, defs);
    const { text, default: fallback } = describe(resolved);
    // (a default of text is written in quotes: a placeholder shows the text itself)
    const shown = fallback?.replace(/^"(.*)"$/, "$1");
    const set = value !== undefined;
    const label = (
        <Group gap={6} wrap="nowrap" component="span">
            <span>{name}</span>
            {set && (
                <Tooltip label="Back to the default (leave it out)">
                    <ActionIcon
                        component="span"
                        size="xs"
                        variant="subtle"
                        color="gray"
                        aria-label={`${name}: back to the default`}
                        onClick={(event) => {
                            event.preventDefault();
                            onChange(undefined);
                        }}
                    >
                        ↺
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
    const description = (
        <>
            {text}
            {fallback !== undefined && (
                <Text component="span" size="xs" c="dimmed" display="block">
                    Default: {fallback}
                </Text>
            )}
        </>
    );
    const common = { label, description, error, "aria-label": name };

    if (children) {
        return (
            <Stack gap={4}>
                <Text size="sm" fw={500}>
                    {label}
                </Text>
                <Text size="xs" c="dimmed">
                    {description}
                </Text>
                {children}
            </Stack>
        );
    }

    const choices = choicesOf(resolved);
    if (choices) {
        return (
            <Select
                {...common}
                data={choices}
                value={typeof value === "string" ? value : null}
                placeholder={shown ?? "—"}
                onChange={(choice) => onChange(choice ?? undefined)}
                clearable
            />
        );
    }
    if (resolved.type === "boolean") {
        const on =
            typeof value === "boolean" ? value : resolved.default === true || fallback === "true";
        return (
            <Switch
                label={label}
                description={description}
                error={error}
                aria-label={name}
                checked={on}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
        );
    }
    if (resolved.type === "string") {
        return (
            <TextInput
                {...common}
                value={typeof value === "string" ? value : ""}
                placeholder={shown}
                onChange={(event) => onChange(event.currentTarget.value || undefined)}
            />
        );
    }
    if (resolved.type === "number" || resolved.type === "integer") {
        return (
            <NumberInput
                {...common}
                value={typeof value === "number" ? value : ""}
                placeholder={fallback}
                min={resolved.minimum}
                max={resolved.maximum}
                allowDecimal={resolved.type === "number"}
                onChange={(number) => onChange(typeof number === "number" ? number : undefined)}
            />
        );
    }
    return <JsonField {...common} value={value} onChange={onChange} placeholder={fallback} />;
}

/** JSON, for anything a simple field can't hold: set as soon as it's valid. */
export function JsonField({
    value,
    onChange,
    error,
    placeholder,
    ...rest
}: {
    label: ReactNode;
    description: ReactNode;
    "aria-label": string;
    value: unknown;
    onChange: (value: unknown) => void;
    error?: string;
    placeholder?: string;
    maxRows?: number;
}) {
    const written = value === undefined ? "" : JSON.stringify(value, null, 2);
    const [draft, setDraft] = useState(written);
    const [invalid, setInvalid] = useState(false);
    // (an undo, or an edit elsewhere, shows here)
    useEffect(() => {
        setDraft((was) => (sameJson(was, value) ? was : written));
        setInvalid(false);
    }, [value, written]);
    return (
        <JsonInput
            {...rest}
            value={draft}
            placeholder={placeholder}
            error={invalid ? "Not valid JSON yet" : error}
            autosize
            minRows={2}
            maxRows={rest.maxRows ?? 16}
            formatOnBlur
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            onChange={(text) => {
                setDraft(text);
                if (text.trim() === "") {
                    setInvalid(false);
                    onChange(undefined);
                    return;
                }
                try {
                    const parsed: unknown = JSON.parse(text);
                    setInvalid(false);
                    onChange(parsed);
                } catch {
                    setInvalid(true);
                }
            }}
        />
    );
}

/** Whether JSON text says the same as a value. */
function sameJson(text: string, value: unknown): boolean {
    try {
        return JSON.stringify(JSON.parse(text)) === JSON.stringify(value);
    } catch {
        return value === undefined && text.trim() === "";
    }
}
