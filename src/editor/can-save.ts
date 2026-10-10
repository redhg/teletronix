/**
 * Whether there's a server here to save programs and list their files: the dev server, or the
 * desktop app's (which marks its page, see desktop/server.ts). A build served anywhere else,
 * online or offline, has none.
 */
export const canAskToSave = (): boolean =>
    import.meta.env.DEV || document.querySelector('meta[name="teletronix-desktop"]') !== null;
