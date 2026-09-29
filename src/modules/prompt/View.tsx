import { CommandLine } from "../../ui/CommandLine.tsx";
import type { ElementViewProps } from "../../ui/element-view.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { matchCommand, type PromptElement } from "./definition.ts";

export function PromptView({ element, interactive, run, index }: ElementViewProps<PromptElement>) {
    const terminal = useTerminal();
    return (
        <CommandLine
            run={run}
            index={index}
            interactive={interactive}
            className={element.className}
            onSubmit={(entered) => {
                // what's typed goes into the prompt's variable first, so actions can test it
                if (element.variable) terminal.remember(element.id, entered.trim());
                const action = matchCommand(element, entered, terminal.holds);
                if (!action) return element.unknown;
                terminal.dispatch(action);
                return null;
            }}
        />
    );
}
