import { createContext } from "react";

/**
 * Keeps the newest content on screen as it's revealed: the typing cursor if there is one,
 * otherwise the bottom of the current screen (a glitch block, an image, a progress bar…).
 *
 * It only follows while the reader is at the newest content. Scrolling up to reread stops
 * it; scrolling back down picks it up again. Each new screen starts at the top.
 */
export class Autoscroller {
    private screen: HTMLElement | null = null;
    private enabled = true;
    private following = true;
    /** Where our own last scroll went, to tell our scroll events from the reader's. */
    private expectedY: number | null = null;
    private readonly observer = new ResizeObserver(() => this.follow());

    /** Starts listening. Returns a function that stops; attach again to resume. */
    attach(): () => void {
        window.addEventListener("scroll", this.handleScroll, { passive: true });
        window.addEventListener("wheel", this.handleWheel, { passive: true });
        window.addEventListener("touchmove", this.stopFollowing, { passive: true });
        window.addEventListener("keydown", this.handleKey);
        if (this.screen) this.observer.observe(this.screen);
        return () => {
            window.removeEventListener("scroll", this.handleScroll);
            window.removeEventListener("wheel", this.handleWheel);
            window.removeEventListener("touchmove", this.stopFollowing);
            window.removeEventListener("keydown", this.handleKey);
            this.observer.disconnect();
        };
    }

    /** Switches to a new screen: back to the top, following again. */
    setScreen(screen: HTMLElement | null, enabled: boolean): void {
        this.enabled = enabled;
        if (screen === this.screen) return;
        this.observer.disconnect();
        this.screen = screen;
        this.following = true;
        if (screen) this.observer.observe(screen);
        this.scrollTo(0);
    }

    /** Brings the newest content into view, if following. Call when it may have moved. */
    follow(): void {
        const target = this.target();
        if (!this.enabled || !this.following || !target) return;
        const overflow = target.getBoundingClientRect().bottom + this.margin() - window.innerHeight;
        if (overflow > 0) this.scrollTo(window.scrollY + overflow);
    }

    private target(): Element | null {
        return this.screen?.querySelector(".reveal-cursor:not(:empty)") ?? this.screen;
    }

    /** One line of breathing room below the newest content. */
    private margin(): number {
        const lineHeight = this.screen
            ? Number.parseFloat(getComputedStyle(this.screen).lineHeight)
            : 0;
        return Number.isFinite(lineHeight) ? lineHeight : 0;
    }

    private scrollTo(y: number): void {
        const top = Math.max(0, Math.round(y));
        if (Math.abs(window.scrollY - top) < 1) return;
        this.expectedY = top;
        window.scrollTo({ top, behavior: "instant" });
    }

    // Scrolling up is a clear sign the reader wants to look back, so stop following at
    // once rather than waiting for the scroll event: new content arriving in the same
    // frame would otherwise yank them back down.
    private readonly stopFollowing = (): void => {
        this.following = false;
    };

    private readonly handleWheel = (event: WheelEvent): void => {
        if (event.deltaY < 0) this.stopFollowing();
    };

    private readonly handleKey = (event: KeyboardEvent): void => {
        // a key a control used (e.g. ArrowUp on a slider) didn't scroll anything
        if (event.defaultPrevented) return;
        if (SCROLL_UP_KEYS.has(event.key)) this.stopFollowing();
    };

    private readonly handleScroll = (): void => {
        if (this.expectedY !== null && Math.abs(window.scrollY - this.expectedY) < 2) {
            this.expectedY = null;
            return;
        }
        this.expectedY = null;
        // the reader scrolled: follow only if the newest content is (nearly) in view
        const target = this.target();
        const bottom = target?.getBoundingClientRect().bottom ?? 0;
        this.following = bottom <= window.innerHeight + 2 * this.margin();
    };
}

const SCROLL_UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"]);

export const AutoscrollContext = createContext<Autoscroller | null>(null);
