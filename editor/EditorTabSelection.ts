import { ColorConfig } from "./ColorConfig";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Slider } from "./HTMLWrapper";
import { PatternEditor, SelectionMode } from "./PatternEditor";
import { SongDocument } from "./SongDocument";

const { button, div, label, input, option, select } = HTML;

type TipHandler = (tipName: string) => void;

/** This contains the controls for the Selection tab in the song editor. */
export class EditorTabSelection {
    public htmlEntryPoint: HTMLDivElement;

    private _doc: SongDocument;
    private _patternEditor: PatternEditor;
    private _selectionModeMoveLabel: HTMLDivElement;
    private _selectionModeStretchLabel : HTMLDivElement;
    private _selectionModeLabel : HTMLDivElement;
    private _merge : HTMLButtonElement;
    private _mergeAll : HTMLInputElement;
    private _bridge : HTMLButtonElement;
    private _bridgeBend : HTMLInputElement;
    private _spread : HTMLButtonElement;
    private _spreadPitch : HTMLInputElement;
    private _flatten : HTMLButtonElement;
    private _flattenPitch : HTMLInputElement;
    private _flattenVolume : HTMLInputElement;
    private _mirrorH : HTMLButtonElement;
    private _mirrorV : HTMLButtonElement;
    private _split : HTMLButtonElement;
    private _splitSlider : Slider;
    private _splitSliderInputBox : HTMLInputElement;
    private _splitDropdown: HTMLButtonElement;
    private _splitDropdownGroup: HTMLDivElement;
    private _splitAbsolute : HTMLInputElement;
    private _splitAcross : HTMLInputElement;
    private _splitLabel : HTMLDivElement;
    private _stepFunctionSelect: HTMLSelectElement;
    private _stepFunction : HTMLButtonElement;
	private _volDropdown: HTMLButtonElement;
	private _volDropdownGroup: HTMLDivElement;
	private _volLabel: HTMLDivElement;
	private _volUp: HTMLButtonElement;
	private _volDown: HTMLButtonElement;
	private _volFadeOut: HTMLButtonElement;
	private _volFadeIn: HTMLButtonElement;
	private _volGainEnd: HTMLButtonElement;
	private _volGainStart: HTMLButtonElement;
	private _volStudioFadeOut: HTMLButtonElement;
	private _volStudioFadeIn: HTMLButtonElement;
	private _volContrastMax: HTMLButtonElement;
	
    constructor(doc: SongDocument, patternEditor: PatternEditor, tipHandler: TipHandler) {
        this._doc = doc;
        this._patternEditor = patternEditor;
        this._constructHTML(tipHandler);
    }

