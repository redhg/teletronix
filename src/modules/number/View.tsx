import { CommandLine } from "../../ui/CommandLine.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { inRange, type NumberElement, numberAction, onlyDigits } from "./definition.ts";

export function NumberView({ element, interactive, run, index }: ElementViewProps<NumberElement>) {
    const terminal = useTerminal();
    return (
        <CommandLine
            run={run}
            index={index}
            interactive={interactive}
            className={classNames("number", element.className)}
            filter={(typed) => onlyDigits(element, typed)}
            mask={element.mask}
            inputMode="numeric"
            onSubmit={(entered) => {
                const value = Number(entered);
                if (!inRange(element, value)) return element.unknown;
                // the number goes into the variable first, so actions can test it
                if (element.variable) terminal.remember(element.id, value);
                const action = numberAction(element, value);
                if (!action) return element.unknown;
                terminal.dispatch(action);
                return null;
            }}
        />
    );
}
