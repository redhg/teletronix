import {
    type KeyboardEvent,
    memo,
    type PointerEvent,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { AutoscrollContext } from "../../ui/autoscroll.ts";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { loadBytes } from "../../ui/load-bytes.ts";
import { useTerminalSnapshot } from "../../ui/terminal-context.ts";
import {
    asText,
    bytesPerRow,
    type HexdumpElement,
    hex,
    hexBytes,
    highlighted,
    moveCursor,
    statusLine,
} from "./definition.ts";
import "./style.css";

interface RowProps {
    bytes: Uint8Array;
    start: number;
    perRow: number;
    dump: HexdumpElement;
    marks: Set<number>;
    /** The cursor's byte, if it's in this row. */
    cursor: number | null;
}

/** One row: the address, the bytes in hex, and the same bytes as text. */
const Row = memo(function Row({ bytes, start, perRow, dump, marks, cursor }: RowProps) {
    const hexCells = [];
    const textCells = [];
    for (let i = 0; i < perRow; i++) {
        const at = start + i;
        const byte = bytes[at];
        const gap = i === perRow / 2 && perRow > 4 ? "  " : " ";
        if (byte === undefined) {
            hexCells.push(`${gap}  `);
            continue;
        }
        const className = classNames(marks.has(at) && "mark", cursor === at && "cursor");
        hexCells.push(gap);
        hexCells.push(
            <span key={at} className={className || undefined} data-byte={at}>
                {hex(byte, 2, dump.lowercase)}
            </span>,
        );
        textCells.push(
            <span key={at} className={className || undefined} data-byte={at}>
                {asText(byte)}
            </span>,
        );
    }
    const missing = perRow - textCells.length;
    return (
        <div className="hexdump-row">
            <span className="hexdump-offset">{hex(dump.offset + start, 8, dump.lowercase)}</span>{" "}
            {hexCells}
            {dump.ascii && (
                <>
                    {"  |"}
                    {textCells}
                    {"|"}
                    {" ".repeat(missing)}
                </>
            )}
        </div>
    );
});

/**
 * Draws its own rows (rather than the engine's text), so bytes can be highlighted. Rows
 * appear as the reveal goes. With "rows", it's a window the player moves a cursor through.
 */
export function HexdumpView({
    element,
    state,
    interactive,
    run,
    index,
}: ElementViewProps<HexdumpElement>) {
    const box = useRef<HTMLElement>(null);
    const probe = useRef<HTMLSpanElement>(null);
    const autoscroll = useContext(AutoscrollContext);
    const dialog = useTerminalSnapshot().dialog !== null;
    const [file, setFile] = useState<Uint8Array | null>(null);
    const [failed, setFailed] = useState(false);
    const [columns, setColumns] = useState(80);
    const [fill, setFill] = useState(16);
    const [progress, setProgress] = useState(0);
    const [cursor, setCursor] = useState(0);
    const [top, setTop] = useState(0);

    useEffect(() => {
        if (element.src === undefined) return;
        let current = true;
        loadBytes(element.src).then(
            (bytes) => current && setFile(bytes),
            () => current && setFailed(true),
        );
        return () => {
            current = false;
        };
    }, [element.src]);

    const bytes = useMemo(() => hexBytes(element, file ?? undefined), [element, file]);
    const marks = useMemo(() => highlighted(element, bytes), [element, bytes]);
    const perRow = bytesPerRow(element, columns);
    const totalRows = Math.ceil(bytes.length / perRow);
    const windowed = element.rows !== undefined;
    const page = element.rows === "fill" ? fill : (element.rows ?? totalRows);

    // how many characters fit across, and (for "fill") how many rows fit down
    useLayoutEffect(() => {
        const target = box.current;
        if (!target) return;
        const measure = () => {
            const width = (probe.current?.getBoundingClientRect().width ?? 800) / 100;
            setColumns(Math.max(1, Math.floor(target.clientWidth / width)));
            if (element.rows === "fill") {
                const style = getComputedStyle(target);
                const line = Number.parseFloat(style.lineHeight) || 20;
                const footer = Number.parseFloat(
                    getComputedStyle(document.documentElement).getPropertyValue("--footer-lines"),
                );
                // below it: its status line, the page's bottom margin, and any status bar
                const below = (1 + 1 + (footer || 0)) * line;
                const room = window.innerHeight - target.getBoundingClientRect().top - below;
                setFill(Math.max(4, Math.floor(room / line)));
            }
        };
        const sizes = new ResizeObserver(measure);
        sizes.observe(target);
        window.addEventListener("resize", measure);
        measure();
        return () => {
            sizes.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [element.rows]);

    // rows appear as the reveal goes
    useLayoutEffect(() => run.subscribeProgress(index, setProgress), [run, index]);
    const revealing = Math.min(totalRows, page);
    const shown = state === "done" ? revealing : Math.ceil(progress * revealing);
    useLayoutEffect(() => {
        if (shown > 0) autoscroll?.follow();
    }, [shown, autoscroll]);

    // the window takes the keyboard once it can be used, unless a field already has it
    useEffect(() => {
        if (!windowed || !interactive || dialog) return;
        if (document.activeElement instanceof HTMLInputElement) return;
        box.current?.focus({ preventScroll: true });
    }, [windowed, interactive, dialog]);

    const moveTo = (next: number) => {
        setCursor(next);
        const row = Math.floor(next / perRow);
        setTop((current) =>
            row < current ? row : row >= current + page ? row - page + 1 : current,
        );
    };
    const handleKey = (event: KeyboardEvent) => {
        if (!windowed || !interactive || event.altKey || event.metaKey || event.ctrlKey) return;
        const next = moveCursor(event.key, cursor, bytes.length, perRow, page);
        if (next === null) return;
        event.preventDefault();
        moveTo(next);
    };
    const handlePointer = (event: PointerEvent) => {
        if (!windowed || !interactive) return;
        // a click in the window moves the cursor; it isn't a click on the screen (which skips)
        event.stopPropagation();
        const at = (event.target as HTMLElement).closest<HTMLElement>("[data-byte]")?.dataset.byte;
        if (at !== undefined) moveTo(Number(at));
    };

    const alt = element.alt ?? `Hex dump, ${bytes.length.toLocaleString("en-US")} bytes`;
    const className = classNames("hexdump", windowed && "hexdump-window", element.className);
    if (failed) {
        return (
            <div className={classNames(className, "alert")}>[FILE UNAVAILABLE: {element.src}]</div>
        );
    }

    const first = windowed ? Math.min(top, Math.max(0, totalRows - page)) : 0;
    const rows = [];
    for (let row = first; row < first + shown && row < totalRows; row++) {
        const start = row * perRow;
        const inRow = windowed && cursor >= start && cursor < start + perRow ? cursor : null;
        rows.push(
            <Row
                key={row}
                bytes={bytes}
                start={start}
                perRow={perRow}
                dump={element}
                marks={marks}
                cursor={inRow}
            />,
        );
    }

    return (
        <section
            ref={box}
            className={className}
            aria-label={alt}
            tabIndex={windowed ? 0 : undefined}
            onKeyDown={handleKey}
            onPointerDown={handlePointer}
        >
            <span ref={probe} className="hexdump-probe" aria-hidden="true">
                {"0".repeat(100)}
            </span>
            <div aria-hidden="true">{rows}</div>
            {windowed && element.status && state === "done" && (
                <div className="hexdump-status">{statusLine(element, bytes, cursor)}</div>
            )}
        </section>
    );
}
