import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { BuiltInLookup, Command, CommandArgument, IShortcut, builtInCommands, ShowCut, CursorButtons, ShortcutHandler, InvokeOptions, targets, CommandActionDataType, ParamNum, Param, isArgumentValid, CommandTargetName } from "./Commands";
import { SongEditor } from "./SongEditor";

const { button, div, h2, input, option, select, span, textarea } = HTML;
type argReport = { info: string, warn: string, arguments: CommandArgument[] }

export class ShortcutsAndCommandsPrompt implements Prompt {
    private _builtInCommands: BuiltInLookup = {};
    private _customCommands: Command[] = [];
    private _builtInEditsByID: BuiltInLookup = {};
    private _rebinding: { command: Command, cutIndex: number, newCut: IShortcut,
        html: HTMLSpanElement, timeout: number, timeoutIndex?: number,
        makeNew?: boolean, htmlExpanded?: boolean } | undefined;

    private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
    private readonly _okayButton: HTMLButtonElement = button({class: "okayButton", style: "width:45%;"}, "Okay");
    private readonly _resetButton: HTMLButtonElement = button({ style: "width:30%;" }, "Reset all");
    private _commandContainer: HTMLDivElement = div({ style: 'width: 31rem; margin-right: 12px; text-align: left;'});

    public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 31rem; text-align: right; max-height: 90%;" },
        h2({ style: "align-self: center;" }, "Shortcuts and Commands"),
        div({ style: "display: flex; overflow-y: auto; overflow-x: hidden; flex-shrink: 1; width: 550px; max-height: 300px;" },
            this._commandContainer,
        ),
        div({ style: "display: flex; flex-direction: row-reverse; justify-content: space-between;" },
            this._okayButton,
            this._resetButton
        ),
        this._cancelButton,
    );

    constructor(private _editor: SongEditor, private _doc: SongDocument) {
        this._initDefaults();
        this._okayButton.addEventListener("click", this._confirm);
        this._cancelButton.addEventListener("click", this._close);
        this._resetButton.addEventListener("click", this._resetToDefault);
        this.container.addEventListener("keydown", this.onKeyDown);
        this.container.addEventListener("keyup", this.onKeyUp);
        this.container.addEventListener("mousedown", this._onMouseDown);
        this.container.addEventListener("mouseup", this._onMouseUp);
        this.container.addEventListener("wheel", this._onMouseWheel);
    }

    private _initDefaults = (withoutEdits?: boolean): void => {
        // Deep copies for safety
        this._builtInEditsByID = Command.FromJSONLookup(Command.ToJSONLookup(this._doc.prefs.builtInEditsByID));
        this._customCommands = Command.FromJSONArray(Command.ToJSONArray(this._doc.prefs.customCommands));

        // The loaded built-ins are all the custom ones (when available), else the built-ins if custom isn't null.
        // Custom entries set to null indicate the built-in was disabled.
        this._builtInCommands = {};
        Object.entries(builtInCommands).forEach(entry => {
            const key = entry[0] as unknown as keyof typeof builtInCommands;
            if (this._builtInEditsByID[key]) {
                this._builtInCommands[key] = withoutEdits || this._builtInEditsByID[key] === undefined
                    ? Command.FromJSON(Command.ToJSON(entry[1]))! : this._builtInEditsByID[key] as Command;
            }
        });

        this._render();
    }

    private _resetToDefault = () => this._initDefaults(true);

    private _render = (): void => {
        const commands: HTMLDivElement[] = [];

        Object.entries(this._builtInCommands).forEach(entry => {
            commands.push(this._renderCommand(true, +entry[0]));
        });
        this._customCommands.forEach((_, index) => {
            commands.push(this._renderCommand(false, index));
        });

        this._commandContainer.replaceChildren(...commands);
    }

    public onKeyDown = (event: KeyboardEvent): void => {
        // Record inputs while rebinding.
        if (this._rebinding !== undefined) {
            if (!event.repeat && !this._rebinding.newCut.keys.includes(event.key.toLowerCase())) {
                this._rebinding.newCut.keys.push(event.key.toLowerCase());
                this._rebindResetTimer();
                event.preventDefault();
            }
            return;
        }

        // Confirm/close the window.
        if (document.activeElement?.tagName !== "TEXTAREA" &&
            !(document.activeElement?.tagName === "INPUT" && document.activeElement.getAttribute("type") === "text" )) {
            if (event.key == "Enter") {
                this._confirm();
            }
            else if (event.key === "Escape") {
                this._close();
            }
        }
    }

    private _onMouseDown = (event: MouseEvent): void => {
        // Record inputs while rebinding.
        if (this._rebinding !== undefined) {
            this._rebinding.newCut.cursor ??= [];
            if (!this._rebinding.newCut.cursor.includes(event.button)) {
                this._rebinding.newCut.cursor.push(event.button);
                this._rebindResetTimer();
                event.preventDefault();
            }
        }
    }

    private _onMouseWheel = (event: WheelEvent): void => {
        if (this._rebinding && event.deltaY !== 0) {
            this._rebinding.newCut.cursor ??= [];
            if (!this._rebinding.newCut.cursor.includes(CursorButtons.WheelDown) && !this._rebinding.newCut.cursor.includes(CursorButtons.WheelUp)) {
                this._rebinding.newCut.cursor.push(event.deltaY > 0 ? CursorButtons.WheelDown : CursorButtons.WheelUp);
                this._rebindResetTimer();
                event.preventDefault();
            }
        }
    }

    public onKeyUp = (event: KeyboardEvent): void => {
        if (this._rebinding) { this._rebindEnd(); }
    }

    private _onMouseUp = (event: MouseEvent): void => {
        if (this._rebinding) { this._rebindEnd(); }
    }
        
    private _close = (): void => {
        window.clearTimeout(this._rebinding?.timeoutIndex);
        this._doc.undo();
    }

    public cleanUp = (): void => {
        this._okayButton.removeEventListener("click", this._confirm);
        this._cancelButton.removeEventListener("click", this._close);
        this._resetButton.removeEventListener("click", this._resetToDefault);
        this.container.removeEventListener("keydown", this.onKeyDown);
        this.container.removeEventListener("keyup", this.onKeyUp);
        this.container.removeEventListener("mousedown", this._onMouseDown);
        this.container.removeEventListener("mouseup", this._onMouseUp);
        this.container.removeEventListener("wheel", this._onMouseWheel);
        this.container.replaceChildren();
    }

    private _confirm = (): void => {
        this._doc.prefs.customCommands = this._customCommands;
        this._doc.prefs.builtInEditsByID = {};
        Object.entries(this._builtInCommands).forEach(entry => {
            if (entry[1] && Command.ToJSON(entry[1]) !== Command.ToJSON(builtInCommands[+entry[0] as keyof typeof builtInCommands])) {
                this._doc.prefs.builtInEditsByID[entry[0]] = entry[1];
            }
        });

        this._doc.prefs.save();
        this._editor.reloadShortcuts();
        this._close();
    }

    private _rebindStart = (key: number, html: HTMLElement, makeNew?: boolean, htmlExpanded?: boolean) => {
        if (!this._rebinding) {
            this._rebinding = {
                command: this._builtInCommands[key]!,
                cutIndex: this._getShortcutIndex(html).index,
                newCut: { keys: [], cursor: [] },
                html,
                htmlExpanded,
                timeout: 3
            };
            if (makeNew) { this._rebinding.makeNew = true; }

            this._rebindTick();
        }
    }

    private _rebindEnd = () => {
        if (this._rebinding) {
            // Handle confirmation. Deletes redundant shortcuts or confirms.
            if (this._rebinding.newCut.keys.length > 0 || (this._rebinding.newCut.cursor?.length ?? 0) > 0) {
                const hash = ShortcutHandler.toHash(this._rebinding.newCut);

                // Adds a new shortcut
                if (this._rebinding.makeNew) {
                    let cmdIndex = Object.values(this._builtInCommands).indexOf(this._rebinding.command);
                    if (cmdIndex === -1) { cmdIndex = this._customCommands.indexOf(this._rebinding.command); }
                    const buttonAdd = this._renderAddShortcutButton(cmdIndex, this._rebinding.command, this._rebinding.htmlExpanded);

                    // Revert change when new shortcut == an old one
                    if (this._rebinding.command.Shortcuts.some(cut => hash === ShortcutHandler.toHash(cut))) {
                        this._rebinding.html.parentElement!.parentElement!.replaceChildren(buttonAdd);
                    }
                    // Replace shortcut with a new one and push an add button only for expanded view
                    else {
                        this._rebinding.command.Shortcuts.push(this._rebinding.newCut);
                        this._rebinding.html.replaceChildren(this._renderOneShortcut(this._rebinding.newCut));
                        if (this._rebinding.htmlExpanded) {
                            this._rebinding.html.closest('.shortcutArray')!.appendChild(buttonAdd);
                        }
                    }
                }
                // Edits a shortcut
                else {
                    if (this._rebinding.command.Shortcuts.some((cut, index) =>
                        index !== this._rebinding?.cutIndex && hash === ShortcutHandler.toHash(cut)))
                    {
                        if (this._rebinding.htmlExpanded) { this._rebinding.html.parentElement!.parentElement!.remove(); }
                        else { this._rebinding.html.remove(); }
                        this._rebinding.command.Shortcuts.splice(this._rebinding.cutIndex, 1);
                    } else {
                        this._rebinding.command.Shortcuts[this._rebinding.cutIndex].keys = this._rebinding.newCut.keys;
                        this._rebinding.command.Shortcuts[this._rebinding.cutIndex].cursor = this._rebinding.newCut.cursor;
                        this._rebinding.html.replaceChildren(this._renderOneShortcut(this._rebinding.command.Shortcuts[this._rebinding.cutIndex]));
                    }
                }
            } else {
                this._rebinding.html.replaceChildren(this._renderOneShortcut(this._rebinding.command.Shortcuts[this._rebinding.cutIndex]));
            }

            window.clearTimeout(this._rebinding.timeoutIndex);
            this._rebinding = undefined;
        }
    }

    private _rebindResetTimer = () => {
        if (this._rebinding) {
            this._rebinding.timeout = 3;
            window.clearTimeout(this._rebinding.timeoutIndex);
            this._rebindTick();
        }
    }

    private _rebindTick = () => {
        if (this._rebinding) {
            if (this._rebinding.timeout <= 0) {
                this._rebindEnd();
            } else {
                if (this._rebinding.newCut.keys.length !== 0 || (this._rebinding.newCut.cursor?.length ?? 0) !== 0) {
                    this._rebinding.html.replaceChildren(this._renderOneShortcut(this._rebinding.newCut), `...${this._rebinding.timeout}s`);
                } else {
                    this._rebinding.html.replaceChildren(`Recording input...${this._rebinding.timeout}s`);
                }
                
                this._rebinding.timeoutIndex = window.setTimeout(this._rebindTick, 1000);
                this._rebinding.timeout--;
            }
        }
    }

    public isRebinding = () => this._rebinding !== undefined;

    private _renderCommand = (isBuiltIn: boolean, key: number, expanded?: boolean): HTMLDivElement => {
        const command = isBuiltIn ? this._builtInCommands[key]! : this._customCommands[key];
        const expandStatus = expanded ? "▸ " : "▾ ";
        const commandExpandButton = button({ class: "commandExpandButton" }, expandStatus + command.Name);
        const commandExpandContents = span();

        const renderExpandZone = () => {
            if (commandExpandButton.textContent?.startsWith("▸")) {
                commandExpandButton.replaceChildren("▾ " + command.Name);
                commandExpandContents.replaceChildren(this._renderExpanded(key, command));
            } else {
                commandExpandButton.replaceChildren("▸ " + command.Name);
                commandExpandContents.replaceChildren(...this._renderCollapsed(isBuiltIn, key, command));
            }
        };

        commandExpandButton.addEventListener("click", renderExpandZone);
        renderExpandZone();

        return div({ class: 'commandGroup' }, commandExpandButton, commandExpandContents );
    }

    private _renderCollapsed = (isBuiltIn: boolean, key: number, command: Command) => {
        const results: (string | Node)[] = [];
        const keybinds: HTMLSpanElement[] = [];
        if (isBuiltIn) {
            const targetDropdown = select({ style: "display: inline; min-width: 10rem;" },
                ...Object.entries(targets).map(entry => (entry[0] === String(this._builtInCommands[key]?.Target))
                    ? option({ value: entry[0], selected: true }, entry[1].name)
                    : option({ value: entry[0] }, entry[1].name))
            );

            targetDropdown.addEventListener("change", () => {
                command.Target = (+(targetDropdown.selectedOptions.item(0)!).value);
            });

            results.push(targetDropdown);
        }

        command.Shortcuts.forEach(shortcut => {
            const keybind = this._renderOneShortcut(shortcut, "shortcutGroup");
            keybind.addEventListener("click", () => this._rebindStart(key, keybind));

            keybinds.push(keybind);
        });

        if (keybinds.length > 0) {
            results.push(span({ class: 'shortcutArray' }, keybinds));
        } else {
            results.push(this._renderAddShortcutButton(key, command, false));
        }

        return results;
    }

    private _renderExpanded = (key: number, command: Command) => {
        const shortcuts = command.Shortcuts.map(shortcut => this._renderShortcutGroup(shortcut, key, command));
        shortcuts.push(this._renderAddShortcutButton(key, command, true));
        return div({ class: 'shortcutGroupOuter shortcutArray' }, ...shortcuts);
    }

    private _renderOneShortcut = (shortcut: IShortcut, className?: string) => {
        return span({ class: className ?? "" }, ShowCut(shortcut, "html"));
    }

    /** Child # in container == shortcut index */
    private _getShortcutIndex = (descendent: HTMLElement) => {
        let group = descendent.closest('.shortcutArray')!;
        let cutIndex = 0;

        for (let i = 0; i < group.children.length; i++) {
            if (group.children.item(i)?.contains(descendent)) {
                cutIndex = i;
                break;
            }
        }

        return {
            index: cutIndex,
            group,
            isLast: cutIndex === group.children.length - 1
        };
    }

    private _renderShortcutGroup = (shortcut: IShortcut, key: number, command: Command) => {
        const keyEntry = span();
        const keyEntryAndDelete = span();
        const keybind = this._renderOneShortcut(shortcut, "shortcutGroup");
        keybind.addEventListener("click", () => {
            this._rebindStart(key, keybind, this._getShortcutIndex(keyEntry).isLast, true);
        });

        const keybind_delete = button({ style: 'color: red; margin: 0 0 1em 1em;' }, '✖');
        const keybind_fireImmediate = input({ class: "wideCheckbox", type: "checkbox",
            checked: shortcut.invokeOptions === InvokeOptions.Early });
        const keybind_freeform = input({ class: "wideCheckbox", type: "checkbox",
            checked: shortcut.freeformEntry === true });
        const keybind_keypressOnly = input({ class: "wideCheckbox", type: "checkbox",
            checked: shortcut.invokeOptions === InvokeOptions.LastKeypress });
        const keybind_repeat = input({ class: "wideCheckbox", type: "checkbox",
            checked: shortcut.repeat === true });

        keybind_delete.addEventListener("click", () => {
            const info = this._getShortcutIndex(keyEntry);

            // Delete unless last item, which is "new shortcut"
            if (info.index !== info.group.children.length - 1) {
                keyEntryAndDelete.remove();
                command.Shortcuts.splice(info.index, 1);
            }
        });

        keybind_fireImmediate.addEventListener("change", () => {
            if (keybind_fireImmediate.checked) {
                shortcut.invokeOptions = InvokeOptions.Early;
            } else if (shortcut.invokeOptions === InvokeOptions.Early) {
                shortcut.invokeOptions = undefined;
            }
        });

        keybind_freeform.addEventListener("change", () => {
            shortcut.freeformEntry = keybind_freeform.checked ? true : undefined;
        });

        keybind_repeat.addEventListener("change", () => {
            shortcut.repeat = keybind_repeat.checked ? true : undefined;
        });

        keybind_keypressOnly.addEventListener("change", () => {
            if (keybind_keypressOnly.checked) {
                shortcut.invokeOptions = InvokeOptions.LastKeypress;
            } else if (shortcut.invokeOptions === InvokeOptions.LastKeypress) {
                shortcut.invokeOptions = undefined;
            }
        });

        keyEntry.append(keybind,
            div({}, keybind_fireImmediate, 'fire immediately',
                keybind_freeform, 'freeform',
                keybind_keypressOnly, 'keypress only',
                keybind_repeat, 'repeat'));

        // Argument data textbox and feedback, if allowable
        if (targets[command.Target].params.length > 0) {
            const argumentDataBox = textarea({
                class: "argumentData",
                placeholder: "Inputs separated by pressing enter. Types: " + targets[command.Target].params.map(p => this._getArgTypeText(p)).join(", ")
            });

            const args = shortcut.argumentData?.map(o => (o.metadata ? `${o.metadata} ` : '') + o.value).join('\n');
            if (args !== undefined && args !== "") {
                argumentDataBox.append(args);
            }

            const argsFeedback = div();
            const updateLogic = (showForInfo: boolean) => {
                const argNumber = argumentDataBox.value.slice(0, argumentDataBox.selectionStart).split('\n').length - 1;
                const report = this._getArgReport(command, argumentDataBox.value ?? "", argNumber);
                const html: HTMLDivElement[] = [];
                if (report.warn !== "") { html.push(div({ style: "shortcutArgReport" }, '⚠️ ' + report.warn)); }
                else if (report.arguments.length !== 0) { // Only contains args if valid and finished
                    shortcut.argumentData = report.arguments;
                }
                if (report.info !== "") { html.push(div({ class: "shortcutArgReport" }, 'ℹ️ ' + report.info)); }

                argsFeedback.replaceChildren(...html);
                argsFeedback.style.display = (report.warn !== "" || (showForInfo && report.info !== "")) ? "" : "none";
            };

            // All these events are to track caret changes; the alternative is setTimeout but that has a higher
            // chance of becoming a memory leak. When the command collapses again, this gets garbage collected.
            argumentDataBox.addEventListener("focus", () => updateLogic(false));
            argumentDataBox.addEventListener("click", () => updateLogic(true));
            argumentDataBox.addEventListener("mouseup", () => updateLogic(true));
            argumentDataBox.addEventListener("keyup", () => updateLogic(true));
            argumentDataBox.addEventListener("paste", () => updateLogic(true));
            argumentDataBox.addEventListener("cut", () => updateLogic(true));
            argumentDataBox.addEventListener("drop", () => updateLogic(true));
            argumentDataBox.addEventListener("input", () => updateLogic(true));

            keyEntry.appendChild(argumentDataBox);
            keyEntry.appendChild(argsFeedback);
        }

        keyEntryAndDelete.append(keybind_delete, keyEntry);
        return keyEntryAndDelete;
    }

    private _renderAddShortcutButton = (key: number, command: Command, isExpanded?: boolean) => {
        if (isExpanded) {
            return this._renderShortcutGroup({ keys: ['Add Shortcut'] }, key, command);
        }
        
        const unbound = button({ class: 'shortcutUnbound' }, "Unbound");
            unbound.addEventListener("click", () => {
                this._rebindStart(key, unbound, true);
            });
            
        return span({ class: 'shortcutArray shortcutEntry' }, unbound);
    }

    private _getArgTypeText = (param: Param | ParamNum): string => {
        switch (param.type) {
            case CommandActionDataType.Bool: return "true or false"
            case CommandActionDataType.Number: return ((param as ParamNum).isInt ? "whole number" : "number")
            case CommandActionDataType.String: return "text"
            default: param satisfies never;
        }
        return ""
    }
    
    private _getArgReport = (command: Command, data: string, currentArg: number): argReport => {
        const args = data.split('\n');
        const params = targets[command.Target].params;
        const result: argReport = { info: "", warn: "", arguments: [] };

        // Exit if no arguments
        if (params.length === 0) {
            if (args.length !== 0) {
                result.warn = `There should be no inputs for this command.`;
            }
            return result;
        }

        // Info for length and arg types
        if (args.length > params.length) {
            result.warn = `Too many inputs. Remove ${args.length - params.length} of them.`;
        } else {
            if (args.length < params.length) {
                result.warn = data === ""
                    ? 'no inputs provided.'
                    : `${args.length} of ${params.length} inputs provided.`;
            }
            result.info = `(input ${currentArg + 1}/${params.length}). `
                + (params[currentArg].hint !== "" ? params[currentArg].hint + " " : "")
                + '(' + this._getArgTypeText(params[currentArg]) + ')';
        }

        // If still valid, runs full validation to the first failing one for existing args
        if (result.warn === '') {
            for (let i = 0; i < args.length; i++) {
                let test: CommandArgument = { value: args[i] };

                // For strings, separate metadata (first) from data (second) on first space.
                // If no metadata is given, assume set.
                if (params[i].type === CommandActionDataType.Number) {
                    const parts = args[i].split(' ');
                    if (parts.length > 1) {
                        test.value = parts.slice(1).join('');
                        test.metadata = parts[0];
                    }
                }

                if (!isArgumentValid(params[i], test)) {
                    if (params[i].type === CommandActionDataType.Bool) {
                        result.warn = `Line #${i+1}: Should be true, false, or toggle.`;
                    } else {
                        result.warn = `Line #${i+1}: Not valid. Expected type: ${this._getArgTypeText(params[i])}.`;
                    }

                    result.arguments = [];
                    break;
                }

                result.arguments.push(test);
            }
        }

        return result;
    }
}