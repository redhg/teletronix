import { useEffect, useRef, useState } from "react";
import { StyledText } from "../../ui/StyledText.tsx";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import { isVideoTile, type Mosaic, type MosaicTile, tilesAcross } from "./definition.ts";
import "./style.css";

/** A clock's time, from seconds: 03:14:07. */
const hms = (seconds: number) =>
    [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");

/** Seconds into the day of a time written "03:14" or "03:14:07". */
const secondsOf = (time: string) => {
    const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
    return h * 3600 + m * 60 + s;
};

const reducedMotion = () => {
    try {
        return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
};

/**
 * A mosaic's tiles in their grid, with their labels and clocks, and its overlay over them all.
 * A tile with an action calls `onTile` when it's clicked (or chosen with Enter).
 */
export function MosaicGrid({
    mosaic,
    onTile,
}: {
    mosaic: Mosaic;
    onTile?: (tile: MosaicTile) => void;
}) {
    const terminal = useTerminal();
    // (shown again when variables change: tiles' ifs and signals, and the text, can follow them)
    const { variables, paused } = useTerminalSnapshot();
    void variables;

    // every clock ticks together, once a second, from when it appeared
    const [started] = useState(() => Date.now());
    const [now, setNow] = useState(started);
    const clocks = mosaic.tiles.some((tile) => tile.clock !== undefined);
    useEffect(() => {
        if (!clocks || paused) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [clocks, paused]);
    const clockOf = (clock: true | string) => {
        if (clock === true) {
            const date = new Date(now);
            return hms(date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds());
        }
        return hms(secondsOf(clock) + (now - started) / 1000);
    };

    const text = (line: string) => <StyledText text={terminal.format(line)} />;

    return (
        <div className="mosaic-screen">
            <div
                className="mosaic-grid"
                style={{
                    gridTemplateColumns: `repeat(${tilesAcross(mosaic)}, 1fr)`,
                    ["--tile-aspect" as string]: mosaic.aspect,
                }}
            >
                {mosaic.tiles.map((tile, index) => {
                    const there = !tile.if || terminal.holds(tile.if);
                    const signal =
                        there &&
                        tile.src !== undefined &&
                        (typeof tile.signal === "boolean"
                            ? tile.signal
                            : terminal.holds(tile.signal));
                    const strength = tile.static === true ? 0.35 : tile.static || 0;
                    const label = tile.label && (
                        <span className="mosaic-label">{text(tile.label)}</span>
                    );
                    const clock = tile.clock !== undefined && (
                        <span className="mosaic-clock">{clockOf(tile.clock)}</span>
                    );
                    const inside = !there ? null : signal ? (
                        <>
                            {isVideoTile(tile) ? (
                                <TileVideo src={tile.src as string} paused={paused !== null} />
                            ) : (
                                <img className="mosaic-media" src={tile.src} alt="" />
                            )}
                            {strength > 0 && <Noise opacity={strength} />}
                        </>
                    ) : (
                        <>
                            {tile.static !== false && <Noise opacity={1} />}
                            <span className="mosaic-no-signal">NO SIGNAL</span>
                        </>
                    );
                    const content = (
                        <>
                            {inside}
                            {there && label}
                            {there && clock}
                        </>
                    );
                    return tile.action && there && onTile ? (
                        <button
                            // biome-ignore lint/suspicious/noArrayIndexKey: tiles have no ids of their own
                            key={index}
                            type="button"
                            className="mosaic-tile"
                            aria-label={
                                tile.label ? terminal.format(tile.label) : `Tile ${index + 1}`
                            }
                            onClick={(event) => {
                                event.stopPropagation();
                                onTile(tile);
                            }}
                        >
                            {content}
                        </button>
                    ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: tiles have no ids of their own
                        <div key={index} className="mosaic-tile" data-dark={!there || undefined}>
                            {content}
                        </div>
                    );
                })}
            </div>
            {mosaic.overlay?.top && (
                <div className="mosaic-overlay mosaic-overlay-top">{text(mosaic.overlay.top)}</div>
            )}
            {mosaic.overlay?.bottom && (
                <div className="mosaic-overlay mosaic-overlay-bottom">
                    {text(mosaic.overlay.bottom)}
                </div>
            )}
        </div>
    );
}

/** A tile's video: muted, over and over; still while the GM has paused the program. */
function TileVideo({ src, paused }: { src: string; paused: boolean }) {
    const video = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const element = video.current;
        if (!element) return;
        if (paused) element.pause();
        else void element.play().catch(() => {});
    }, [paused]);
    return <video ref={video} className="mosaic-media" src={src} autoPlay muted loop playsInline />;
}

/** Moving static, small and blocky, as a tile with no signal (or a poor one) shows. */
function Noise({ opacity }: { opacity: number }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const target = canvas.current;
        const context = target?.getContext("2d");
        if (!target || !context) return;
        const image = context.createImageData(target.width, target.height);
        const draw = () => {
            for (let i = 0; i < image.data.length; i += 4) {
                const v = Math.random() * 255;
                image.data[i] = v;
                image.data[i + 1] = v;
                image.data[i + 2] = v;
                image.data[i + 3] = 255;
            }
            context.putImageData(image, 0, 0);
        };
        draw();
        // (still, for reduced motion)
        if (reducedMotion()) return;
        const timer = setInterval(draw, 1000 / 15);
        return () => clearInterval(timer);
    }, []);
    return (
        <div className="mosaic-noise" style={{ opacity }} aria-hidden="true">
            <canvas ref={canvas} width={120} height={90} />
        </div>
    );
}
