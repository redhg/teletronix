import { type KeyboardEvent, useEffect, useRef } from "react";
import { useSoundToggle } from "../sound/context.ts";
import {
    LOOKS,
    type Look,
    type PlayerSettings,
    type Resolved,
    step,
    stepTextSize,
} from "./settings.ts";
import "../dialog.css";
import "./settings.css";

const LOOK_NAMES: Record<Look, string> = {
    program: "AS MADE",
    "contrast-dark": "HIGH CONTRAST, DARK",
    "contrast-light": "HIGH CONTRAST, LIGHT",
};

/** How finely the volume steps, and how many cells its bar has. */
const VOLUME_STEP = 0.1;
const CELLS = 10;

interface Row {
    id: string;
    label: string;
    value: string;
    role: "slider" | "switch" | "button";
    /** For a switch: whether it's on */
    checked?: boolean;
    /** For a slider: its value and range, for screen readers */
    range?: { now: number; min: number; max: number; text: string };
    disabled?: boolean;
    /** The arrow keys: one step down or up */
    change: (by: -1 | 1) => void;
    /** Enter, Space or a click */
    activate: () => void;
}

/** A row's role and state, for screen readers: a slider, a switch, or a button that cycles. */
function ariaFor(row: Row): Record<string, string | number | boolean | undefined> {
    if (row.role === "switch") return { role: "switch", "aria-checked": row.checked };
    if (row.role === "slider") {
        return {
            role: "slider",
            "aria-valuenow": row.range?.now,
            "aria-valuemin": row.range?.min,
            "aria-valuemax": row.range?.max,
            "aria-valuetext": row.range?.text,
        };
    }
    return { "aria-description": `now ${row.value.toLowerCase()}` };
}

interface Props {
    settings: Resolved;
    /** The program's volume, or null if it has no sound */
    programVolume: number | null;
    /** Whether the program has a mouse pointer of its own, to switch back from */
    ownPointer: boolean;
    change: (settings: Partial<PlayerSettings>) => void;
    reset: () => void;
    close: () => void;
}

/**
 * The player's quick settings (Ctrl+, or a long press on the sound toggle): for them, on this
 * device. A dialog in the terminal's own look; the arrow keys move between rows and change
 * the one with focus.
 */
