import { Badge, Button, Group, PasswordInput, Select, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { Panel } from "../mantine/Panel.tsx";

// Players' windows, one by one: who the GM's panel sends to (every one, or one, e.g. a private
// screen for the engineer alone), and the windows themselves, named by the GM.

/** A players' window, as the panel knows it. */
export interface PlayerWindow {
    id: string;
    /** The GM's name for it, or "Player 1"… */
    name: string;
}

/**
 * Who the panel sends to: every players' window, or one. While it's one, it says so (and
 * everything the panel sends, and shows, is that window's alone), with a way back.
 */
export function SendTo({
    target,
    choose,
    windows,
}: {
    target: string | null;
    choose: (target: string | null) => void;
    windows: PlayerWindow[];
}) {
    const chosen = windows.find((window) => window.id === target);
    return (
        <Group gap={6}>
            <Select
                size="xs"
                w={170}
                aria-label="Send to"
                value={target ?? ""}
                onChange={(value) => choose(value ? value : null)}
                data={[
                    { value: "", label: "Send to everyone" },
                    ...windows.map((window) => ({
                        value: window.id,
                        label: `Only to ${window.name}`,
                    })),
                ]}
                allowDeselect={false}
            />
            {chosen && (
                <>
                    <Badge color="orange" variant="filled" className="gm-only-to">
                        Only to {chosen.name}
                    </Badge>
                    <Button size="compact-xs" variant="subtle" onClick={() => choose(null)}>
                        Everyone
                    </Button>
                </>
            )}
        </Group>
    );
}

/**
 * Every players' window: its name (the GM's to change), where it is, whether it's in this
 * browser or the session, and sending to it alone; a session's can be removed.
 */
export function Players({
    windows,
    screenOf,
    inSession,
    receiving,
    target,
    choose,
    rename,
    remove,
}: {
    windows: PlayerWindow[];
    /** The screen a window's on, by its title */
    screenOf: (id: string) => string | null;
    /** Whether a window's in the session (on another device), rather than in this browser */
    inSession: (id: string) => boolean;
    /** How far the package has got to a window that's receiving it (0 to 1) */
    receiving: (id: string) => number | null;
    target: string | null;
    choose: (target: string | null) => void;
    rename: (id: string, name: string) => void;
    remove: (id: string) => void;
}) {
    return (
        <Panel title="Players">
            {windows.length === 0 ? (
                <Text size="sm" c="dimmed">
                    No players' window is open.
                </Text>
            ) : (
                <Stack gap="xs">
                    {windows.map((window, index) => {
                        const progress = receiving(window.id);
                        return (
                            <Group
                                key={window.id}
                                gap="xs"
                                wrap="nowrap"
                                justify="space-between"
                                data-screen={screenOf(window.id) ?? undefined}
                            >
                                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                    <TextInput
                                        size="xs"
                                        variant="unstyled"
                                        aria-label={`Name of player ${index + 1}`}
                                        placeholder={`Player ${index + 1}`}
                                        defaultValue={
                                            window.name === `Player ${index + 1}` ? "" : window.name
                                        }
                                        onBlur={(event) =>
                                            rename(window.id, event.currentTarget.value)
                                        }
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") event.currentTarget.blur();
                                        }}
                                        styles={{ input: { fontWeight: 600 } }}
                                    />
                                    <Text size="xs" c="dimmed">
                                        {screenOf(window.id) ? `On ${screenOf(window.id)}` : "—"} ·{" "}
                                        {inSession(window.id)
                                            ? "in the session"
                                            : "in this browser"}
                                        {progress !== null &&
                                            ` · getting the package: ${Math.round(progress * 100)}%`}
                                    </Text>
                                </Stack>
                                <Button
                                    size="compact-xs"
                                    variant={target === window.id ? "filled" : "subtle"}
                                    color={target === window.id ? "orange" : undefined}
                                    aria-pressed={target === window.id}
                                    onClick={() => choose(target === window.id ? null : window.id)}
                                >
                                    Only to them
                                </Button>
                                {inSession(window.id) && (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="red"
                                        aria-label={`Remove ${window.name}`}
                                        onClick={() => remove(window.id)}
                                    >
                                        Remove
                                    </Button>
                                )}
                            </Group>
                        );
                    })}
                </Stack>
            )}
        </Panel>
    );
}

/**
 * How the package reaches players' devices that haven't got it: through the session, or, with
 * an upload key (from whoever runs Teletronix's relay), through Cloudflare: faster.
 */
export function Sharing({
    uploadKey,
    change,
    problem,
}: {
    uploadKey: string;
    change: (key: string) => void;
    problem: string | null;
}) {
    const [typed, setTyped] = useState(uploadKey);
    return (
        <Panel title="Sharing">
            <Text size="sm" c="dimmed">
                A players' device without this package gets it from the panel when it joins: through
                the session, or, with an upload key, through Cloudflare (faster).
            </Text>
            <Group gap="xs" align="end">
                <PasswordInput
                    size="xs"
                    label="Upload key"
                    placeholder="ttx_…"
                    value={typed}
                    onChange={(event) => setTyped(event.currentTarget.value.trim())}
                    onBlur={() => change(typed)}
                    autoComplete="off"
                    style={{ flex: 1 }}
                />
                {uploadKey && (
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => {
                            setTyped("");
                            change("");
                        }}
                    >
                        Forget it
                    </Button>
                )}
            </Group>
            <Text size="sm" c={problem ? "red" : "dimmed"} role="status">
                {problem
                    ? `Can't upload it (${problem}): it goes through the session instead.`
                    : uploadKey
                      ? "It goes through Cloudflare, uploaded when a device first asks for it."
                      : "It goes through the session."}
            </Text>
        </Panel>
    );
}
