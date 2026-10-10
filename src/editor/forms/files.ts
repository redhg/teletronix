import { useEffect, useState } from "react";
import { canAskToSave } from "../can-save.ts";

/** The kinds of file a program can name. */
export type FileKind = "audio" | "images" | "video";

/**
 * The program's files of a kind, to choose from: listed by the dev server (public/data's, see
 * scripts/editor-save.ts) and the desktop app (those beside the file it opened), and none
 * anywhere else (the fields still take any path).
 */
export function useDataFiles(kind: FileKind): string[] {
    const [files, setFiles] = useState<string[]>([]);
    useEffect(() => {
        if (!canAskToSave()) return;
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
