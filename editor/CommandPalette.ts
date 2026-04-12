import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { Command, CommandTargetName, IShortcut, ShowCut, builtInCommands, targets } from "./Commands";
import { SongEditor } from "./SongEditor";

const { button, div, h2, input } = HTML;
type trayItem = { command: Command, shortcut?: IShortcut }

export let lastExecuted: trayItem | undefined;
export class CommandPalette implements Prompt {
    private static readonly searchCutoff = 12;
    private _hasRun = false;
    private _trayItems: trayItem[] = [];
    private _chosen: { command?: Command, shortcut?: IShortcut } = {};
    private _allEntries: trayItem[] = [];

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
            if (entry[1].Target === CommandTargetName.RunCommand || entry[1].Target === CommandTargetName.RepeatLastCommand) { return; }
            const key = entry[0] as unknown as keyof typeof builtInCommands;
            if (this._doc.prefs.builtInEditsByID[key] !== null) {
                const command = this._doc.prefs.builtInEditsByID[key] ?? entry[1];

                if (targets[command.Target].params.length === 0) {
                    this._allEntries.push({ command });
                }
                for (let i = 0; i < command.Shortcuts.length; i++) {
                    if (command.Shortcuts[i].name) {
                        this._allEntries.push({ command, shortcut: command.Shortcuts[i] });
                    }
                }
            }
        });

        this._doc.prefs.customCommands.forEach(command => {
            if (command.Target === CommandTargetName.RunCommand || command.Target === CommandTargetName.RepeatLastCommand) { return; }
            if (targets[command.Target].params.length === 0) {
                this._allEntries.push({ command });
            }
            for (let i = 0; i < command.Shortcuts.length; i++) {
                if (command.Shortcuts[i].name) {
                    this._allEntries.push({ command, shortcut: command.Shortcuts[i] });
                }
            }
        })

        this._allEntries.sort((a, b) => (a.shortcut?.name ?? a.command.Name).toLowerCase()
            .localeCompare((b.shortcut?.name ?? b.command.Name).toLowerCase()));
    }

    private _render = (): void => {
        // Restore last executed command on re-opening.
        if (lastExecuted?.command) {
            this._chosen = { ...lastExecuted };
            this._searchbox.value = lastExecuted.shortcut?.name ?? lastExecuted.command.Name;
            this._searchbox.setSelectionRange(0, this._searchbox.value.length);
            this._renderTrayItems();
        }

        this._searchbox.focus();
    }

    private _renderTrayItems = () => {
            this._trayItems = [];
            const newItems: [HTMLElement, trayItem][] = [];
            const noFilter = !this._searchbox.value || this._searchbox.value.trim() === "";
            const lowercaseQuery = (this._searchbox.value.trim() ?? "").toLowerCase();

            const itemsExact: trayItem[] = [];
            const itemsStartsWith: trayItem[] = [];
            const itemsContains: trayItem[] = [];
            const itemsIncludes: trayItem[] = [];

            this._searchTray.style.display = "";

            if (noFilter) {
                for (let i = 0; i < this._allEntries.length && i < CommandPalette.searchCutoff; i++) {
                    newItems.push([this._renderTrayItem(this._allEntries[i]), this._allEntries[i]]);
                    this._trayItems.push(this._allEntries[i]);
                }
            } else {
                let lowercaseMatch: string;

                this._allEntries.forEach(entry => {
                    lowercaseMatch = (entry.shortcut?.name ?? entry.command.Name).toLowerCase();

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
                    list.sort((a, b) => (a.shortcut?.name ?? a.command?.Name)
                        .localeCompare(b.shortcut?.name ?? b.command?.Name));

                    for (let i = 0; i < list.length && this._trayItems.length < CommandPalette.searchCutoff; i++) {
                        this._trayItems.push(list[i]);
                        newItems.push([this._renderTrayItem(list[i]), list[i]]);
                    }

                    return this._trayItems.length < CommandPalette.searchCutoff;
                });
            }

            this._searchTray.replaceChildren(...newItems.map(o => o[0]));
    }

    private _renderTrayItem = (item: trayItem) => {
        const buttonElements: (Node | string)[] = [item.shortcut?.name ?? item.command.Name];

        // Use the shortcut or find shortest shortcut and append that if it exists.
        if (item.shortcut) {
            buttonElements.push(ShowCut(item.shortcut, "html"));
        } else {
            let shortestIndex = -1, shortest = 999;
            item.command.Shortcuts.forEach((entry, index) => {
                const length = entry.keys.length + (entry.cursor ?? []).length;
                if (length < shortest) {
                    shortestIndex = index;
                    shortest = length;
                }
            });

            if (shortestIndex !== -1) {
                buttonElements.push(ShowCut(item.command.Shortcuts[shortestIndex], "html"));
            }
        }
        

        const newButton = button({ class: 'paletteEntry'}, buttonElements);
        newButton.addEventListener("click", () => this._selectTrayItem(item));
        return newButton;
    }

    private _selectTrayItem = (item: trayItem) => {
        this._chosen = {...item};
        this._searchbox.value = item.shortcut?.name ?? item.command.Name;
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
                    if (!this._chosen.command || (this._chosen.command === lastExecuted?.command && this._chosen.shortcut === lastExecuted.shortcut)) {
                        const match = this._trayItems.findIndex(o => (o.shortcut?.name ?? o.command.Name).toLowerCase() === this._searchbox.value.trim().toLowerCase());
                        this._chosen = {...this._trayItems[match !== -1 ? match : 0]};
                        this._close();
                    } else if (event.shiftKey && !(this._chosen.shortcut?.freeformEntry)) {
                        this._perform();
                    } else {
                        this._close();
                    }
                }
            }
            // Search tray is closed. Respond to Enter and Shift+Enter.
            else {
                if (event.shiftKey && !(this._chosen.shortcut?.freeformEntry)) { this._perform(); }
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
                    this._chosen = {...this._trayItems[index + 1]};
                    this._searchbox.value = this._chosen.shortcut?.name ?? this._chosen.command!.Name;
                    (this._searchTray.children.item(index + 1) as HTMLButtonElement)?.focus();
                } else if (index === -1) {
                    (this._searchTray.firstElementChild as HTMLButtonElement)?.focus();
                }
            }
        } else if (event.key === "ArrowUp") {
            if (this._searchTray.style.display !== "none") {
                const index = this._getIndexOfActiveTrayItem();
                if (index !== -1 && index > 0) {
                    this._chosen = {...this._trayItems[index - 1]};
                    this._searchbox.value = this._chosen.shortcut?.name ?? this._chosen.command!.Name;
                    (this._searchTray.children.item(index - 1) as HTMLButtonElement)?.focus();
                } else if (index === 0) {
                    this._searchbox.focus();
                }
            }
        } else if (document.activeElement !== this._searchbox) {
            // Forward keys to the searchbox and refocus it if the user types when it's unfocused.
            if (event.key === "Backspace" || event.key === "Delete") {
                if (this._searchbox.selectionStart !== this._searchbox.selectionEnd) {
                    this._searchbox.value = 
                        this._searchbox.value.slice(0, this._searchbox.selectionStart ?? 0) +
                        this._searchbox.value.slice(this._searchbox.selectionEnd ?? this._searchbox.selectionStart ?? 0)
                } else { this._searchbox.value = this._searchbox.value.slice(0, -1); }
                this._searchbox.focus();
                this._renderTrayItems();
            } else if (event.key.length === 1) {
                this._searchbox.value += event.key;
                this._searchbox.focus();
                this._renderTrayItems();
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
        if (this._chosen.command) {

            if (this._chosen.shortcut?.freeformEntry) {
                this._editor.commandInvokeFreeform(this._chosen.command, this._chosen.shortcut);
            } else {
                this._editor.handleCommand(this._chosen.command, this._chosen.shortcut?.argumentData ?? this._chosen.command.ArgumentData);
            }
            
            lastExecuted = { command: this._chosen.command, shortcut: this._chosen.shortcut };
            this._hasRun = true;
        }
    }
}