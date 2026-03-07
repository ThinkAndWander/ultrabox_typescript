import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { BuiltInLookup, Command, IShortcut, builtInCommands, ShowCut, CursorButtons, CommandTargetName } from "./Commands";
import { SongEditor } from "./SongEditor";

const {button, div, span, h2 } = HTML;

export class ShortcutsAndCommandsPrompt implements Prompt {
    private _builtInCommands: Command[] = [];
    private _customCommands: Command[] = [];
    private _builtInEditsByID: BuiltInLookup = {};
    private _rebinding: { command: Command, cutIndex: number, newCut: IShortcut, html: HTMLSpanElement, timeout: number, timeoutIndex?: number } | undefined;

    private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
    private readonly _okayButton: HTMLButtonElement = button({class: "okayButton", style: "width:45%;"}, "Okay");
    private readonly _resetButton: HTMLButtonElement = button({ style: "width:30%;" }, "Reset all");
    private _commandContainer: HTMLDivElement = div({ style: 'width: 550px; margin-right: 12px; text-align: left;'});

    public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 600px; text-align: right; max-height: 90%;" },
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
        this._builtInCommands = [];
        Object.entries(builtInCommands).forEach(entry => {
            const key = entry[0] as unknown as keyof typeof builtInCommands;
            if (this._builtInEditsByID[key] !== null) {
                this._builtInCommands[key] = withoutEdits || this._builtInEditsByID[key] === undefined
                    ? Command.FromJSON(Command.ToJSON(entry[1]))! : this._builtInEditsByID[key] as Command;
            }
        });

        this._render();
    }

    private _render = (): void => {
        const commands: HTMLDivElement[] = [];
        for (let i = 0; i < this._builtInCommands.length + this._customCommands.length; i++) {
            commands.push(this._renderCommand(i));
        }
        this._commandContainer.replaceChildren(...commands);
    }

    private _resetToDefault = (): void => {
        this._initDefaults(true);
    }

    public onKeyDown = (event: KeyboardEvent): void => {
        // Record inputs while rebinding.
        if (this._rebinding !== undefined) {
            if (!event.repeat && !this._rebinding.newCut.keys.includes(event.key.toLowerCase())) {
                this._rebinding.newCut.keys.push(event.key.toLowerCase());
                this._rebindResetTimer();
                event.preventDefault();
            }
        }

        // Confirm/close the window.
        else if (event.key == "Enter") {
            this._confirm();
        }
        else if (event.key === "Escape") {
            this._close();
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
        this._builtInCommands.forEach(cmd => {
            if (Command.ToJSON(cmd) !== Command.ToJSON(builtInCommands[cmd.Target as keyof typeof builtInCommands])) {
                this._doc.prefs.builtInEditsByID[cmd.Target] = cmd
            }
        });

        this._doc.prefs.save();
        this._editor.reloadShortcuts();
        this._close();
    }

    private _getCutHtml = (shortcut: IShortcut, className?: string) => {
        return span({ class: className }, ShowCut(shortcut, "html"));
    }

    private _rebindEnd = () => {
        if (this._rebinding) {
            // If confirmed, copy before clearing
            if (this._rebinding.newCut.keys.length > 0 || (this._rebinding.newCut.cursor?.length ?? 0) > 0) {
                this._rebinding.command.Shortcuts[this._rebinding.cutIndex].keys = this._rebinding.newCut.keys;
                this._rebinding.command.Shortcuts[this._rebinding.cutIndex].cursor = this._rebinding.newCut.cursor;
            }

            window.clearTimeout(this._rebinding.timeoutIndex);
            this._rebinding.html.replaceChildren(this._getCutHtml(this._rebinding.command.Shortcuts[this._rebinding.cutIndex]));
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
                    this._rebinding.html.replaceChildren(this._getCutHtml(this._rebinding.newCut), `...${this._rebinding.timeout}s`);
                } else {
                    this._rebinding.html.replaceChildren(`Recording input...${this._rebinding.timeout}s`);
                }
                
                this._rebinding.timeoutIndex = window.setTimeout(this._rebindTick, 1000);
                this._rebinding.timeout--;
            }
        }
    };

    public isRebinding = () => { return this._rebinding !== undefined; }

    private _renderCommand = (index: number): HTMLDivElement => {
        const isBuiltIn = index < this._builtInCommands.length;
        const command = isBuiltIn ? this._builtInCommands[index] : this._customCommands[index - this._builtInCommands.length];
        const shortcuts = command.Shortcuts.map(shortcut => this._getCutHtml(shortcut, "shortcutGroup"));

        for (let i = 0; i < shortcuts.length; i++) {
            shortcuts[i].addEventListener("click", () => {
                if (!this._rebinding) {
                    this._rebinding = {
                        command: this._builtInCommands[index],
                        cutIndex: i,
                        newCut: { keys: [], cursor: [] },
                        html: shortcuts[i],
                        timeout: 3
                    };

                    this._rebindTick();
                }
            });
        }

        return div({ class: 'commandGroup' },
            span({ class: 'commandListingName' }, this._builtInCommands[index].Name),
            ...shortcuts
        );
    }
}