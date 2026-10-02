import { SegmentedControl, useMantineColorScheme } from "@mantine/core";

/** Light, dark, or as the system says. */
export function ColorScheme() {
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    return (
        <SegmentedControl
            size="xs"
            aria-label="Colour scheme"
            value={colorScheme}
            onChange={(value) => setColorScheme(value as "light" | "dark" | "auto")}
            data={[
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
                { label: "Auto", value: "auto" },
            ]}
        />
    );
}
