import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { Command, CommandTargetName, ShowCut, builtInCommands, targets } from "./Commands";
import { SongEditor } from "./SongEditor";

const { button, div, h2, input } = HTML;

export let lastExecutedCommand: Command | undefined;
export class CommandPalette implements Prompt {
    private static readonly searchCutoff = 12;
    private _hasRun = false;
    private _chosenCommand: Command | undefined;
    private _trayItems: Command[] = [];
    private _allCommands: Command[] = [];

    private readonly _searchbox = input({ class: "paletteSearchbox", type: "text", placeholder: "🔍 Search..." })
    private readonly _searchTray = div({ class: "paletteTray", style: "display: none;" });
    private readonly _doneButton: HTMLButtonElement = button({ style: "display: inline", class: "okayButton" });
    public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 20rem; text-align: right; max-height: 90%; margin-top: 10rem;" },
        h2({ style: "align-self: center;" }, "Run"),
        div({ style: "display: flex; justify-content: center; width: 20rem; margin-top: 0; max-height: 4rem;" },
            this._searchbox,
            this._searchTray,
            this._doneButton
        ),
        div({ class: "paletteHint" }, ShowCut({ keys: ['Shift', 'Enter'] }, "html"), " invoke repeatedly")
    );

    constructor(private _editor: SongEditor, private _doc: SongDocument) {
        this._doneButton.addEventListener("click", this._close);
        this.container.addEventListener("keydown", this.onKeyDown);
        this._searchbox.addEventListener("input", this._onInput);
        window.requestAnimationFrame(this._render);

        // Populates available commands with edited built-in definitions + custom commands.
        Object.entries(builtInCommands).forEach(entry => {
            const key = entry[0] as unknown as keyof typeof builtInCommands;
            if (this._doc.prefs.builtInEditsByID[key] !== null) {
                this._allCommands[key] = this._doc.prefs.builtInEditsByID[key] === undefined
                    ? entry[1] : this._doc.prefs.builtInEditsByID[key] as Command;
            }
        });
        this._allCommands.concat(this._doc.prefs.customCommands);
        this._allCommands = this._allCommands.filter(o =>
            (o.Target !== CommandTargetName.RunCommand && o.Target !== CommandTargetName.RepeatLastCommand) &&
            (targets[o.Target].params.length === 0 || o.ArgumentData));
        this._allCommands.sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
    }

    private _render = (): void => {
        // Restore last executed command on re-opening.
        if (lastExecutedCommand) {
            this._chosenCommand = lastExecutedCommand;
            this._searchbox.value = this._chosenCommand.Name;
            this._searchbox.setSelectionRange(0, this._searchbox.value.length);
            this._renderTrayItems();
        }

        this._searchbox.focus();
    }

    private _renderTrayItems = () => {
            this._trayItems = [];
            const newItems: [HTMLElement, Command][] = [];
            const noFilter = !this._searchbox.value || this._searchbox.value.trim() === "";
            const lowercaseQuery = (this._searchbox.value.trim() ?? "").toLowerCase();

            const itemsExact: Command[] = [];
            const itemsStartsWith: Command[] = [];
            const itemsContains: Command[] = [];
            const itemsIncludes: Command[] = [];

            this._searchTray.style.display = "";

            if (noFilter) {
                for (let i = 0; i < this._allCommands.length && i < CommandPalette.searchCutoff; i++) {
                    newItems.push([this._renderTrayItem(this._allCommands[i]), this._allCommands[i]]);
                    this._trayItems.push(this._allCommands[i]);
                }
            } else {
                let lowercaseMatch: string;

                this._allCommands.forEach(entry => {
                    lowercaseMatch = entry.Name.toLowerCase();

                    if (lowercaseQuery === lowercaseMatch) {
                        itemsExact.push(entry);
                    } else if (lowercaseMatch.startsWith(lowercaseQuery)) {
                        itemsStartsWith.push(entry);
                    } else if (lowercaseMatch.includes(lowercaseQuery)) {
                        itemsContains.push(entry);
                    } else if (lowercaseMatch.split(' ').some(word => lowercaseQuery.includes(word))) {
                        itemsIncludes.push(entry);
                    }
                });

                [itemsExact, itemsStartsWith, itemsContains, itemsIncludes].every(list => {
                    list.sort();

                    for (let i = 0; i < list.length && this._trayItems.length < CommandPalette.searchCutoff; i++) {
                        this._trayItems.push(list[i]);
                        newItems.push([this._renderTrayItem(list[i]), list[i]]);
                    }

                    return this._trayItems.length < CommandPalette.searchCutoff;
                });
            }

            this._searchTray.replaceChildren(...newItems.map(o => o[0]));
    }

    private _renderTrayItem = (command: Command) => {
        const buttonElements: (Node | string)[] = [command.Name];

        // Find shortest shortcut and append that if it exists.
        let shortestIndex = -1, shortest = 999;
        command.Shortcuts.forEach((entry, index) => {
            const length = entry.keys.length + (entry.cursor ?? []).length;
            if (length < shortest) {
                shortestIndex = index;
                shortest = length;
            }
        });

        if (shortestIndex !== -1) {
            buttonElements.push(ShowCut(command.Shortcuts[shortestIndex], "html"));
        }

        const newButton = button({ class: 'paletteEntry'}, buttonElements);
        newButton.addEventListener("click", () => this._selectTrayItem(command));
        return newButton;
    }

    private _selectTrayItem = (command: Command) => {
        this._chosenCommand = command;
        this._searchbox.value = command.Name;
        this._searchTray.style.display = "none";
        this._searchbox.focus();
    }

    private _getIndexOfActiveTrayItem = (): number => {
        if (this._searchTray.contains(document.activeElement)) {
            for (let i = 0; i < this._searchTray.children.length; i++) {
                if (document.activeElement === this._searchTray.children.item(i)) {
                    return i;
                }
            }
        }
        return -1;
    }

    public onKeyDown = (event: KeyboardEvent): void => {
        if (event.key == "Enter") {
            if (this._searchTray.style.display !== "none") {
                // Search tray is open with a button focused. Enter selects it. 
                if (this._searchTray.contains(document.activeElement)) {
                    const index = this._getIndexOfActiveTrayItem();
                    if (index !== -1) { this._selectTrayItem(this._trayItems[index]); }
                }
                else {
                    // Search tray is open/unfocused and we haven't matched the command yet. Match it or first and handle Enter / Shift+Enter.
                    if (!this._chosenCommand || this._chosenCommand === lastExecutedCommand) {
                        const match = this._trayItems.findIndex(o => o.Name.toLowerCase() === this._searchbox.value.trim().toLowerCase());
                        this._chosenCommand = this._trayItems[match !== -1 ? match : 0];
                        this._close();
                    } else if (event.shiftKey) {
                        this._perform();
                    } else {
                        this._close();
                    }
                }
            }
            // Search tray is closed. Respond to Enter and Shift+Enter.
            else {
                if (event.shiftKey) { this._perform(); }
                else { this._close(); }
            }
        }
        else if (event.key === "Escape") {
            if (this._searchTray.style.display !== "none") {
                this._searchTray.style.display = "none";
                this._searchbox.focus();
            } else {
                this._doc.openPrompt(null);
            }
        } else if (event.key === "ArrowDown") {
            if (this._searchTray.style.display === "none") {
                if (this._searchTray.children.length === 0) {
                    this._renderTrayItems();
                } else {
                    this._searchTray.style.display = "";
                }
                (this._searchTray.firstElementChild as HTMLButtonElement)?.focus();
            } else {
                const index = this._getIndexOfActiveTrayItem();
                if (index !== -1 && index < this._trayItems.length - 1) {
                    this._chosenCommand = this._trayItems[index + 1];
                    this._searchbox.value = this._chosenCommand.Name;
                    (this._searchTray.children.item(index + 1) as HTMLButtonElement)?.focus();
                } else if (index === -1) {
                    (this._searchTray.firstElementChild as HTMLButtonElement)?.focus();
                }
            }
        } else if (event.key === "ArrowUp") {
            if (this._searchTray.style.display !== "none") {
                const index = this._getIndexOfActiveTrayItem();
                if (index !== -1 && index > 0) {
                    this._chosenCommand = this._trayItems[index - 1];
                    this._searchbox.value = this._chosenCommand.Name;
                    (this._searchTray.children.item(index - 1) as HTMLButtonElement)?.focus();
                } else if (index === 0) {
                    this._searchbox.focus();
                }
            }
        }

        // Avoid jumping around with arrowkeys and space (comma or slash, etc.)
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' &&
            (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key.length === 1 /* space comma slash etc. */))
        {
            event.preventDefault();
        }

        event.stopImmediatePropagation();
    }

    private _onInput = (): void => {
        this._renderTrayItems();
    }

    private _close = (): void => {
        this._doc.openPrompt(null); // set null *before* the command so prompt-opening commands still work.
        if (!this._hasRun) {
            this._perform();
        }
    }

    public cleanUp = (): void => {
        this._doneButton.removeEventListener("click", this._close);
        this.container.removeEventListener("keydown", this.onKeyDown);
        this._searchbox.removeEventListener("change", this._onInput);
        this.container.replaceChildren();
    }

    private _perform = (): void => {
        if (this._chosenCommand) {
            this._editor.handleCommand(this._chosenCommand);
            lastExecutedCommand = this._chosenCommand;
            this._hasRun = true;
        }
    }
}