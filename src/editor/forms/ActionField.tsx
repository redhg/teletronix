import {
    Autocomplete,
    Button,
    Checkbox,
    Fieldset,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from "@mantine/core";
import { useState } from "react";
import { JsonField } from "../SchemaForm.tsx";
import {
    ACTION_KINDS,
    type ActionKind,
    fitsForm,
    kindOf,
    withKind,
    withSetting,
} from "./actions.ts";
import { useDataFiles } from "./files.ts";
import { useProgramNames } from "./names.ts";

interface Props {
    label: string;
    description?: string;
    value: unknown;
    /** Sets the action; undefined leaves it out (for an optional one) */
    onChange: (value: unknown) => void;
    error?: string | undefined;
    /** Whether it can be left out, e.g. a secondary action */
    optional?: boolean;
}

const NONE = "";

/** The extras an action can have, each shown once it's set or asked for. */
const EXTRAS = [
    { key: "sound", label: "Sound" },
    { key: "set", label: "Change variables" },
    { key: "frame", label: "In a frame" },
] as const;

/**
 * An action, as a form: what it does (a screen to go to, a dialog to open, back, restart),
 * picked from the program's own, and a sound and variables to set on the way. An action the
 * form can't show whole (cases, a screen at random, timers) is edited as JSON.
 */
export function ActionField({ label, description, value, onChange, error, optional }: Props) {
    const names = useProgramNames();
    const screens = names.screens.map((screen) => screen.id);
    // extras asked for, not set yet
    const [asked, setAsked] = useState<string[]>([]);
    if (!fitsForm(value)) {
        return (
            <JsonField
                label={label}
                aria-label={label}
                description="This action does more than the form shows (conditions, a choice at random, or timers), so it's JSON"
                value={value}
                error={error}
                onChange={onChange}
            />
        );
    }
    const kind = kindOf(value);
    const kinds = ACTION_KINDS.map((option) => ({
        ...option,
        disabled:
            (option.value === "screen" && screens.length === 0) ||
            (option.value === "dialog" && names.dialogs.length === 0),
    }));
    const set = (key: string, setting: unknown) => onChange(withSetting(value, key, setting));
    /** Whether an extra applies to what it does: a frame for a screen, no variables to restart */
    const applies = (key: string) =>
        (key !== "frame" || kind === "screen") &&
        (key !== "set" || kind !== "restart") &&
        (key !== "sound" || names.sounds.length > 0 || value?.sound !== undefined);
    const shows = (key: string) =>
        applies(key) && (value?.[key] !== undefined || asked.includes(key));
    const addable = EXTRAS.filter((extra) => applies(extra.key) && !shows(extra.key));

    return (
        <Fieldset legend={label} variant="filled" p="sm" className="editor-action">
            <Stack gap="xs">
                {description && (
                    <Text size="xs" c="dimmed">
                        {description}
                    </Text>
                )}
                <Group gap="xs" align="start" grow preventGrowOverflow={false}>
                    <Select
                        size="xs"
                        aria-label={`${label}: does`}
                        placeholder="Choose what it does…"
                        data={optional ? [{ value: NONE, label: "Nothing" }, ...kinds] : kinds}
                        value={kind ?? (optional ? NONE : null)}
                        allowDeselect={false}
                        error={kind === null && !optional ? error : undefined}
                        onChange={(next) =>
                            onChange(
                                next === NONE || next === null
                                    ? undefined
                                    : withKind(value, next as ActionKind, {
                                          screens,
                                          dialogs: names.dialogs,
                                      }),
                            )
                        }
                    />
                    {kind === "screen" && (
                        <Select
                            size="xs"
                            aria-label={`${label}: screen`}
                            searchable
                            data={names.screens.map((screen) => ({
                                value: screen.id,
                                label: screen.title ? `${screen.id} · ${screen.title}` : screen.id,
                            }))}
                            value={typeof value?.screen === "string" ? value.screen : null}
                            allowDeselect={false}
                            onChange={(screen) => set("screen", screen ?? undefined)}
                            styles={{
                                input: { fontFamily: "var(--mantine-font-family-monospace)" },
                            }}
                        />
                    )}
                    {kind === "dialog" && (
                        <Select
                            size="xs"
                            aria-label={`${label}: dialog`}
                            searchable
                            data={names.dialogs}
                            value={typeof value?.dialog === "string" ? value.dialog : null}
                            allowDeselect={false}
                            onChange={(dialog) => set("dialog", dialog ?? undefined)}
                            styles={{
                                input: { fontFamily: "var(--mantine-font-family-monospace)" },
                            }}
                        />
                    )}
                </Group>
                {kind === "view" && (
                    <ViewFields
                        label={label}
                        view={value?.view}
                        onChange={(view) => set("view", view)}
                    />
                )}
                {kind !== null && (
                    <>
                        {shows("frame") && (
                            <TextInput
                                size="xs"
                                label="In a frame"
                                aria-label={`${label}: frame`}
                                description="Show the screen in this frame on the current screen, instead of going to it"
                                placeholder="The frame's name"
                                value={typeof value?.frame === "string" ? value.frame : ""}
                                onChange={(event) => set("frame", event.currentTarget.value.trim())}
                            />
                        )}
                        {shows("sound") && (
                            <Select
                                size="xs"
                                label="Sound"
                                aria-label={`${label}: sound`}
                                placeholder="(none)"
                                data={names.sounds}
                                clearable
                                value={typeof value?.sound === "string" ? value.sound : null}
                                onChange={(sound) => set("sound", sound ?? undefined)}
                            />
                        )}
                        {shows("set") && (
                            <JsonField
                                label="Change variables"
                                aria-label={`${label}: change variables`}
                                description='e.g. { "keycard": true } or { "credits": { "add": -10 } }'
                                placeholder="(none)"
                                value={value?.set}
                                onChange={(changes) => set("set", changes)}
                            />
                        )}
                        {addable.length > 0 && (
                            <Group gap={4}>
                                {addable.map((extra) => (
                                    <Button
                                        key={extra.key}
                                        size="compact-xs"
                                        variant="subtle"
                                        aria-label={`${label}: add ${extra.label.toLowerCase()}`}
                                        onClick={() => setAsked((was) => [...was, extra.key])}
                                    >
                                        + {extra.label}
                                    </Button>
                                ))}
                            </Group>
                        )}
                        {error && (
                            <Text size="xs" c="red">
                                {error}
                            </Text>
                        )}
                    </>
                )}
            </Stack>
        </Fieldset>
    );
}

const VIDEO = /\.(mp4|m4v|webm|ogv|mov)(\?.*)?$/i;

/**
 * A view's settings: its file (picked from the program's images and videos, in the dev
 * server), a caption, and its options. Written as just the file when that's all it has.
 */
function ViewFields({
    label,
    view,
    onChange,
}: {
    label: string;
    view: unknown;
    onChange: (view: unknown) => void;
}) {
    const images = useDataFiles("images");
    const videos = useDataFiles("video");
    const options = (
        typeof view === "object" && view !== null
            ? view
            : { src: typeof view === "string" ? view : "" }
    ) as Record<string, unknown>;
    const src = typeof options.src === "string" ? options.src : "";
    const video = options.kind === "video" || (options.kind === undefined && VIDEO.test(src));
    /** The view with one setting changed (left out at its default), as short as it can be. */
    const change = (key: string, setting: unknown) => {
        const next: Record<string, unknown> = { ...options };
        if (
            setting === undefined ||
            setting === false ||
            setting === "" ||
            (key === "fit" && setting === "contain")
        ) {
            delete next[key];
        } else {
            next[key] = setting;
        }
        const keys = Object.keys(next);
        onChange(keys.length === 1 && keys[0] === "src" ? next.src : next);
    };
    const check = (key: string, text: string) => (
        <Checkbox
            size="xs"
            label={text}
            aria-label={`${label}: ${text.toLowerCase()}`}
            checked={key === "fit" ? options.fit === "cover" : options[key] === true}
            onChange={(event) =>
                change(
                    key,
                    key === "fit"
                        ? event.currentTarget.checked
                            ? "cover"
                            : undefined
                        : event.currentTarget.checked,
                )
            }
        />
    );
    return (
        <Stack gap="xs">
            <Autocomplete
                size="xs"
                label="File"
                aria-label={`${label}: file`}
                description="An image or video, from the page (in public/data), or a web address"
                placeholder="data/images/photo.jpg"
                data={[
                    ...(images.length > 0 ? [{ group: "Images", items: images }] : []),
                    ...(videos.length > 0 ? [{ group: "Videos", items: videos }] : []),
                ]}
                value={src}
                onChange={(next) => change("src", next)}
                styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            />
            <TextInput
                size="xs"
                label="Caption"
                aria-label={`${label}: caption`}
                placeholder="(none)"
                value={typeof options.caption === "string" ? options.caption : ""}
                onChange={(event) => change("caption", event.currentTarget.value)}
            />
            <Group gap="md">
                {check("fit", "Fill the window")}
                {video && check("loop", "Loop")}
                {video && check("muted", "Muted")}
                {video && check("osd", "VCR display")}
            </Group>
            {video && !options.loop && (
                <ActionField
                    label="When it ends"
                    value={options.onEnd}
                    onChange={(onEnd) => change("onEnd", onEnd)}
                    optional
                />
            )}
        </Stack>
    );
}