    private _constructHTML(tipHandler: TipHandler) {
        const _selectionOpsDescription = div({ style: `padding: 3px 0; max-width: 15em; text-align: center; color: ${ColorConfig.secondaryText};` }, "Selection");
        this._selectionModeLabel = div({ style: `padding: 3px 0; color: ${ColorConfig.secondaryText};` }, "Move mode");
        const _selectionModeBtnMove = input({ type: "radio", name: "selection-mode-radio-group", class: "tab-settings-radio" });
        this._selectionModeMoveLabel = div({ class: "tab-settings-radio selected-tab" }, "↤");
        const _selectionModeBtnStretch = input({ type: "radio", name: "selection-mode-radio-group", class: "tab-settings-radio" });
        this._selectionModeStretchLabel = div({ class: "tab-settings-radio" }, "↔");
        const  _selectionModeButtonsGroup: HTMLDivElement = div({ class: "tab-settings-buttons-group", style: "margin-bottom: 0.4rem;" },
            div({ class: "tab-settings-radiodiv" }, _selectionModeBtnMove, this._selectionModeMoveLabel),
            div({ class: "tab-settings-radiodiv" }, _selectionModeBtnStretch, this._selectionModeStretchLabel)
        );
        this._merge = button({ class: "selectionOps-actionbutton noteOpMerge" });
        this._mergeAll = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._bridge = button({ class: "selectionOps-actionbutton noteOpBridge" });
        this._bridgeBend = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._spread = button({ class: "selectionOps-actionbutton noteOpSpread" });
        this._spreadPitch = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._mirrorH = button({ class: "selectionOps-actionbutton noteOpMirror" });
        this._mirrorV = button({ class: "selectionOps-actionbutton noteOpMirror", style: 'transform: rotate(90deg);' });
        this._flatten = button({ class: "selectionOps-actionbutton noteOpFlatten" });
        this._flattenPitch = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._flattenVolume = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._split = button({ class: "selectionOps-actionbutton noteOpSplit" });
        this._splitLabel = div({ class: "tip", onclick: () => tipHandler("selectionSplit") }, "");
        this._splitDropdown = button({ style: "height:1.5em; width: 10px; padding: 0px; font-size: 8px; margin-left: 0.2rem;" }, "▼");
		this._volLabel = div({ class: "tip", onclick: () => tipHandler("selectionVolOps") }, "vol");
		this._volDropdown = button({ style: "height:1.5em; width: 10px; padding: 0px; font-size: 8px; margin-left: 0.2rem;" }, "▼");
		this._volUp = button({ class: "selectionOps-actionbutton noteOpVolChange" });
		this._volDown = button({ class: "selectionOps-actionbutton noteOpVolChange", style: 'transform: scaleY(-1);' });
		this._volFadeOut = button({ class: "selectionOps-actionbutton noteOpVolFade" });
		this._volFadeIn = button({ class: "selectionOps-actionbutton noteOpVolFade", style: 'transform: scaleX(-1);' });
		this._volGainEnd = button({ class: "selectionOps-actionbutton noteOpVolGain" });
		this._volGainStart = button({ class: "selectionOps-actionbutton noteOpVolGain", style: 'transform: scaleX(-1);' });
		this._volStudioFadeOut = button({ class: "selectionOps-actionbutton noteOpVolCrossfade" });
		this._volStudioFadeIn = button({ class: "selectionOps-actionbutton noteOpVolCrossfade", style: 'transform: scaleX(-1);' });
		this._volContrastMax = button({ class: "selectionOps-actionbutton noteOpVolContrastMax" });

        this._stepFunctionSelect = select();
        (Object.keys(this._doc.selection.stepAcrossPresets) as (keyof typeof this._doc.selection.stepAcrossPresets)[])
            .forEach((key) => this._stepFunctionSelect.appendChild(option({value: key}, key)))
        this._stepFunction = button({ class: "selectionOps-actionbutton noteOpFunction" });

        this._splitSliderInputBox = input({ type: "number", step: "1", min: 1, max: Math.floor(this._doc.song.partsPerPattern / 2), value: "1" });
        this._splitSlider = new Slider(
            input({ title: "cuts", style: "width: 6rem; flex-grow: 1; margin-left: 0.5rem;", type: "range", min: "1", max: String(Math.floor(this._doc.song.partsPerPattern / 2)), value: "1", step: "1" }), this._doc, null, false);
        this._splitAcross = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._splitAbsolute = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._splitDropdownGroup = div({ class: "editor-controls", style: "display: none;" },
            div({ class: "selectionOps-row-inside"},
                this._splitSliderInputBox,
                this._splitSlider.container),
            div({ class: "selectionOps-row-inside"},
                label({ class: "checkbox-container" }, this._splitAcross, "Across"),
                label({ class: "checkbox-container" }, this._splitAbsolute, "Absolute")));

		this._volDropdownGroup = div({ class: "editor-controls", style: "display: none;" },
            div({ class: "selectionOps-action"},
                this. _volGainEnd,
				this._volGainStart,
				this._volStudioFadeOut,
				this._volStudioFadeIn,
				this._volContrastMax));

        const _selectionOps = [
            div({ class: "selectionOps-action"},
                this._merge,
                div({ class: "tip", onclick: () => tipHandler("selectionMerge") }, "Merge"),
                label({ class: "checkbox-container" }, this._mergeAll, "All")),
            div({ class: "selectionOps-action"},
                this._bridge,
                div({ class: "tip", onclick: () => tipHandler("selectionBridge") }, "Bridge"),
                label({ class: "checkbox-container" }, this._bridgeBend, "Bend")),
            div({ class: "selectionOps-action"},
                this._spread,
                div({ class: "tip", onclick: () => tipHandler("selectionSpread") }, "Spread"),
                label({ class: "checkbox-container" }, this._spreadPitch, "Pitch")),
            div({ class: "selectionOps-action"},
                this._mirrorH,
                this._mirrorV,
                div({ class: "tip", onclick: () => tipHandler("selectionMirror") }, "Mirror")),
            div({ class: "selectionOps-action"},
                this._flatten,
                div({ class: "tip", onclick: () => tipHandler("selectionFlatten") }, "Flatten"),
                label({ class: "checkbox-container" }, this._flattenPitch, "Pitch"),
                label({ class: "checkbox-container" }, this._flattenVolume, "Vol")),
            div({ class: "selectionOps-action"},
                this._split,
                this._splitLabel,
                this._splitDropdown),
            this._splitDropdownGroup,
			div({ class: "selectionOps-action"},
                this._volUp,
                this._volDown,
				this._volFadeOut,
				this._volFadeIn,
				this._volLabel,
                this._volDropdown),
			this._volDropdownGroup,
            div({ class: "selectionOps-action"},
                this._stepFunction,
                div({ class: "tip", onclick: () => tipHandler("selectionFunction") }, "Function"),
                div({ class: "selectContainer" }, this._stepFunctionSelect)
            )
        ];

        _selectionModeBtnMove.addEventListener("change", () => this._whenSelectionModeChanged(SelectionMode.Move));
        _selectionModeBtnStretch.addEventListener("change", () => this._whenSelectionModeChanged(SelectionMode.Stretch));
        this._splitDropdown.addEventListener("click", () => {
            this._splitDropdownGroup.style.display = (this._splitDropdownGroup.style.display === "none" ? "" : "none");
        });
		this._volDropdown.addEventListener("click", () => {
			this._volDropdownGroup.style.display = (this._volDropdownGroup.style.display === "none" ? "" : "none");
		});

        [this._merge, this._bridge, this._spread, this._mirrorH, this._mirrorV, this._flatten, this._split,
			this._volUp, this._volDown, this._volFadeOut, this._volFadeIn,
			this._volGainEnd, this._volGainStart, this._volStudioFadeOut, this._volStudioFadeIn, this._volContrastMax,
			this._stepFunction]
            .forEach((o) => o.addEventListener("click", this._whenSettingButtonClicked));

        this._splitSliderInputBox.addEventListener("input", this._updateSplitSliderParts(this._splitSliderInputBox));
        this._splitSlider.input.addEventListener("input", this._updateSplitSliderParts(this._splitSlider.input));
        this._splitSlider.input.addEventListener("change", this._updateSplitSliderParts(this._splitSlider.input));
        this._splitAcross.addEventListener("change", this._updateSplitSliderParts(this._splitSlider.input));
        this._splitAbsolute.addEventListener("change", this._updateSplitSliderParts(this._splitSlider.input));
        this._updateSplitSliderParts(this._splitSliderInputBox)(); // Set defaults.

        this.htmlEntryPoint = div({},
            _selectionOpsDescription,
            this._selectionModeLabel,
            _selectionModeButtonsGroup,
            ..._selectionOps);
    }

