import {
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

/** How long a press has to be held to count as a secondary click. */
export const LONG_PRESS_MS = 750;
/** How far a finger can move while holding before it counts as a scroll instead. */
const MOVE_TOLERANCE = 10;

interface Press {
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
}

/**
 * Primary and secondary clicks for an element. Secondary is a shift-click, Shift+Enter,
 * a right-click, or a long press (with a finger, pen or mouse). `holding` is true while a long press is under way.
 */
export function useSecondaryPress(hasSecondary: boolean, onPress: (secondary: boolean) => void) {
    const [holding, setHolding] = useState(false);
    const press = useRef<Press | null>(null);
    const pointerType = useRef("mouse");
    // a long press that fired shouldn't also count as the click that follows it
    const swallowClick = useRef(false);

    const cancel = useCallback(() => {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
        setHolding(false);
    }, []);

    useEffect(() => cancel, [cancel]);

    const handlers = {
        onPointerDown(event: PointerEvent) {
            pointerType.current = event.pointerType;
            swallowClick.current = false;
            // any pointer can long-press, but only with its main button (a right-click is
            // already a secondary click of its own)
            if (!hasSecondary || !event.isPrimary || event.button !== 0) return;
            cancel();
            const timer = setTimeout(() => {
                press.current = null;
                setHolding(false);
                swallowClick.current = true;
                navigator.vibrate?.(15);
                onPress(true);
            }, LONG_PRESS_MS);
            press.current = { x: event.clientX, y: event.clientY, timer };
            setHolding(true);
        },
        onPointerMove(event: PointerEvent) {
            const start = press.current;
            if (
                start &&
                Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE
            ) {
                cancel();
            }
        },
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onPointerLeave: cancel,
        onClick(event: MouseEvent) {
            if (swallowClick.current) {
                swallowClick.current = false;
                event.preventDefault();
                return;
            }
            onPress(event.shiftKey);
        },
        // Shift+Enter: browsers don't agree on whether the click it causes has shiftKey set
        onKeyDown(event: KeyboardEvent) {
            if (event.key === "Enter" && event.shiftKey && hasSecondary) {
                event.preventDefault();
                onPress(true);
            }
        },
        onContextMenu(event: MouseEvent) {
            if (!hasSecondary) return;
            // on touch, the long press handles it; from a mouse, this is a right-click
            event.preventDefault();
            if (pointerType.current === "mouse") onPress(true);
        },
    };

    return { holding, handlers };
}
