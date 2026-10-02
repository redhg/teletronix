import {
    Button,
    Checkbox,
    Code,
    CopyButton,
    Group,
    Paper,
    Select,
    Stack,
    Text,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { Panel } from "../mantine/Panel.tsx";
import { newCode } from "./link.ts";

/** Hosts that only this computer can reach. */
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Where other devices can open Teletronix: this page's own address, if it isn't one only
 * this computer can reach, or the computer's addresses on its networks (from the server).
 * Null while asking, and empty when there's no server to ask (e.g. a hosted copy).
 */
function useAddresses(): string[] | null {
    const here = `${location.origin}${location.pathname}`;
    const local = LOCAL.has(location.hostname);
    const [found, setFound] = useState<string[] | null>(local ? null : [here]);
    useEffect(() => {
        if (!local) return;
        let current = true;
        fetch(new URL("remote/addresses", location.href))
            .then((response) => (response.ok ? response.json() : []))
            .then((urls: unknown) => {
                if (current) setFound(Array.isArray(urls) ? urls.map(String) : []);
            })
            .catch(() => current && setFound([]));
        return () => {
            current = false;
        };
    }, [local]);
    return found;
}

/** The address a players' device opens: the program, paired with this panel. */
export function deviceAddress(base: string, program: string, code: string, kiosk: boolean) {
    const url = new URL(base);
    url.search = `?data=${encodeURIComponent(program)}&remote=${code}${kiosk ? "&kiosk" : ""}`;
    url.hash = "";
    return url.toString();
}

/** A QR code, drawn as one path of dark squares on white (which every scanner reads). */
export function QrCode({ text, label }: { text: string; label: string }) {
    const { size, path } = useMemo(() => {
        const { data } = encode(text, { ecc: "M", border: 2 });
        let path = "";
        data.forEach((row, y) => {
            row.forEach((dark, x) => {
                if (dark) path += `M${x} ${y}h1v1h-1z`;
            });
        });
        return { size: data.length, path };
    }, [text]);
    return (
        <svg
            className="gm-qr"
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={label}
            shapeRendering="crispEdges"
        >
            <rect width={size} height={size} fill="#fff" />
            <path d={path} fill="#000" />
        </svg>
    );
}

/**
 * Connecting a players' device: a QR code that opens the program on it, already paired with
 * this panel, and the same address to type or send.
 */
export function AddDevice({
    program,
    code,
    pair,
}: {
    program: string;
    code: string;
    pair: (code: string) => void;
}) {
    const addresses = useAddresses();
    const [chosen, setChosen] = useState(0);
    const [kiosk, setKiosk] = useState(false);
    const base = addresses?.[Math.min(chosen, addresses.length - 1)];

    let body: React.ReactNode;
    if (addresses === null) {
        body = (
            <Text size="sm" c="dimmed">
                Finding this computer's address…
            </Text>
        );
    } else if (!base) {
        body = (
            <Text size="sm" c="dimmed">
                Other devices can't reach Teletronix here. Serve it to your network with{" "}
                <Code>npm run table</Code> (or <Code>npm run dev -- --host</Code>).
            </Text>
        );
    } else if (!code) {
        body = (
            <Group>
                <Button onClick={() => pair(newCode())}>Show a QR code</Button>
            </Group>
        );
    } else {
        const address = deviceAddress(base, program, code, kiosk);
        body = (
            <Group align="start" wrap="nowrap" gap="lg" className="gm-device">
                <Paper p={6} bg="white" radius="sm" withBorder>
                    <QrCode text={address} label={`QR code for ${address}`} />
                </Paper>
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Scan it on the players' device, on the same network. It opens the program
                        there, paired with this panel.
                    </Text>
                    {addresses.length > 1 && (
                        <Select
                            size="xs"
                            aria-label="Network address"
                            value={String(chosen)}
                            onChange={(value) => setChosen(Number(value ?? 0))}
                            data={addresses.map((url, index) => ({
                                value: String(index),
                                label: new URL(url).host,
                            }))}
                            allowDeselect={false}
                        />
                    )}
                    <Checkbox
                        label="As a kiosk (full screen)"
                        checked={kiosk}
                        onChange={(event) => setKiosk(event.currentTarget.checked)}
                    />
                    <Code block className="gm-address">
                        {address}
                    </Code>
                    {/* (browsers only let secure pages copy: not plain http on a network) */}
                    {navigator.clipboard && (
                        <Group>
                            <CopyButton value={address}>
                                {({ copied, copy }) => (
                                    <Button
                                        size="xs"
                                        variant="light"
                                        color={copied ? "green" : undefined}
                                        onClick={copy}
                                    >
                                        {copied ? "Copied" : "Copy the address"}
                                    </Button>
                                )}
                            </CopyButton>
                        </Group>
                    )}
                </Stack>
            </Group>
        );
    }
    return <Panel title="Players' device">{body}</Panel>;
}
