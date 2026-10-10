// Which build this is (stamped by vite.config.ts): `teletronix.version` in the console, and
// `?version`, which compares it with the build deployed now.

export interface BuildInfo {
    /** package.json's version, e.g. "0.2.0" */
    version: string;
    /** The commit it's built from, e.g. "ca1cc87" */
    commit: string;
    /** When it was built, e.g. "2026-10-10T15:38:02Z" */
    built: string;
}

declare const __TELETRONIX_BUILD__: BuildInfo;

/** This build. */
export const BUILD: BuildInfo = __TELETRONIX_BUILD__;

/** "0.2.0 (ca1cc87, built 2026-10-10 15:38 UTC)" */
export const describeBuild = (build: BuildInfo) =>
    `${build.version} (${build.commit}, built ${build.built.slice(0, 16).replace("T", " ")} UTC)`;

/**
 * Whether two builds are the same: from the same commit (the same commit built again, here
 * and online, is the same Teletronix), or, without commits to go by, built at the same time.
 */
export const sameBuild = (a: BuildInfo, b: BuildInfo) =>
    a.commit !== "unknown" && b.commit !== "unknown" ? a.commit === b.commit : a.built === b.built;

/** `teletronix.version` (and `teletronix.build`), for the console. */
export function exposeVersion(): void {
    Object.assign(window, {
        teletronix: { version: describeBuild(BUILD), build: BUILD },
    });
}
