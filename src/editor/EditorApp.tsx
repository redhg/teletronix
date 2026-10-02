import {
    ActionIcon,
    AppShell,
    Badge,
    Button,
    FileButton,
    Group,
    Kbd,
    Menu,
    NavLink,
    Popover,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ParseError, parseProgram } from "../engine/index.ts";
import { ColorScheme } from "../mantine/ColorScheme.tsx";
import {
    type AppearanceSettings,
    isPreviewMessage,
    type PreviewMessage,
} from "../ui/preview-protocol.ts";
import { formatJson } from "./format.ts";
import { useHistory } from "./history.ts";
import { type Path, parsePath, setIn } from "./paths.ts";
import { APPEARANCE_KEYS, AppearanceSection, appearanceOf } from "./sections/AppearanceSection.tsx";
import { ProgramSection } from "./sections/ProgramSection.tsx";
import "./editor.css";

/** A program file as written. */
export type ProgramFile = Record<string, unknown> & { config?: Record<string, unknown> };

/** A program to start from, for "New". */
export const NEW_PROGRAM: ProgramFile = {
    config: { name: "New program", start: "home" },
    screens: { home: { content: ["HELLO, WORLD."] } },
};

type Section = "program" | "appearance";
const SECTIONS: { id: Section; label: string; description: string }[] = [
    { id: "program", label: "Program", description: "Name, start screen, bars, variables…" },
    { id: "appearance", label: "Appearance", description: "Colours, font, effects, sound" },
];

/** Which section a mistake belongs in, by its path. */
function sectionOf(path: Path): Section | null {
    if (path[0] !== "config") return null;
    return APPEARANCE_KEYS.includes(String(path[1])) ? "appearance" : "program";
}

/** How long after an edit the preview restarts with it (appearance changes show at once). */
const PREVIEW_DELAY_MS = 400;

interface Props {
    /** The program's name: its file is public/data/<name>.json */
    name: string;
    file: ProgramFile;
    /** Whether Save can write into public/data here (the dev server); otherwise it downloads */
    canSave: boolean;
    /** Shown once, e.g. that there was no such program, so this is a new one */
    notice?: string;
}

/**
 * The program editor: the program's parts on the left, a form for the one chosen in the
 * middle, and a live preview on the right. It edits the file as written, and checks it as
 * it goes.
 */
