import { useEffect, useState } from "react";

/** The kinds of file a program can name. */
export type FileKind = "audio" | "images" | "video";

/**
 * The program's files of a kind, in public/data, to choose from: listed by the dev server
 * (see scripts/editor-save.ts), and none anywhere else (the fields still take any path).
 */
export function useDataFiles(kind: FileKind): string[] {
    const [files, setFiles] = useState<string[]>([]);
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        let current = true;
        fetch(new URL(`__teletronix/files/${kind}`, location.href))
            .then((response) => (response.ok ? response.json() : []))
            .then((list: unknown) => {
                if (current && Array.isArray(list)) {
                    setFiles(list.filter((item): item is string => typeof item === "string"));
                }
            })
            .catch(() => {});
        return () => {
            current = false;
        };
    }, [kind]);
    return files;
}
