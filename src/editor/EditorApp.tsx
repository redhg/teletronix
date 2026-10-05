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
import { type ParseError, parseProgram, type SoundSetting } from "../engine/index.ts";
import { ColorScheme } from "../mantine/ColorScheme.tsx";
import { MenuCaret } from "../mantine/MenuCaret.tsx";
import { type CommandGroup, Palette, PaletteButton } from "../mantine/Palette.tsx";
import { ScreenTree } from "../mantine/ScreenTree.tsx";
import {
    type AppearanceSettings,
    isPreviewMessage,
    type PreviewMessage,
} from "../ui/preview-protocol.ts";
import { formatJson } from "./format.ts";
import { type ProgramNames, ProgramNamesContext } from "./forms/names.ts";
import { useHistory } from "./history.ts";
import { type Path, parsePath, setIn } from "./paths.ts";
import {
    dialogsOf,
    ELEMENT_TYPES,
    type ElementFile,
    freeId,
    insertScreen,
    newElement,
    renameDialog,
    renameScreen,
    renameSound,
    renameVariable,
    type ScreenFile,
    screensOf,
} from "./screens.ts";
import { APPEARANCE_KEYS, AppearanceSection, appearanceOf } from "./sections/AppearanceSection.tsx";
import { DialogSection } from "./sections/DialogSection.tsx";
import { ProgramSection } from "./sections/ProgramSection.tsx";
import { type ScreenErrors, ScreenSection } from "./sections/ScreenSection.tsx";
import { SoundsSection } from "./sections/SoundsSection.tsx";
import { VariablesSection } from "./sections/VariablesSection.tsx";
import "./editor.css";

/** A program file as written. */
export type ProgramFile = Record<string, unknown> & { config?: Record<string, unknown> };

/** A program to start from, for "New". */
export const NEW_PROGRAM: ProgramFile = {
    config: { name: "New program", start: "home" },
    screens: { home: { content: ["HELLO, WORLD."] } },
};

/** What's being edited: the program's settings, its appearance, or a screen (`screen:<id>`). */
type Section = string;
const SECTIONS: { id: Section; label: string; description: string }[] = [
    { id: "program", label: "Program", description: "Name, start screen, bars, variables…" },
    { id: "appearance", label: "Appearance", description: "Colours, font, effects, sound" },
    { id: "variables", label: "Variables & timers", description: "What it remembers, and clocks" },
    { id: "sounds", label: "Sounds", description: "Sound effects of its own" },
];
const screenSection = (id: string): Section => `screen:${id}`;

/** Which section a mistake belongs in, by its path. */
function sectionOf(path: Path): Section | null {
    if (path[0] === "screens" && path[1] !== undefined) return screenSection(String(path[1]));
    if (path[0] === "dialogs" && path[1] !== undefined) return `dialog:${String(path[1])}`;
    if (path[0] === "sounds") return "sounds";
    if (path[0] !== "config") return null;
    if (path[1] === "variables" || path[1] === "timers") return "variables";
    return APPEARANCE_KEYS.includes(String(path[1])) ? "appearance" : "program";
}