export function SettingsDialog({
    settings,
    programVolume,
    ownPointer,
    change,
    reset,
    close,
}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const sound = useSoundToggle();
    useEffect(() => {
        dialog.current?.showModal();
    }, []);

    const volume = settings.volume ?? programVolume ?? 0;
    const highContrast = settings.look !== "program";
    const rows: Row[] = [
        ...(sound && programVolume !== null
            ? [
                  {
                      id: "sound",
                      label: "SOUND",
                      value: sound.muted ? "OFF" : "ON",
                      role: "switch" as const,
                      checked: !sound.muted,
                      change: () => sound.toggle(),
                      activate: () => sound.toggle(),
                  },
                  {
                      id: "volume",
                      label: "VOLUME",
                      value: `${"█".repeat(Math.round(volume * CELLS)).padEnd(CELLS, "░")} ${Math.round(volume * 100)}%`,
                      role: "slider" as const,
                      range: {
                          now: Math.round(volume * 100),
                          min: 0,
                          max: 100,
                          text: `${Math.round(volume * 100)}%`,
                      },
                      change: (by: -1 | 1) =>
                          change({
                              volume:
                                  Math.round(
                                      Math.min(1, Math.max(0, volume + by * VOLUME_STEP)) * 10,
                                  ) / 10,
                          }),
                      activate: () =>
                          change({ volume: volume >= 1 ? 0 : Math.min(1, volume + VOLUME_STEP) }),
                  },
              ]
            : []),
        {
            id: "look",
            label: "LOOK",
            value: LOOK_NAMES[settings.look],
            role: "button",
            change: (by) => change({ look: step(LOOKS, settings.look, by) }),
            activate: () => change({ look: step(LOOKS, settings.look, 1) }),
        },
        {
            id: "text-size",
            label: "TEXT SIZE",
            value: `${Math.round(settings.textSize * 100)}%`,
            role: "slider",
            range: {
                now: Math.round(settings.textSize * 100),
                min: 75,
                max: 200,
                text: `${Math.round(settings.textSize * 100)}%`,
            },
            change: (by) => change({ textSize: stepTextSize(settings.textSize, by) }),
            activate: () => change({ textSize: stepTextSize(settings.textSize, 1) }),
        },
        {
            id: "effects",
            label: "EFFECTS",
            value: highContrast ? "OFF (HIGH CONTRAST)" : settings.effects ? "ON" : "OFF",
            role: "switch",
            checked: settings.effects && !highContrast,
            disabled: highContrast,
            change: () => change({ effects: !settings.effects }),
            activate: () => change({ effects: !settings.effects }),
        },
        ...(ownPointer
            ? [
                  {
                      id: "pointer",
                      label: "POINTER",
                      value: settings.pointer === "system" ? "THIS DEVICE'S" : "AS MADE",
                      role: "button" as const,
                      change: () =>
                          change({ pointer: settings.pointer === "system" ? "program" : "system" }),
                      activate: () =>
                          change({ pointer: settings.pointer === "system" ? "program" : "system" }),
                  },
              ]
            : []),
        {
            id: "instant",
            label: "TEXT",
            value: settings.instant ? "ALL AT ONCE" : "TYPED IN",
            role: "button",
            change: () => change({ instant: !settings.instant }),
            activate: () => change({ instant: !settings.instant }),
        },
    ];

    const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
        // (Ctrl+, closes it, as it opened it: see Player; the screen's keys stop at a dialog)
        const target = event.target instanceof HTMLElement ? event.target : null;
        const controls = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(".settings-row, .dialog-button") ??
                []),
        ];
        const at = target ? controls.indexOf(target) : -1;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const by = event.key === "ArrowUp" ? -1 : 1;
            controls[(at + by + controls.length) % controls.length]?.focus();
            return;
        }
        const row = rows.find((candidate) => candidate.id === target?.dataset.row);
        if (row && !row.disabled && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            row.change(event.key === "ArrowLeft" ? -1 : 1);
        }
    };

    return (
        <dialog
            ref={dialog}
            className="dialog settings"
            aria-labelledby="settings-title"
            onCancel={(event) => {
                event.preventDefault();
                close();
            }}
            onKeyDown={onKeyDown}
            onClick={(event) => {
                // a click on the dimmed screen around it closes it
                if (event.target === dialog.current) close();
            }}
        >
            <div className="dialog-body">
                <div id="settings-title" className="settings-title">
                    SETTINGS <span className="settings-note">FOR YOU, ON THIS DEVICE</span>
                </div>
                <div className="settings-rows">
                    {rows.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            className="settings-row"
                            data-row={row.id}
                            aria-label={row.label.toLowerCase()}
                            {...ariaFor(row)}
                            aria-disabled={row.disabled || undefined}
                            onClick={(event) => {
                                if (row.disabled) return;
                                // a click on an arrow steps that way
                                const arrow =
                                    event.target instanceof Element
                                        ? event.target.closest<HTMLElement>("[data-by]")
                                        : null;
                                if (arrow) row.change(arrow.dataset.by === "-1" ? -1 : 1);
                                else row.activate();
                            }}
                        >
                            <span className="settings-label">{row.label}</span>
                            {row.role === "button" || row.role === "slider" ? (
                                <span className="settings-value">
                                    <span className="settings-arrow" data-by="-1">
                                        ◄
                                    </span>{" "}
                                    {row.value}{" "}
                                    <span className="settings-arrow" data-by="1">
                                        ►
                                    </span>
                                </span>
                            ) : (
                                <span className="settings-value">[{row.value}]</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="dialog-buttons">
                    <button type="button" className="dialog-button" onClick={reset}>
                        RESET
                    </button>
                    <button type="button" className="dialog-button" onClick={close}>
                        CLOSE
                    </button>
                </div>
            </div>
        </dialog>
    );
}
