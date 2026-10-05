import {
    ActionIcon,
    Button,
    Code,
    Group,
    NumberInput,
    Popover,
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
    /** Renames a variable or timer, and everything that names it */
    onRename: (from: string, to: string) => void;
}

/** The program's variables (each a name, a kind and its starting value) and its timers. */
export function VariablesSection({ config, set, errors, onRename }: Props) {
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
                                            <Rename
                                                name={name}
                                                taken={taken}
                                                onRename={(to) => onRename(name, to)}
                                            />
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
                            <Group gap={4}>
                                <Code fz="md">{name}</Code>
                                <Rename
                                    name={name}
                                    taken={taken}
                                    onRename={(to) => onRename(name, to)}
                                />
                            </Group>
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

/** What's wrong with a name for a variable or timer, if anything. */
function nameProblem(name: string, taken: string[]): string | null {
    if (name === "") return null;
    if (!NAME.test(name)) return "Starts with a letter or _, then letters, digits, _ and -";
    if (["all", "any", "not"].includes(name)) return `"${name}" means something in conditions`;
    return taken.includes(name) ? `"${name}" is taken` : null;
}

/** A button that renames a variable or timer, from a little form under it. */
function Rename({
    name,
    taken,
    onRename,
}: {
    name: string;
    taken: string[];
    onRename: (to: string) => void;
}) {
    const [opened, setOpened] = useState(false);
    const [to, setTo] = useState(name);
    const problem = to === name ? null : nameProblem(to, taken);
    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            onOpen={() => setTo(name)}
            position="bottom-start"
            trapFocus
            withArrow
        >
            <Popover.Target>
                <Tooltip label="Rename" disabled={opened}>
                    <ActionIcon
                        variant="subtle"
                        aria-label={`Rename ${name}`}
                        onClick={() => {
                            setTo(name);
                            setOpened((open) => !open);
                        }}
                    >
                        ✎
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (to === name || problem || !to) return;
                        onRename(to);
                        setOpened(false);
                    }}
                >
                    <Stack gap="xs" w={240}>
                        <TextInput
                            size="xs"
                            label={`Rename ${name}`}
                            description="Text, conditions, actions and elements that use it follow"
                            value={to}
                            error={problem}
                            data-autofocus
                            onChange={(event) => setTo(event.currentTarget.value.trim())}
                            styles={{
                                input: { fontFamily: "var(--mantine-font-family-monospace)" },
                            }}
                        />
                        <Button
                            type="submit"
                            size="xs"
                            disabled={to === name || !to || Boolean(problem)}
                        >
                            Rename
                        </Button>
                    </Stack>
                </form>
            </Popover.Dropdown>
        </Popover>
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
    const problem = nameProblem(name, taken);
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
