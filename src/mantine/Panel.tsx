import { Card, Stack, Title } from "@mantine/core";

/** A card with a title: a group of a tool's controls. */
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card withBorder component="section" aria-label={title} padding="lg">
            <Stack gap="sm">
                <Title order={5} tt="uppercase" c="dimmed" fz="xs" lts={1}>
                    {title}
                </Title>
                {children}
            </Stack>
        </Card>
    );
}
