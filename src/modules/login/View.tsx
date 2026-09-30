import { useEffect, useState } from "react";
import { CommandLine } from "../../ui/CommandLine.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import {
    deniedMessage,
    isLocked,
    type LoginElement,
    type LoginMemory,
    loginAction,
} from "./definition.ts";

/**
 * A username line, then a password line (shown as *). A wrong try starts again from the
 * username, and too many lock it: its wrong tries are remembered from visit to visit.
 */
export function LoginView({ element, interactive, run, index }: ElementViewProps<LoginElement>) {
    const terminal = useTerminal();
    // (kept here too, to redraw as it changes; memory keeps it for the next visit)
    const [failures, setFailures] = useState(
        () => terminal.recall<LoginMemory>(element.id)?.failures ?? 0,
    );
    const asksUser = element.username !== false;
    // the username entered, once it has been (null while asking for it)
    const [user, setUser] = useState<string | null>(asksUser ? null : "");
    const [denied, setDenied] = useState<string | null>(null);
    // logged in, showing granted before the action
    const [welcome, setWelcome] = useState<(() => void) | null>(null);
    useEffect(() => {
        if (!welcome) return;
        const timer = window.setTimeout(welcome, element.after);
        return () => clearTimeout(timer);
    }, [welcome, element.after]);
    const className = classNames("login", element.className);

    if (welcome) {
        return (
            <div className={className}>
                {asksUser && (
                    <div>
                        {element.username}
                        {user}
                    </div>
                )}
                <div>
                    {element.password}
                    {"*".repeat(8)}
                </div>
                <div role="status">{element.granted}</div>
            </div>
        );
    }

    if (isLocked(element, failures)) {
        return (
            <div className={classNames(className, "alert")} role="status">
                {element.locked}
            </div>
        );
    }

    if (user === null) {
        return (
            <div className={className}>
                <CommandLine
                    run={run}
                    index={index}
                    interactive={interactive}
                    onSubmit={(entered) => {
                        setUser(entered.trim());
                        setDenied(null);
                        return null;
                    }}
                />
                {denied && (
                    <div className="prompt-message alert" role="status">
                        {denied}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={className}>
            {asksUser && (
                <div>
                    {element.username}
                    {user}
                </div>
            )}
            <CommandLine
                run={run}
                index={index}
                interactive={interactive}
                mask
                label={asksUser ? element.password : undefined}
                onSubmit={(password) => {
                    const action = loginAction(element, user, password);
                    if (action) {
                        const enter = () => {
                            if (element.variable) {
                                terminal.dispatch([
                                    { set: [{ variable: element.variable, value: user }] },
                                ]);
                            }
                            terminal.dispatch(action);
                        };
                        if (element.granted) setWelcome(() => enter);
                        else enter();
                        return null;
                    }
                    const tries = failures + 1;
                    terminal.remember(element.id, { failures: tries } satisfies LoginMemory);
                    setFailures(tries);
                    const message = deniedMessage(element, tries);
                    if (isLocked(element, tries)) {
                        if (element.onLocked) terminal.dispatch(element.onLocked);
                        return message;
                    }
                    // start again, from the username
                    setDenied(message);
                    if (asksUser) setUser(null);
                    return message;
                }}
            />
        </div>
    );
}
