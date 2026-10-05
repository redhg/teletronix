import {
    ActionIcon,
    Button,
    Code,
    Group,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { TimerSchema } from "../../engine/schema/timers.ts";
import { Panel } from "../../mantine/Panel.tsx";
import type { Path } from "../paths.ts";
import { jsonSchemaOf, SchemaField } from "../SchemaForm.tsx";

type Value = boolean | number | string;
type Kind = "boolean" | "number" | "string";
const KINDS: { value: Kind; label: string }[] = [
    { value: "boolean", label: "True/false" },
    { value: "number", label: "Number" },
    { value: "string", label: "Text" },
];
/** A value of each kind, for a new variable or one changing kind. */
const STARTS: Record<Kind, Value> = { boolean: false, number: 0, string: "" };
const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

interface Props {
    config: Record<string, unknown>;
    set: (path: Path, value: unknown) => void;
    /** Mistakes in the config, by property */
    errors: Map<string, string>;
}

/** The program's variables (each a name, a kind and its starting value) and its timers. */
export function VariablesSection({ config, set, errors }: Props) {
    const variables = (config.variables ?? {}) as Record<string, Value>;
    const timers = (config.timers ?? {}) as Record<string, Record<string, unknown>>;
    const timer = useMemo(() => jsonSchemaOf(TimerSchema), []);
    const taken = [...Object.keys(variables), ...Object.keys(timers)];

    return (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Panel title="Variables">
                <Text size="xs" c="dimmed">
                    What the program remembers as it's played, from these starting values: shown in
                    text as {"{name}"}, and changed and tested by actions and conditions.
                </Text>
                {errors.get("variables") && (
                    <Text size="sm" c="red">
                        {errors.get("variables")}
                    </Text>
                )}
                {Object.keys(variables).length > 0 && (
                    <Table verticalSpacing={4}>
                        <Table.Tbody>
                            {Object.entries(variables).map(([name, value]) => {
                                const kind = typeof value as Kind;
                                const setValue = (next: Value) => set(["variables", name], next);
                                return (
                                    <Table.Tr key={name}>
                                        <Table.Td>
                                            <Code>{name}</Code>
                                        </Table.Td>
                                        <Table.Td w={130}>
                                            <Select
                                                size="xs"
                                                aria-label={`${name}: kind`}
                                                data={KINDS}
                                                value={kind}
                                                allowDeselect={false}
                                                onChange={(next) =>
                                                    setValue(STARTS[(next ?? "string") as Kind])
                                                }
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            {kind === "boolean" ? (
                                                <Switch
                                                    aria-label={name}
                                                    checked={value === true}
                                                    onChange={(event) =>
                                                        setValue(event.currentTarget.checked)
                                                    }
                                                />
                                            ) : kind === "number" ? (
                                                <NumberInput
                                                    size="xs"
                                                    aria-label={name}
                                                    value={value as number}
                                                    onChange={(next) =>
                                                        setValue(
                                                            typeof next === "number" ? next : 0,
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <TextInput
                                                    size="xs"
                                                    aria-label={name}
                                                    value={value as string}
                                                    onChange={(event) =>
                                                        setValue(event.currentTarget.value)
                                                    }
                                                />
                                            )}
                                        </Table.Td>
                                        <Table.Td w={36}>
                                            <Tooltip label="Delete">
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="red"
                                                    aria-label={`Delete ${name}`}
                                                    onClick={() =>
                                                        set(["variables", name], undefined)
                                                    }
                                                >
                                                    ✕
                                                </ActionIcon>
                                            </Tooltip>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                )}
                <AddName
                    label="Add a variable"
                    taken={taken}
                    onAdd={(name) => set(["variables", name], STARTS.boolean)}
                />
            </Panel>

            <Panel title="Timers">
                <Text size="xs" c="dimmed">
                    Clocks that keep running from screen to screen, e.g. a self-destruct countdown.
                </Text>
                {errors.get("timers") && (
                    <Text size="sm" c="red">
                        {errors.get("timers")}
                    </Text>
                )}
                {Object.entries(timers).map(([name, settings]) => (
                    <Stack key={name} gap="sm" className="editor-timer">
                        <Group justify="space-between">
                            <Code fz="md">{name}</Code>
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                onClick={() => set(["timers", name], undefined)}
                            >
                                Delete
                            </Button>
                        </Group>
                        {Object.entries(timer.properties ?? {}).map(([key, property]) => (
                            <SchemaField
                                key={key}
                                name={key}
                                schema={property}
                                defs={timer.$defs ?? {}}
                                value={settings[key]}
                                onChange={(value) => set(["timers", name, key], value)}
                            />
                        ))}
                    </Stack>
                ))}
                <AddName
                    label="Add a timer"
                    taken={taken}
                    onAdd={(name) => set(["timers", name], { from: 60 })}
                />
            </Panel>
        </SimpleGrid>
    );
}

/** A name to add, checked: a variable name, and not one already used. */
function AddName({
    label,
    taken,
    onAdd,
}: {
    label: string;
    taken: string[];
    onAdd: (name: string) => void;
}) {
    const [name, setName] = useState("");
    const problem =
        name === ""
            ? null
            : !NAME.test(name)
              ? "Starts with a letter or _, then letters, digits, _ and -"
              : taken.includes(name)
                ? `"${name}" is taken`
                : null;
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (name && !problem) {
                    onAdd(name);
                    setName("");
                }
            }}
        >
            <Group gap="xs" align="start">
                <TextInput
                    size="xs"
                    aria-label={label}
                    placeholder="name"
                    value={name}
                    error={problem}
                    onChange={(event) => setName(event.currentTarget.value.trim())}
                    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
                />
                <Button
                    type="submit"
                    size="xs"
                    variant="light"
                    disabled={!name || Boolean(problem)}
                >
                    {label}
                </Button>
            </Group>
        </form>
    );
}
