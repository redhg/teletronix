import { classesAt, parseMarkup } from "../engine/index.ts";

/**
 * Text with inline markup ([alert]...[/]), as spans, for text the engine doesn't draw. With
 * `limit`, only that many of its characters (e.g. while it types out).
 */
export function StyledText({ text, limit }: { text: string; limit?: number }) {
    const parsed = parseMarkup(text);
    const styles = parsed.styles;
    const plain = limit === undefined ? parsed.text : parsed.text.slice(0, limit);
    if (styles.length === 0) return <>{plain}</>;
    // the stretches where the classes are the same
    const classes = classesAt(styles, plain.length);
    const parts: { text: string; className: string }[] = [];
    for (let i = 0; i < plain.length; i++) {
        const last = parts.at(-1);
        if (last && last.className === classes[i]) last.text += plain[i];
        else parts.push({ text: plain[i] ?? "", className: classes[i] ?? "" });
    }
    return (
        <>
            {parts.map((part, i) =>
                part.className ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: drawn afresh each time
                    <span key={i} className={part.className}>
                        {part.text}
                    </span>
                ) : (
                    part.text
                ),
            )}
        </>
    );
}
