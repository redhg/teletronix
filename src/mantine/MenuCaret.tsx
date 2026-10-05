import "./tools.css";

/** The chevron on a button that opens a menu (screen readers hear that it opens one already). */
export function MenuCaret() {
    return (
        <svg
            aria-hidden="true"
            className="tool-caret"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
    );
}
