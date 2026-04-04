import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { Command, builtInCommands } from "./Commands";
import { SongEditor } from "./SongEditor";

const { button, div, h2, input } = HTML;

let lastExecutedCommand: Command | undefined;
export class CommandPalette implements Prompt {
    private _chosenCommand: Command | undefined;
    private _trayItems: Command[] = [];

    private readonly _searchbox = input({ style: "display: inline; margin-right: 1rem; min-height: var(--button-size); min-width: 10rem; text-align: left;", type: "text", placeholder: "🔍 Search..." })
    private readonly _searchTray = div({ style: "display: none; position: absolute; top: 104px; left: 46px; min-width: 10rem; text-align: left; background-color: var(--ui-widget-background); border: 1px solid var(--ui-widget-focus);" });
    private readonly _doneButton: HTMLButtonElement = button({ style: "display: inline", class: "okayButton" });
    private readonly _runButton: HTMLButtonElement = button({ style: "display: inline" }, "Run");
    public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 16rem; text-align: right; max-height: 90%;" },
        h2({ style: "align-self: center;" }, "Run"),
        div({ style: "display: flex; justify-content: center; width: 16rem; max-height: 4rem;" },
            this._searchbox,
            this._searchTray,
            this._runButton,
            this._doneButton
        )
    );

    constructor(private _editor: SongEditor, private _doc: SongDocument) {
        this._doneButton.addEventListener("click", this._close);
        this._runButton.addEventListener("click", this._perform);
        this.container.addEventListener("keydown", this.onKeyDown);
        this._searchbox.addEventListener("input", this._onInput);
        window.requestAnimationFrame(this._render);
    }

    private _render = (): void => {
        this._searchbox.focus();
        if (lastExecutedCommand) {
            this._chosenCommand = lastExecutedCommand;
            this._searchbox.value = this._chosenCommand.Name;
            this._renderTrayItems();
        }
    }

    private _renderTrayItems = () => {
            this._trayItems = [];
            const newItems: [HTMLElement, Command][] = [];
            const noFilter = !this._searchbox.value || this._searchbox.value === "";
            const lowercaseQuery = (this._searchbox.value ?? "").toLowerCase();

            const itemsExact: [string, Command][] = [];
            const itemsStartsWith: [string, Command][] = [];
            const itemsContains: [string, Command][] = [];
            const itemsIncludes: [string, Command][] = [];

            this._searchTray.style.display = "";

            if (noFilter) {
                
                const all = Object.entries(builtInCommands);
                all.sort((a, b) => a[1].Name.toLowerCase().localeCompare(b[1].Name.toLowerCase()));

                for (let i = 0; i < all.length && i < 16; i++) {
                    const bttn = button({ style: 'display: block;'}, all[i][1].Name);
                    bttn.addEventListener("click", () => {
                        this._chosenCommand = all[i][1];
                        this._searchbox.value = all[i][1].Name;
                        this._searchTray.style.display = "none";
                        this._searchbox.focus();
                    });

                    newItems.push([bttn, all[i][1]]);
                    this._trayItems.push(all[i][1]);
                }
            } else {
                let lowercaseMatch: string;

                Object.entries(builtInCommands).forEach(entry => {
                    lowercaseMatch = entry[1].Name.toLowerCase();

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

                    for (let i = 0; i < list.length && i < 16; i++) {
                        this._trayItems.push(list[i][1]);

                        const bttn = button({ style: 'display: block;'}, list[i][1].Name);
                        bttn.addEventListener("click", () => {
                            this._chosenCommand = list[i][1];
                            this._searchbox.value = list[i][1].Name;
                            this._searchTray.style.display = "none";
                            this._searchbox.focus();
                        });

                        newItems.push([bttn, list[i][1]]);
                        if (this._trayItems.length === 16) { return false; }
                    }

                    return this._trayItems.length < 16;
                });
            }

            this._searchTray.replaceChildren(...newItems.map(o => o[0]));
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
        if (event.key == "Enter" && document.activeElement?.tagName !== "BUTTON") {
            if (this._searchTray.style.display !== "none") {
                const index = this._getIndexOfActiveTrayItem();
                if (index !== -1) {
                    this._chosenCommand = this._trayItems[index];
                    this._searchbox.value = this._chosenCommand.Name;
                    this._searchTray.style.display = "none";
                    this._searchbox.focus();
                }
            } else {
                this._close();
            }
        }
        else if (event.key === "Escape") {
            if (this._searchTray.style.display !== "none") {
                this._searchTray.style.display = "none";
                this._searchbox.focus();
            } else {
                this._close();
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
    }

    private _onInput = (): void => {
        this._renderTrayItems();
    }

    private _close = (): void => {
        this._editor.openPrompt(null);
    }

    public cleanUp = (): void => {
        this._doneButton.removeEventListener("click", this._close);
        this._runButton.removeEventListener("click", this._perform);
        this.container.removeEventListener("keydown", this.onKeyDown);
        this._searchbox.removeEventListener("change", this._onInput);
        this.container.replaceChildren();
    }

    private _perform = (): void => {
        if (this._chosenCommand) {
            this._editor.handleCommand(this._chosenCommand);
        }
    }
}