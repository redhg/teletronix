import { Select } from "@mantine/core";
import { useProgramNames } from "./names.ts";

const PROGRAM = "@program";
const SILENCE = "@silence";

/**
 * Which audio file loops in the background: one of the program's, or none. A screen's can
 * also be the program's (left out) or silence (false).
 */
export function AmbienceField({
    label,
    description,
    value,
    onChange,
    error,
    forScreen,
}: {
    label: string;
    description: string;
    value: unknown;
    onChange: (value: string | false | undefined) => void;
    error?: string | undefined;
    /** A screen's: the program's, or silence, as well */
    forScreen?: boolean;
}) {
    const { audio } = useProgramNames();
    const named = typeof value === "string" ? value : null;
    const data = [
        ...(forScreen ? [{ value: PROGRAM, label: "The program's" }] : []),
        // (one that's missing still shows, as its problem says)
        ...[...audio, ...(named && !audio.includes(named) ? [named] : [])].map((name) => ({
            value: name,
            label: name,
        })),
        ...(forScreen ? [{ value: SILENCE, label: "Silence" }] : []),
    ];
    return (
        <Select
            label={label}
            description={description}
            placeholder={audio.length === 0 ? "No audio files yet: add one in Sounds" : "None"}
            data={data}
            clearable={!forScreen}
            allowDeselect={!forScreen}
            value={value === false ? SILENCE : (named ?? (forScreen ? PROGRAM : null))}
            error={error}
            onChange={(next) =>
                onChange(
                    next === null || next === PROGRAM ? undefined : next === SILENCE ? false : next,
                )
            }
        />
    );
}