/** A screen's mistakes, sorted into its settings' and each element's. */
function screenErrors(errors: ParseError[], id: string): ScreenErrors {
    const settings = new Map<string, string>();
    const elements = new Map<number, Map<string, string>>();
    for (const error of errors) {
        const path = parsePath(error.path);
        if (path[0] !== "screens" || path[1] !== id) continue;
        if (path[2] === "content" && typeof path[3] === "number") {
            const element = elements.get(path[3]) ?? new Map<string, string>();
            const key = path[4] === undefined ? "" : String(path[4]);
            if (!element.has(key)) element.set(key, error.message);
            elements.set(path[3], element);
        } else {
            const key = String(path[2] ?? "");
            if (!settings.has(key)) settings.set(key, error.message);
        }
    }
    return { settings, elements };
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
    // the screen being edited, and its open element
    const screenId = section.startsWith("screen:") ? section.slice("screen:".length) : null;
    const [openElement, setOpenElement] = useState<number | null>(null);
    // an element copied, to paste into a screen
    const [copied, setCopied] = useState<ElementFile | null>(null);
    const select = (next: Section, element: number | null = null) => {
        setSection(next);
        setOpenElement(element);
    };
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
    const screenFiles = screensOf(file);
    const screenProblems = errors.filter((error) => error.path.startsWith("screens.")).length;
    const screens = Object.keys(screenFiles);
    const treeScreens = useMemo(
        () =>
            Object.entries(screensOf(file)).map(([id, screen]) => ({
                id,
                ...(typeof screen.title === "string" ? { title: screen.title } : {}),
                ...(typeof screen.parent === "string" ? { parent: screen.parent } : {}),
            })),
        [file],
    );

    // what the forms offer to choose from
    const names: ProgramNames = useMemo(
        () => ({
            screens: treeScreens,
            dialogs: Object.keys(dialogsOf(file)),
            sounds: Object.keys((file.sounds ?? {}) as object),
        }),
        [treeScreens, file],
    );

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
    // the screen the preview is showing (for restarting it there)
    const previewScreen = useRef<string | null>(null);
    // the screen being edited, which the preview shows
    const screenRef = useRef(screenId);
    screenRef.current = screenId;
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
            if (event.data.type === "teletronix:screen") {
                previewScreen.current = event.data.screen;
                return;
            }
            if (event.data.type === "teletronix:ready") {
                post({
                    type: "teletronix:program",
                    file: fileRef.current,
                    ...(screenRef.current ? { screen: screenRef.current } : {}),
                });
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
            () =>
                post({
                    type: "teletronix:program",
                    file: fileRef.current,
                    ...(screenRef.current ? { screen: screenRef.current } : {}),
                }),
            PREVIEW_DELAY_MS,
        );
        return () => clearTimeout(timer);
    }, [rest, post]);

    // choosing a screen shows it in the preview
    useEffect(() => {
        if (screenId) post({ type: "teletronix:go", screen: screenId });
    }, [screenId, post]);

    // ─── Screens ─────────────────────────────────────────────────────────────

    const setScreen = (id: string, screen: ScreenFile) =>
        history.set(setIn(file, ["screens", id], screen) as ProgramFile, `screens.${id}`);
    const addScreen = () => {
        const id = freeId(screens, "new-screen");
        history.set(
            insertScreen(
                file,
                id,
                { ...(screenId ? { parent: screenId } : {}), content: ["NEW SCREEN"] },
                screenId ?? undefined,
            ),
        );
        select(screenSection(id));
    };
    const renameTo = (from: string, to: string): string | null => {
        if (!/^[\w-]+$/.test(to)) return "Letters, digits, _ and - only";
        if (screens.includes(to)) return `There's already a screen "${to}"`;
        history.set(renameScreen(file, from, to));
        renames.current.set(to, from).set(from, to);
        select(screenSection(to), openElement);
        return null;
    };
    // ─── Dialogs ─────────────────────────────────────────────────────────────

    const dialogFiles = dialogsOf(file);
    const dialogs = Object.keys(dialogFiles);
    const dialogId = section.startsWith("dialog:") ? section.slice("dialog:".length) : null;
    const addDialog = () => {
        const id = freeId(dialogs, "new-dialog");
        history.set(
            setIn(file, ["dialogs", id], {
                type: "alert",
                content: "A NEW DIALOG.",
            }) as ProgramFile,
        );
        select(`dialog:${id}`);
    };
    const renameDialogTo = (from: string, to: string): string | null => {
        if (!/^[\w-]+$/.test(to)) return "Letters, digits, _ and - only";
        if (dialogs.includes(to)) return `There's already a dialog "${to}"`;
        history.set(renameDialog(file, from, to));
        renames.current.set(`dialog:${to}`, `dialog:${from}`).set(`dialog:${from}`, `dialog:${to}`);
        select(`dialog:${to}`);
        return null;
    };

    // undoing (or redoing) a rename takes the editor along to the screen's other name
    const renames = useRef(new Map<string, string>());
    useEffect(() => {
        if (dialogId && !dialogFiles[dialogId]) {
            const other = renames.current.get(`dialog:${dialogId}`);
            if (other && dialogFiles[other.slice("dialog:".length)]) setSection(other);
            return;
        }
        if (!screenId || screenFiles[screenId]) return;
        const other = renames.current.get(screenId);
        if (other && screenFiles[other]) setSection(screenSection(other));
    }, [screenId, screenFiles, dialogId, dialogFiles]);
    const duplicateScreen = (id: string) => {
        const copy = freeId(screens, `${id}-copy`);
        history.set(insertScreen(file, copy, structuredClone(screenFiles[id] ?? {}), id));
        select(screenSection(copy));
    };
    const deleteScreen = (id: string) => {
        history.set(setIn(file, ["screens", id], undefined) as ProgramFile);
        select("program");
    };

    // ─── Commands (Cmd/Ctrl+K) ───────────────────────────────────────────────

    const goToProblem = (path: Path) => {
        const target = sectionOf(path);
        const element = path[2] === "content" && typeof path[3] === "number" ? path[3] : null;
        if (target) select(target, element);
    };
    const restartPreview = () =>
        post({
            type: "teletronix:program",
            file: fileRef.current,
            ...(previewScreen.current ? { screen: previewScreen.current } : {}),
        });
    const screenFile = screenId ? screenFiles[screenId] : undefined;
    const addToScreen = (element: ElementFile) => {
        if (!screenId || !screenFile) return;
        const content = (screenFile.content ?? []) as ElementFile[];
        setScreen(screenId, { ...screenFile, content: [...content, element] });
        setOpenElement(content.length);
    };
    const commands: CommandGroup[] = [
        {
            group: "Go to",
            commands: [
                ...SECTIONS.map((item) => ({
                    id: item.id,
                    label: item.label,
                    description: item.description,
                    run: () => select(item.id),
                })),
                ...treeScreens.map((screen) => ({
                    id: screenSection(screen.id),
                    label: screen.title ?? screen.id,
                    description: `Screen ${screen.id}`,
                    keywords: ["screen", screen.id],
                    run: () => select(screenSection(screen.id)),
                })),
                ...dialogs.map((id) => ({
                    id: `dialog:${id}`,
                    label: id,
                    description: "Dialog",
                    keywords: ["dialog"],
                    run: () => select(`dialog:${id}`),
                })),
            ],
        },
        {
            group: "Problems",
            commands: errors.map((error, index) => ({
                id: String(index),
                label: error.message,
                description: error.path || "(the file)",
                keywords: ["problem", "error", "mistake"],
                run: () => goToProblem(parsePath(error.path)),
            })),
        },
        {
            group: "Commands",
            commands: [
                {
                    id: "save",
                    label: canSave ? `Save ${name}.json` : `Download ${name}.json`,
                    keywords: ["save", "download", "write"],
                    run: () => void save(),
                },
                ...(history.canUndo ? [{ id: "undo", label: "Undo", run: history.undo }] : []),
                ...(history.canRedo ? [{ id: "redo", label: "Redo", run: history.redo }] : []),
                {
                    id: "add-screen",
                    label: "Add a screen",
                    description: screenId ? `Under ${screenId}` : undefined,
                    keywords: ["new"],
                    run: addScreen,
                },
                { id: "add-dialog", label: "Add a dialog", keywords: ["new"], run: addDialog },
                ...(screenId && screenFile
                    ? [
                          {
                              id: "show-screen",
                              label: "Show this screen in the preview",
                              run: () => post({ type: "teletronix:go", screen: screenId }),
                          },
                          {
                              id: "duplicate-screen",
                              label: "Duplicate this screen",
                              keywords: ["copy"],
                              run: () => duplicateScreen(screenId),
                          },
                          ...(copied !== null
                              ? [
                                    {
                                        id: "paste",
                                        label: "Paste into this screen",
                                        run: () => addToScreen(structuredClone(copied)),
                                    },
                                ]
                              : []),
                      ]
                    : []),
                {
                    id: "preview",
                    label: showPreview ? "Hide the preview" : "Show the preview",
                    run: () => setShowPreview((was) => !was),
                },
                { id: "restart", label: "Restart the preview", run: restartPreview },
                { id: "new", label: "New program", run: startNew },
            ],
        },
        {
            group: "Add to this screen",
            commands:
                screenId && screenFile
                    ? ELEMENT_TYPES.map((entry) => ({
                          id: entry.type,
                          label: `Add ${entry.type}`,
                          description: entry.description.split(/[.:(]/)[0],
                          keywords: ["element", "new"],
                          run: () => addToScreen(newElement(entry.type)),
                      }))
                    : [],
        },
    ];

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
            <Palette groups={commands} placeholder="Go to a screen, add an element, save…" />
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
                        <PaletteButton />
                        <Problems errors={errors} go={goToProblem} />
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
                                <Button size="xs" variant="default" rightSection={<MenuCaret />}>
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
                        <Tooltip label="Restart the preview: the screen shown, from the start">
                            <ActionIcon
                                variant="default"
                                aria-label="Restart the preview"
                                disabled={!showPreview}
                                className="editor-history"
                                onClick={restartPreview}
                            >
                                ⟲
                            </ActionIcon>
                        </Tooltip>
                        <ColorScheme />
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="xs" aria-label="Parts of the program">
                <AppShell.Section grow component={ScrollArea} type="auto">
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
                                onClick={() => select(item.id)}
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
                    <Group justify="space-between" px="xs" pt="md" pb={6} wrap="nowrap">
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                            Screens
                            {screenProblems > 0 && (
                                <Text span c="red">
                                    {" "}
                                    · {screenProblems} problem{screenProblems > 1 && "s"}
                                </Text>
                            )}
                        </Text>
                        <Tooltip label="Add a screen (under the one chosen)">
                            <ActionIcon
                                size="sm"
                                variant="light"
                                aria-label="Add a screen"
                                onClick={addScreen}
                            >
                                +
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <ScreenTree
                        screens={treeScreens}
                        current={screenId}
                        onSelect={(id) => select(screenSection(id))}
                        compact
                    />
                    <Group justify="space-between" px="xs" pt="md" pb={6} wrap="nowrap">
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                            Dialogs
                        </Text>
                        <Tooltip label="Add a dialog">
                            <ActionIcon
                                size="sm"
                                variant="light"
                                aria-label="Add a dialog"
                                onClick={addDialog}
                            >
                                +
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <nav aria-label="Dialogs">
                        {dialogs.map((id) => {
                            const problems = errors.filter((error) =>
                                error.path.startsWith(`dialogs.${id}`),
                            ).length;
                            return (
                                <NavLink
                                    key={id}
                                    component="button"
                                    label={id}
                                    active={dialogId === id}
                                    aria-current={dialogId === id ? "page" : undefined}
                                    onClick={() => select(`dialog:${id}`)}
                                    py={2}
                                    rightSection={
                                        problems > 0 && (
                                            <Badge size="xs" color="red" circle>
                                                {problems}
                                            </Badge>
                                        )
                                    }
                                />
                            );
                        })}
                        {dialogs.length === 0 && (
                            <Text size="xs" c="dimmed" px="xs">
                                None yet.
                            </Text>
                        )}
                    </nav>
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main>
                <ProgramNamesContext value={names}>
                    <Stack gap="lg">
                        {dialogId && dialogFiles[dialogId] && (
                            <DialogSection
                                key={dialogId}
                                id={dialogId}
                                dialog={dialogFiles[dialogId]}
                                onChange={(dialog) =>
                                    history.set(
                                        setIn(file, ["dialogs", dialogId], dialog) as ProgramFile,
                                        `dialogs.${dialogId}`,
                                    )
                                }
                                onRename={(to) => renameDialogTo(dialogId, to)}
                                onDuplicate={() => {
                                    const copy = freeId(dialogs, `${dialogId}-copy`);
                                    history.set(
                                        setIn(
                                            file,
                                            ["dialogs", copy],
                                            structuredClone(dialogFiles[dialogId]),
                                        ) as ProgramFile,
                                    );
                                    select(`dialog:${copy}`);
                                }}
                                onDelete={() => {
                                    history.set(
                                        setIn(
                                            file,
                                            ["dialogs", dialogId],
                                            undefined,
                                        ) as ProgramFile,
                                    );
                                    select("program");
                                }}
                                onPreview={() =>
                                    post({ type: "teletronix:dialog", dialog: dialogId })
                                }
                                error={
                                    errors.find((error) =>
                                        error.path.startsWith(`dialogs.${dialogId}`),
                                    )?.message
                                }
                            />
                        )}
                        {!screenId && !dialogId && (
                            <Title order={2}>
                                {SECTIONS.find((item) => item.id === section)?.label}
                            </Title>
                        )}
                        {screenId && screenFiles[screenId] && (
                            <ScreenSection
                                key={screenId}
                                id={screenId}
                                screen={screenFiles[screenId]}
                                screens={screens}
                                onChange={(screen) => setScreen(screenId, screen)}
                                onRename={(to) => renameTo(screenId, to)}
                                onDuplicate={() => duplicateScreen(screenId)}
                                onDelete={() => deleteScreen(screenId)}
                                onPreview={() => post({ type: "teletronix:go", screen: screenId })}
                                errors={screenErrors(errors, screenId)}
                                open={openElement}
                                onOpen={setOpenElement}
                                copied={copied}
                                onCopy={(element) => {
                                    setCopied(element);
                                    setStatus("Copied: paste it into any screen");
                                }}
                            />
                        )}
                        {screenId && !screenFiles[screenId] && (
                            <Text c="dimmed">There's no screen "{screenId}" any more.</Text>
                        )}
                        {section === "program" && (
                            <ProgramSection
                                config={config}
                                screens={screens}
                                set={setConfig}
                                errors={configErrors}
                            />
                        )}
                        {section === "sounds" && (
                            <SoundsSection
                                setting={config.sound as SoundSetting | undefined}
                                onSetting={(setting) => setConfig(["sound"], setting)}
                                sounds={(file.sounds ?? {}) as Record<string, unknown>}
                                onChange={(name, recipe) =>
                                    history.set(
                                        setIn(file, ["sounds", name], recipe) as ProgramFile,
                                        `sounds.${name}`,
                                    )
                                }
                                onRename={(from, to) => {
                                    if (!/^[\w-]+$/.test(to))
                                        return "Letters, digits, _ and - only";
                                    if (to in ((file.sounds ?? {}) as object))
                                        return `There's already a sound "${to}"`;
                                    history.set(renameSound(file, from, to));
                                    return null;
                                }}
                            />
                        )}
                        {section === "variables" && (
                            <VariablesSection
                                config={config}
                                set={setConfig}
                                errors={configErrors}
                                onRename={(from, to) => history.set(renameVariable(file, from, to))}
                            />
                        )}
                        {section === "appearance" && (
                            <AppearanceSection config={config} set={setConfig} />
                        )}
                    </Stack>
                </ProgramNamesContext>
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