export function EditorApp({ name: initialName, file: initialFile, canSave, notice }: Props) {
    const history = useHistory<ProgramFile>(initialFile);
    const file = history.value;
    const [name, setName] = useState(initialName);
    // the version last saved, downloaded or opened, to know whether there are unsaved
    // changes (a new program has none)
    const [saved, setSaved] = useState<ProgramFile | null>(notice ? null : initialFile);
    const dirty = file !== saved;
    const [section, setSection] = useState<Section>("program");
    const [showPreview, setShowPreview] = useState(true);
    const [status, setStatus] = useState<string | null>(notice ?? null);

    const config = (file.config ?? {}) as Record<string, unknown>;
    const result = useMemo(() => parseProgram(file), [file]);
    const errors: ParseError[] = result.ok ? [] : result.errors;
    const configErrors = useMemo(() => {
        const map = new Map<string, string>();
        for (const error of errors) {
            const path = parsePath(error.path);
            if (path[0] === "config" && path[1] !== undefined && !map.has(String(path[1]))) {
                map.set(String(path[1]), error.message);
            }
        }
        return map;
    }, [errors]);
    const screens = Object.keys((file.screens as Record<string, unknown> | undefined) ?? {});

    const edit = useCallback(
        (path: Path, value: unknown) =>
            history.set(setIn(file, path, value) as ProgramFile, path.join(".")),
        [history, file],
    );
    const setConfig = useCallback(
        (path: Path, value: unknown) => edit(["config", ...path], value),
        [edit],
    );

    // ─── Saving ──────────────────────────────────────────────────────────────

    const download = () => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([formatJson(file)], { type: "application/json" }));
        link.download = `${name}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    const save = async () => {
        if (!canSave) {
            download();
            setSaved(file);
            setStatus(`Downloaded ${name}.json`);
            return;
        }
        const response = await fetch(new URL(`__teletronix/save/${name}.json`, location.href), {
            method: "PUT",
            body: formatJson(file),
        }).catch(() => null);
        if (response?.ok) {
            setSaved(file);
            setStatus(`Saved public/data/${name}.json`);
        } else {
            setStatus(
                `Couldn't save (${response?.status ?? "no connection"}): downloading instead`,
            );
            download();
        }
    };
    const open = async (picked: File | null) => {
        if (!picked) return;
        try {
            const opened = JSON.parse(await picked.text()) as ProgramFile;
            history.reset(opened);
            setName(picked.name.replace(/\.json$/i, "").replace(/[^\w-]/g, "-") || "program");
            setSaved(opened);
            setStatus(`Opened ${picked.name}`);
        } catch {
            setStatus(`${picked.name} isn't a JSON file`);
        }
    };
    const startNew = () => {
        if (dirty && !confirm("Start a new program? Unsaved changes will be lost.")) return;
        history.reset(NEW_PROGRAM);
        setName("new-program");
        setSaved(null);
        setStatus(null);
    };

    useHotkeys(
        [
            ["mod+S", () => void save()],
            ["mod+Z", history.undo],
            ["mod+shift+Z", history.redo],
        ],
        // (in text fields too, for saving; undo there is the field's own)
        [],
    );
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    useEffect(() => {
        document.title = `${dirty ? "● " : ""}${name}.json: Teletronix editor`;
    }, [dirty, name]);

    // ─── The preview ─────────────────────────────────────────────────────────

    const preview = useRef<HTMLIFrameElement>(null);
    const fileRef = useRef(file);
    fileRef.current = file;
    const post = useCallback((message: PreviewMessage) => {
        preview.current?.contentWindow?.postMessage(message, location.origin);
    }, []);
    const settings: AppearanceSettings = useMemo(() => {
        const appearance = appearanceOf(config);
        return { ...appearance, effects: appearance.effects, sound: appearance.sound };
    }, [config]);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    // the preview asks for the program when it's ready (and after reloading)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== preview.current?.contentWindow || !isPreviewMessage(event)) return;
            if (event.data.type === "teletronix:ready") {
                post({ type: "teletronix:program", file: fileRef.current });
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [post]);

    // appearance shows at once; anything else restarts the preview with it, after a moment
    useEffect(() => {
        post({ type: "teletronix:appearance", settings });
    }, [settings, post]);
    const rest = useMemo(() => {
        const { config: written, ...others } = file;
        const kept = Object.fromEntries(
            Object.entries(written ?? {}).filter(([key]) => !APPEARANCE_KEYS.includes(key)),
        );
        return JSON.stringify([kept, others]);
    }, [file]);
    const firstRest = useRef(rest);
    useEffect(() => {
        if (rest === firstRest.current) return;
        firstRest.current = rest;
        const timer = setTimeout(
            () => post({ type: "teletronix:program", file: fileRef.current }),
            PREVIEW_DELAY_MS,
        );
        return () => clearTimeout(timer);
    }, [rest, post]);

    // ─── Layout ──────────────────────────────────────────────────────────────

    return (
        <AppShell
            header={{ height: 56 }}
            navbar={{ width: 220, breakpoint: "sm" }}
            aside={{
                width: { base: 360, lg: 520 },
                breakpoint: "md",
                collapsed: { desktop: !showPreview, mobile: true },
            }}
            padding="lg"
        >
            <AppShell.Header px="md">
                <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap="sm" wrap="nowrap">
                        <Title order={4} style={{ whiteSpace: "nowrap" }}>
                            Teletronix editor
                        </Title>
                        <TextInput
                            size="xs"
                            aria-label="File name"
                            value={name}
                            onChange={(event) =>
                                setName(event.currentTarget.value.replace(/[^\w-]/g, "-"))
                            }
                            rightSection={
                                <Text size="xs" c="dimmed">
                                    .json
                                </Text>
                            }
                            rightSectionWidth={42}
                            w={180}
                            styles={{
                                input: { fontFamily: "var(--mantine-font-family-monospace)" },
                            }}
                        />
                        {dirty && (
                            <Badge variant="light" color="yellow" className="editor-unsaved">
                                Unsaved
                            </Badge>
                        )}
                        {status && (
                            <Text size="xs" c="dimmed" className="editor-status" role="status">
                                {status}
                            </Text>
                        )}
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                        <Problems
                            errors={errors}
                            go={(path) => {
                                const target = sectionOf(path);
                                if (target) setSection(target);
                            }}
                        />
                        <Tooltip label="Undo (Cmd/Ctrl+Z)">
                            <ActionIcon
                                variant="default"
                                aria-label="Undo"
                                disabled={!history.canUndo}
                                onClick={history.undo}
                                className="editor-history"
                            >
                                ↶
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Redo (Cmd/Ctrl+Shift+Z)">
                            <ActionIcon
                                variant="default"
                                aria-label="Redo"
                                disabled={!history.canRedo}
                                onClick={history.redo}
                                className="editor-history"
                            >
                                ↷
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            label={
                                canSave
                                    ? `Save to public/data/${name}.json`
                                    : `Download ${name}.json (saving into public/data works in npm run dev)`
                            }
                        >
                            <Button
                                size="xs"
                                onClick={() => void save()}
                                rightSection={<Kbd size="xs">⌘S</Kbd>}
                            >
                                {canSave ? "Save" : "Download"}
                            </Button>
                        </Tooltip>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Button size="xs" variant="default">
                                    File
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item onClick={startNew}>New program</Menu.Item>
                                <FileButton
                                    onChange={(picked) => void open(picked)}
                                    accept="application/json,.json"
                                >
                                    {(props) => <Menu.Item {...props}>Open a file…</Menu.Item>}
                                </FileButton>
                                <Menu.Item onClick={download}>Download {name}.json</Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                    component="a"
                                    href={`?data=${encodeURIComponent(name)}`}
                                    target="_blank"
                                    disabled={dirty || !canSave}
                                >
                                    Play the saved version
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Button
                            size="xs"
                            variant={showPreview ? "light" : "default"}
                            onClick={() => setShowPreview((was) => !was)}
                            aria-pressed={showPreview}
                        >
                            Preview
                        </Button>
                        <ColorScheme />
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="xs" aria-label="Parts of the program">
                {SECTIONS.map((item) => {
                    const count = errors.filter(
                        (error) => sectionOf(parsePath(error.path)) === item.id,
                    ).length;
                    return (
                        <NavLink
                            key={item.id}
                            component="button"
                            label={item.label}
                            description={item.description}
                            active={section === item.id}
                            aria-current={section === item.id ? "page" : undefined}
                            onClick={() => setSection(item.id)}
                            rightSection={
                                count > 0 && (
                                    <Badge size="xs" color="red" circle>
                                        {count}
                                    </Badge>
                                )
                            }
                        />
                    );
                })}
                <Text size="xs" c="dimmed" p="sm" mt="auto">
                    Screens, dialogs and sounds come next.
                </Text>
            </AppShell.Navbar>

            <AppShell.Main>
                <Stack gap="lg">
                    <Title order={2}>{SECTIONS.find((item) => item.id === section)?.label}</Title>
                    {section === "program" && (
                        <ProgramSection
                            config={config}
                            screens={screens}
                            set={setConfig}
                            errors={configErrors}
                        />
                    )}
                    {section === "appearance" && (
                        <AppearanceSection config={config} set={setConfig} />
                    )}
                </Stack>
            </AppShell.Main>

            <AppShell.Aside>
                <iframe ref={preview} className="editor-preview" title="Preview" src="?preview" />
            </AppShell.Aside>
        </AppShell>
    );
}

/** A count of the program's mistakes, which lists them, each going to where it is. */
function Problems({ errors, go }: { errors: ParseError[]; go: (path: Path) => void }) {
    if (errors.length === 0) {
        return (
            <Badge variant="light" color="green">
                No problems
            </Badge>
        );
    }
    return (
        <Popover position="bottom-end" width={420} shadow="md">
            <Popover.Target>
                <Button size="xs" color="red" variant="light">
                    {errors.length === 1 ? "1 problem" : `${errors.length} problems`}
                </Button>
            </Popover.Target>
            <Popover.Dropdown p={0}>
                <ScrollArea.Autosize mah={360}>
                    <Stack gap={0}>
                        {errors.map((error) => (
                            <UnstyledButton
                                key={`${error.path}:${error.message}`}
                                className="editor-problem"
                                onClick={() => go(parsePath(error.path))}
                            >
                                <Text size="xs" ff="monospace" c="dimmed">
                                    {error.path || "(the file)"}
                                </Text>
                                <Text size="sm">{error.message}</Text>
                            </UnstyledButton>
                        ))}
                    </Stack>
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
}
