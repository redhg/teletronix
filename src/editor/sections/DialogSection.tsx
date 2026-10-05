import { Button, Code, Group, Menu, Stack, TextInput, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { DialogSchema } from "../../engine/schema/dialog.ts";
import { Panel } from "../../mantine/Panel.tsx";
import { jsonSchemaOf, SchemaField } from "../SchemaForm.tsx";

interface Props {
    id: string;
    dialog: Record<string, unknown>;
    onChange: (dialog: unknown) => void;
    /** Renames it; returns why not, if it can't be */
    onRename: (to: string) => string | null;
    onDuplicate: () => void;
    onDelete: () => void;
    onPreview: () => void;
    /** Its mistake, if any */
    error?: string;
}

/** A dialog: its kind (alert or confirm), and that kind's settings. */
export function DialogSection({
    id,
    dialog,
    onChange,
    onRename,
    onDuplicate,
    onDelete,
    onPreview,
    error,
}: Props) {
    const schema = useMemo(() => jsonSchemaOf(DialogSchema), []);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    return (
        <Stack gap="lg">
            <Group justify="space-between" align="start">
                {renaming === null ? (
                    <Group gap="xs" align="baseline">
                        <Title order={2}>Dialog</Title>
                        <Code fz="lg">{id}</Code>
                        <Button size="compact-xs" variant="subtle" onClick={() => setRenaming(id)}>
                            Rename
                        </Button>
                    </Group>
                ) : (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            const why = renaming === id ? null : onRename(renaming);
                            setProblem(why);
                            if (!why) setRenaming(null);
                        }}
                    >
                        <Group gap="xs" align="start">
                            <TextInput
                                aria-label="Dialog id"
                                value={renaming}
                                error={problem}
                                description="Actions that open it are renamed too"
                                onChange={(event) =>
                                    setRenaming(event.currentTarget.value.replace(/[^\w-]/g, "-"))
                                }
                                autoFocus
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
                        Open in the preview
                    </Button>
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <Button variant="default">More</Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item onClick={onDuplicate}>Duplicate the dialog</Menu.Item>
                            <Menu.Item
                                color="red"
                                onClick={() => {
                                    if (
                                        confirm(`Delete the dialog "${id}"? (Undo brings it back.)`)
                                    ) {
                                        onDelete();
                                    }
                                }}
                            >
                                Delete the dialog
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>
            <Panel title="Settings">
                <SchemaField
                    name="type"
                    schema={schema}
                    defs={schema.$defs ?? {}}
                    value={dialog}
                    error={error}
                    onChange={(value) => onChange(value ?? { type: "alert", content: "" })}
                />
            </Panel>
        </Stack>
    );
}
