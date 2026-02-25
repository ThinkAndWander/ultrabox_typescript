import { HTML } from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
import { Prompt } from "./Prompt";
import { BuiltInLookup, Command, IShortcut, builtInCommands } from "./Commands";

const {button, div, h2 } = HTML;

export class ShortcutsAndCommandsPrompt implements Prompt {
    private _builtInCommands: Command[] = [];
	private _customCommands: Command[] = [];
	private _builtInEditsByID: BuiltInLookup = {};
	private _rebinding: IShortcut | undefined;

	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
	private readonly _okayButton: HTMLButtonElement = button({class: "okayButton", style: "width:45%;"}, "Okay");
	private readonly _resetButton: HTMLButtonElement = button({ style: "height: auto; margin: 1em;" }, "Reset all");
	private _shortcutContainer: HTMLDivElement = div();

	public readonly container: HTMLDivElement = div({ class: "prompt noSelection shortcutPrompt", style: "width: 600px; text-align: right; max-height: 90%;" },
        h2({ style: "align-self: center;" }, "Shortcuts and Commands"),
        div({ style: "display: grid; overflow-y: auto; overflow-x: hidden; flex-shrink: 1;" },
            this._shortcutContainer,
        ),
        div({ style: "display: flex; flex-direction: row-reverse; justify-content: space-between;" },
            this._okayButton,
        ),
        this._cancelButton,
    );

	constructor(private _doc: SongDocument) {
		this._resetToDefaults();
		this._okayButton.addEventListener("click", this._confirm);
		this._cancelButton.addEventListener("click", this._close);
		this._resetButton.addEventListener("click", this._resetToDefaults);
		this.container.addEventListener("keydown", this._onKeyDown);
		this.container.addEventListener("keyup", this._onKeyUp);
	}

	private _resetToDefaults = (): void => {
		// Deep copies for safety
		this._builtInEditsByID = Command.FromJSONLookup(Command.ToJSONLookup(this._doc.prefs.builtInEditsByID));
		this._customCommands = Command.FromJSONArray(Command.ToJSONArray(this._doc.prefs.customCommands));

        // The loaded built-ins are all the custom ones (when available), else the built-ins if custom isn't null.
        // Custom entries set to null indicate the built-in was disabled.
        this._builtInCommands = [];
        Object.entries(builtInCommands).forEach(entry => {
            const key = entry[0] as unknown as keyof typeof builtInCommands;
            if (this._builtInEditsByID[key] !== null) {
                this._builtInCommands[key] = this._builtInEditsByID[key] === undefined
                    ? entry[1] : this._builtInEditsByID[key] as Command;
            }
        });
	}

	private _onKeyDown = (event: KeyboardEvent): void => {
		// Record inputs while rebinding.
		if (this._rebinding !== undefined) {
			if (!this._rebinding.keys.includes(event.key)) {
				this._rebinding.keys.push(event.key);
				this._renderShortcuts();
			}
		}

		// Press enter any time to store changes.
        else if (event.key == "Enter") {
            this._confirm();
        }
    }

	private _onKeyUp = (event: KeyboardEvent): void => {
		if (this._rebinding !== undefined) {
			// TODO: if there are no changes, assign the rebound key now.
			this._rebinding = undefined;
		}
	}
		
	private _close = (): void => { 
		this._doc.undo();
	}
		
	public cleanUp = (): void => {
		this._okayButton.removeEventListener("click", this._confirm);
		this._cancelButton.removeEventListener("click", this._close);
		this._resetButton.removeEventListener("click", this._resetToDefaults);
		this.container.removeEventListener("keydown", this._onKeyDown);
		this.container.removeEventListener("keyup", this._onKeyUp);
	}
		
	private _confirm = (): void => {
		this._doc.prefs.customCommands = this._customCommands;
		this._doc.prefs.builtInEditsByID = this._builtInEditsByID;
		this._doc.prefs.save();
        // TODO: signal back to instantiating doc to fire setCommands for its shortcut handler with new commands
		this._close();
	}

	private _renderShortcuts = (): void => {
        this._shortcutContainer.replaceChildren();

        // Render built-in first, then custom
        //for (const cmd in this._builtInEditsByID)
    }
}