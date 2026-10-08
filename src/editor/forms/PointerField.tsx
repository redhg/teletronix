import { Autocomplete, Group, NumberInput, Select, Stack } from "@mantine/core";
import { useDataFiles } from "./files.ts";

const PROGRAM = "@program";
const IMAGE = "@image";

const KINDS = [
    { value: "system", label: "The browser's own" },
    { value: "theme", label: "A pixel arrow in the theme's colors" },
    { value: "block", label: "A block, cell to cell (as in DOS)" },
    { value: "crosshair", label: "A crosshair across the screen" },
    { value: "hidden", label: "Hidden" },
    { value: IMAGE, label: "An image of your own…" },
];

/**
 * The mouse pointer: one of Teletronix's, or an image (picked from the program's, in the dev
 * server) and the pixel in it that points. A screen's can also be the program's (left out).
 */
export function PointerField({
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
    onChange: (value: unknown) => void;
    error?: string | undefined;
    /** A screen's: the program's, as well */
    forScreen?: boolean;
}) {
    const images = useDataFiles("images");
    const image =
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
    const choice =
        value === undefined ? (forScreen ? PROGRAM : "system") : image ? IMAGE : String(value);
    /** The image pointer with a setting changed, its hotspot left out at 0. */
    const setImage = (key: string, setting: unknown) => {
        const next: Record<string, unknown> = { src: "", ...image, [key]: setting };
        if (!next.x) delete next.x;
        if (!next.y) delete next.y;
        onChange(next);
    };
    return (
        <Stack gap="xs">
            <Select
                label={label}
                description={description}
                data={[
                    ...(forScreen ? [{ value: PROGRAM, label: "The program's" }] : []),
                    ...KINDS,
                ]}
                value={choice}
                allowDeselect={false}
                error={error}
                onChange={(next) => {
                    if (next === PROGRAM) onChange(undefined);
                    else if (next === IMAGE) onChange({ src: "" });
                    // (the browser's own is the program's default: left out)
                    else if (next === "system" && !forScreen) onChange(undefined);
                    else onChange(next ?? undefined);
                }}
            />
            {image && (
                <Group gap="xs" align="end" wrap="nowrap">
                    <Autocomplete
                        size="xs"
                        label="Image"
                        aria-label={`${label}: image`}
                        description="A PNG, about 32×32 pixels at most"
                        placeholder="data/pointers/claw.png"
                        data={images}
                        value={typeof image.src === "string" ? image.src : ""}
                        onChange={(src) => setImage("src", src)}
                        style={{ flex: 1 }}
                        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
                    />
                    <NumberInput
                        size="xs"
                        label="Points at x"
                        aria-label={`${label}: x`}
                        min={0}
                        w={90}
                        value={typeof image.x === "number" ? image.x : 0}
                        onChange={(x) => setImage("x", typeof x === "number" ? x : 0)}
                    />
                    <NumberInput
                        size="xs"
                        label="y"
                        aria-label={`${label}: y`}
                        min={0}
                        w={70}
                        value={typeof image.y === "number" ? image.y : 0}
                        onChange={(y) => setImage("y", typeof y === "number" ? y : 0)}
                    />
                </Group>
            )}
        </Stack>
    );
}