    private _whenSelectionModeChanged = (type: SelectionMode): void => {
        [
            {type: SelectionMode.Move, obj: this._selectionModeMoveLabel},
            {type: SelectionMode.Stretch, obj: this._selectionModeStretchLabel}
        ].forEach((entry) => {
            if (type == entry.type) {
                if (!entry.obj.classList.contains('selected-tab')) { entry.obj.classList.add('selected-tab') }
            } else {
                entry.obj.classList.remove('selected-tab')
            }
        })

        this._patternEditor.switchEditingMode(type);
        this._selectionModeLabel.innerText = (type === SelectionMode.Move) ? "Move mode" : "Stretch mode";
    }

    private _whenSettingButtonClicked = (event: MouseEvent): void => {
        if (event.target === this._merge) {
            this._doc.selection.noteMerge(!this._mergeAll.checked);
        } else if (event.target === this._bridge) {
            this._doc.selection.noteBridge(this._bridgeBend.checked);
        } else if (event.target === this._spread) {
            this._doc.selection.noteSpreadAcross(this._spreadPitch.checked);
        } else if (event.target === this._flatten) {
            this._doc.selection.noteFlattenAcross(this._patternEditor, !this._flattenPitch.checked, this._flattenVolume.checked);
        } else if (event.target === this._mirrorH) {
            this._doc.selection.noteMirrorAcross(false);
        } else if (event.target === this._mirrorV) {
            this._doc.selection.noteMirrorAcross(true);
        } else if (event.target === this._split) {
            this._doc.selection.noteSplitAcross(Number(this._splitSlider.input.value),
            this._splitAbsolute.checked, !this._splitAcross.checked)
        } else if (event.target === this._volUp) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'volume double');
		} else if (event.target === this._volDown) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'volume halve');
		} else if (event.target === this._volFadeOut) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'fade out');
		} else if (event.target === this._volFadeIn) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'fade in');
		} else if (event.target === this._volGainEnd) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'gain end');
		} else if (event.target === this._volGainStart) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'gain start');
		} else if (event.target === this._volStudioFadeOut) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'studio fade out'); // TODO: replace with mod version for mod channels!
		} else if (event.target === this._volStudioFadeIn) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'studio fade in'); // TODO: replace with mod version for mod channels!
		} else if (event.target === this._volContrastMax) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'max contrast');
		} else if (event.target === this._stepFunction) {
            const preset = this._stepFunctionSelect.value as keyof typeof this._doc.selection.stepAcrossPresets;
            if (this._doc.selection.stepAcrossPresets[preset]) {
                this._doc.selection.noteStepAcross(this._patternEditor, preset);
            }
        }
    }

    private _updateSplitSliderParts = (source: HTMLInputElement) => (): void => {
        const newValue = source.valueAsNumber;
        if (this._splitSliderInputBox.valueAsNumber !== newValue) {
            this._splitSliderInputBox.value = String(newValue);
        }
        if (this._splitSlider.input.valueAsNumber !== newValue) {
            this._splitSlider.updateValue(newValue);
        }

        this._splitLabel.innerText =
            this._splitAcross.checked && !this._splitAbsolute.checked
                ? `Split across ${newValue} times`:
            !this._splitAcross.checked && !this._splitAbsolute.checked
                ? `Split notes ${newValue} times`:
            !this._splitAcross.checked && this._splitAbsolute.checked
                ? `Split notes per ${newValue} parts`
                : `Split across per ${newValue} parts`;
    }
}