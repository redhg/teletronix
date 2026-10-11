import { Anchor } from "@mantine/core";
import { BUILD, describeBuild } from "../version.ts";

/** Which Teletronix this is, quietly: its version, the build on hover, and ?version on a click. */
export function Version() {
    return (
        <Anchor
            href="?version"
            target="_blank"
            size="xs"
            c="dimmed"
            title={`Teletronix ${describeBuild(BUILD)}: is it the latest?`}
            className="tool-version"
        >
            v{BUILD.version}
        </Anchor>
    );
}
