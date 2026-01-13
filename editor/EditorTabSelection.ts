import { ColorConfig } from "./ColorConfig";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Slider } from "./HTMLWrapper";
import { PatternEditor, SelectionMode } from "./PatternEditor";
import { SongDocument } from "./SongDocument";
import { IStepData } from "./changesNoteOps";
import { Config } from "../synth/SynthConfig";

const { button, div, label, input, option, optgroup, select } = HTML;

type TipHandler = (tipName: string) => void;

// Function presets based on various or ad-hoc functions.
enum funcSpecialPresets {
    TapNotes,
}
const funcSpecialPresetsMap = {
    'Naturalize note positions': funcSpecialPresets.TapNotes,
}

// Function presets based on the step function.
const wave = (f1: number, f2: number, amp: number) => `(sin(pi/(${f1} + num/len*(${f2}-${f1})) * num)*${amp} + 1) / 2`;
const funcVolPresets: { [key: string]: IStepData } = {
    'Fade out every note': { affect: 'vol', per: 'pin', mult: [ '1 - num / len'], onlyExistingPins: true },
    'Wobble slow': { affect: 'vol', per: 'time', mult: [wave(16, 16, 0.5)] },
    'Wobble slow to medium': { affect: 'vol', per: 'time', mult: [wave(16, 8, 0.5)] },
    'Wobble slow to fast': { affect: 'vol', per: 'time', mult: [wave(16, 4, 0.5)] },
    'Wobble medium to slow': { affect: 'vol', per: 'time', mult: [wave(8, 16, 0.5)] },
    'Wobble medium': { affect: 'vol', per: 'time', mult: [wave(8, 8, 0.5)] },
    'Wobble medium to fast': { affect: 'vol', per: 'time', mult: [wave(8, 4, 0.5)] },
    'Wobble fast to slow': { affect: 'vol', per: 'time', mult: [wave(4, 16, 0.5)] },
    'Wobble fast to medium': { affect: 'vol', per: 'time', mult: [wave(4, 8, 0.5)] },
    'Wobble fast': { affect: 'vol', per: 'time', mult: [wave(4, 4, 0.5)] },
    'Raise by 1': { affect: 'vol', per: 'pin', add: [1], onlyExistingPins: true },
    'Lower by 1': { affect: 'vol', per: 'pin', add: [-1], onlyExistingPins: true },
    'Double contrast': { affect: 'vol', per: 'pin', add: ['((x - avg) * 2) * (maxrange - minrange)'], onlyExistingPins: true },
    'Halve contrast': { affect: 'vol', per: 'pin', add: ['((x - avg) * -0.5) * (maxrange - minrange)'], onlyExistingPins: true },
    'Stagger volume': { affect: 'vol', per: 'note', add: ['(num % 2 === 0 ? 1 : -1)'], onlyExistingPins: true },
    'Invert': { affect: 'vol', per: 'pin', add: ['(1 - x - x) * (maxrange - minrange)'], onlyExistingPins: true },
    'Flip': { affect: 'vol', per: 'pin', add: ['((x - avg) * -2) * (maxrange - minrange)'], onlyExistingPins: true },
    'Random quiver': { affect: 'vol', per: 'time', mult: ['random() > 0.5 ? 0.5 : 1'] },
    'Random quiver at ends': { affect: 'vol', per: 'time', add: ['(random() > 0.5 ? -(maxrange-minrange) : 0) * (num/len)'] },
};
const funcPitchPresets: { [key: string]: IStepData } = {
    'Stagger pitch': { affect: 'pitch', per: 'note', add: [-1, 1] },
    'Stagger 1:2': { affect: 'pitch', per: 'note', add: [1, 0, 0] },
    'Stagger 1:3': { affect: 'pitch', per: 'note', add: [1, 0, 0, 0] },
    'Stagger 2:1': { affect: 'pitch', per: 'note', add: [1, 1, 0] },
    'Stagger 3:1': { affect: 'pitch', per: 'note', add: [1, 1, 1, 0] },
    'Staircase up': { affect: 'pitch', per: 'note', add: ['num'] },
    'Staircase down': { affect: 'pitch', per: 'note', add: ['-num'] },
    'Shift notes': { affect: 'pitch', per: 'time', add: ['random()'] },
    'Align center': { affect: 'pitch', add: ['pitchesavg - pitch'] },
    'Flip around center': { affect: 'pitch', add: ['2 * (pitchesavg - pitch)'] },
    'Fade to top': { affect: 'pitch', add: ['(pitchesmax - pitch) * (num/len)'] },
    'Fade to center': { affect: 'pitch', add: ['(pitchesavg - pitch) * (num/len)'] },
    'Fade to center + bend': { affect: 'bends', per: 'time', add: ['(pitchesavg - pitch) * (num/len)'], onlyExistingPins: true },
    'Fade to bottom': { affect: 'pitch', add: ['(pitchesmin - pitch) * (num/len)'] },
    'More contrast': { affect: 'pitch', add: ['sign(pitch - pitchesavg)'] },
    'Less contrast': { affect: 'pitch', add: ['sign(pitchesavg - pitch)'] },
};
const funcBendsPresets: { [key: string]: IStepData } = {
    'Bend notes to avg pitch': { affect: 'bends', per: 'pin', type: 'stretch', add: [0, 'pitchesavg - pitch - x'], onlyExistingPins: true },
    'Tremolo slow': { affect: 'bends', per: 'time', add: [wave(16, 16, 0.5)] },
    'Tremolo slow to medium': { affect: 'bends', per: 'time', add: [wave(16, 8, 0.5)] },
    'Tremolo slow to fast': { affect: 'bends', per: 'time', add: [wave(16, 4, 0.5)] },
    'Tremolo medium to slow': { affect: 'bends', per: 'time', add: [wave(8, 16, 0.5)] },
    'Tremolo medium': { affect: 'bends', per: 'time', add: [wave(8, 8, 0.5)] },
    'Tremolo medium to fast': { affect: 'bends', per: 'time', add: [wave(8, 4, 0.5)] },
    'Tremolo fast to slow': { affect: 'bends', per: 'time', add: [wave(4, 16, 0.5)] },
    'Tremolo fast to medium': { affect: 'bends', per: 'time', add: [wave(4, 8, 0.5)] },
    'Tremolo fast': { affect: 'bends', per: 'time', add: [wave(4, 4, 0.5)] },
    'Tremolo max': { affect: 'bends', per: 'pin', add: [-1, 1] },
    'Random bends': { affect: 'bends', per: 'pin', add: ['random() > 0.95 ? 1 : 0'] },
};

/** This contains the controls for the Selection tab in the song editor. */
export class EditorTabSelection {
    public htmlEntryPoint: HTMLDivElement;

    private _doc: SongDocument;
    private _patternEditor: PatternEditor;
    private _tipHandler: TipHandler;
    private _selectionModeMoveLabel: HTMLDivElement;
    private _selectionModeStretchLabel : HTMLDivElement;
    private _selectionModeLabel : HTMLDivElement;
    private _affectModChannelContainer: HTMLDivElement;
    private _affectModChannelNum : HTMLInputElement;
    private _merge : HTMLButtonElement;
    private _mergeAll : HTMLInputElement;
    private _bridge : HTMLButtonElement;
    private _bridgeGrow : HTMLInputElement;
    private _bridgeBend : HTMLInputElement;
    private _spread : HTMLButtonElement;
    private _spreadStack: HTMLInputElement;
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
    private _functionSelect: HTMLSelectElement;
    private _functionRun : HTMLButtonElement;
    private _functionParameterGroup : HTMLDivElement;
    private _specialFunction = () => {};
    private _specialFunctionCurried = () => { this._specialFunction(); }
    private _functionTargetsPitch = false; /* For mod channels, disables running if true. */
    private _monitoredChannel: number = -1
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
    private _rememberDisabledValues: { chkbx: HTMLInputElement, val: boolean }[] = []
	
    constructor(doc: SongDocument, patternEditor: PatternEditor, tipHandler: TipHandler) {
        this._doc = doc;
        this._patternEditor = patternEditor;
        this._tipHandler = tipHandler;
        this._constructHTML();

        this._doc.notifier.watch(this._monitorChannelType);
    }

    private _constructHTML() {
        const _selectionOpsDescription = div({ style: `padding: 3px 0; max-width: 15em; text-align: center; color: ${ColorConfig.secondaryText};` }, "Selection");
        this._selectionModeLabel = div({ style: `padding: 3px 0; color: ${ColorConfig.secondaryText};` }, "Move mode");
        const _selectionModeBtnMove = input({ type: "radio", name: "selection-mode-radio-group", class: "tab-settings-radio" });
        this._selectionModeMoveLabel = div({ class: "tab-settings-radio selected-tab" }, "↤");
        const _selectionModeBtnStretch = input({ type: "radio", name: "selection-mode-radio-group", class: "tab-settings-radio" });
        this._selectionModeStretchLabel = div({ class: "tab-settings-radio" }, "↔");
        const  _selectionModeButtonsGroup: HTMLDivElement = div({ class: "tab-settings-buttons-group", style: "margin-bottom: 0.4rem;" },
            div({ class: "tab-settings-radiodiv" }, _selectionModeBtnMove, this._selectionModeMoveLabel),
            div({ class: "tab-settings-radiodiv" }, _selectionModeBtnStretch, this._selectionModeStretchLabel))
        this._affectModChannelNum = input({ type: "number", step: "1", min: 1, max: Config.modCount, value: "1" });
        this._affectModChannelContainer = div({ class: "selectionOps-action" },
            this._affectModChannelNum,
            div({ class: "tip", onclick: () => this._tipHandler("selectionModTarget") }, "Mod Track #"))
        this._merge = button({ class: "selectionOps-actionbutton noteOpMerge" });
        this._mergeAll = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._bridge = button({ class: "selectionOps-actionbutton noteOpBridge" });
        this._bridgeGrow = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._bridgeBend = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._spread = button({ class: "selectionOps-actionbutton noteOpSpread" });
        this._spreadStack = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._spreadPitch = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._mirrorH = button({ class: "selectionOps-actionbutton noteOpMirror" });
        this._mirrorV = button({ class: "selectionOps-actionbutton noteOpMirror", style: 'transform: rotate(90deg);' });
        this._flatten = button({ class: "selectionOps-actionbutton noteOpFlatten" });
        this._flattenPitch = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._flattenVolume = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._split = button({ class: "selectionOps-actionbutton noteOpSplit" });
        this._splitLabel = div({ class: "tip", onclick: () => this._tipHandler("selectionSplit") }, "");
        this._splitDropdown = button({ style: "height:1.5em; width: 10px; padding: 0px; font-size: 8px; margin-left: 0.2rem;" }, "▼");
		this._volLabel = div({ class: "tip", onclick: () => this._tipHandler("selectionVolOps") }, "vol");
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

        this._functionSelect = select();
        this._functionSelect.appendChild(option({ value: "Choose...", selected: 'selected' }, "Choose..."));
        this._functionSelect.appendChild(optgroup({ label: "Special" },
            ...(Object.keys(funcSpecialPresetsMap).map((key) => option({ value: key }, key)))
        ));
        this._functionSelect.appendChild(optgroup({ label: "Volume Presets" },
            ...(Object.keys(funcVolPresets).map((key) => option({ value: key }, key)))
        ));
        this._functionSelect.appendChild(optgroup({ label: "Pitch Presets" },
            ...(Object.keys(funcPitchPresets).map((key) => option({ value: key }, key)))
        ));
        this._functionSelect.appendChild(optgroup({ label: "Pitch bend Presets" },
            ...(Object.keys(funcBendsPresets).map((key) => option({ value: key }, key)))
        ));

        this._functionSelect.addEventListener('change', this._setFunction);
        this._functionRun = button({ class: "selectionOps-actionbutton noteOpFunction" });
        this._functionRun.addEventListener("click", this._specialFunction);
        this._setFunction(); // set defaults

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
                this._volGainEnd,
				this._volGainStart,
				this._volStudioFadeOut,
				this._volStudioFadeIn,
				this._volContrastMax));

        this._functionParameterGroup = div();

        const _selectionOps = [
            this._affectModChannelContainer,
            div({ class: "selectionOps-action"},
                this._merge,
                div({ class: "tip", onclick: () => this._tipHandler("selectionMerge") }, "Merge"),
                label({ class: "checkbox-container" }, this._mergeAll, "All")),
            div({ class: "selectionOps-action"},
                this._bridge,
                div({ class: "tip", onclick: () => this._tipHandler("selectionBridge") }, "Bridge"),
                label({ class: "checkbox-container" }, this._bridgeGrow, "Grow"),
                label({ class: "checkbox-container" }, this._bridgeBend, "Bend")),
            div({ class: "selectionOps-action"},
                this._spread,
                div({ class: "tip", onclick: () => this._tipHandler("selectionSpread") }, "Spread"),
                label({ class: "checkbox-container" }, this._spreadStack, "Stack"),
                label({ class: "checkbox-container" }, this._spreadPitch, "Pitch")),
            div({ class: "selectionOps-action"},
                this._mirrorH,
                this._mirrorV,
                div({ class: "tip", onclick: () => this._tipHandler("selectionMirror") }, "Mirror")),
            div({ class: "selectionOps-action"},
                this._flatten,
                div({ class: "tip", onclick: () => this._tipHandler("selectionFlatten") }, "Flatten"),
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
                this._functionRun,
                div({ class: "tip", onclick: () => this._tipHandler("selectionFunction") }, "Function"),
                div({ class: "selectContainer", style: "padding-left: 4px; width:100%;" }, this._functionSelect)
            ),
            this._functionParameterGroup
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
			this._volGainEnd, this._volGainStart, this._volStudioFadeOut, this._volStudioFadeIn, this._volContrastMax]
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
        const modTrackIndex = Config.modCount - this._affectModChannelNum.valueAsNumber;

        if (event.target === this._merge) {
            this._doc.selection.noteMerge(!this._mergeAll.checked, modTrackIndex);
        } else if (event.target === this._bridge) {
            this._doc.selection.noteBridge(this._bridgeGrow.checked, this._bridgeBend.checked, modTrackIndex);
        } else if (event.target === this._spread) {
            this._doc.selection.noteSpreadAcross(this._spreadPitch.checked, this._spreadStack.checked, modTrackIndex);
        } else if (event.target === this._flatten) {
            this._doc.selection.noteFlattenAcross(!this._flattenPitch.checked, this._flattenVolume.checked, modTrackIndex);
        } else if (event.target === this._mirrorH) {
            this._doc.selection.noteMirrorAcross(false, modTrackIndex);
        } else if (event.target === this._mirrorV) {
            this._doc.selection.noteMirrorAcross(true, modTrackIndex);
        } else if (event.target === this._split) {
            this._doc.selection.noteSplitAcross(Number(this._splitSlider.input.value),
            this._splitAbsolute.checked, !this._splitAcross.checked, modTrackIndex)
        } else if (event.target === this._volUp) {
			this._doc.selection.noteStepAcross({ affect: 'vol', per: 'pin', add: ['x <= (1 / (maxrange - minrange) + 0.001) ? 1 / (maxrange - minrange) : x'], onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volDown) {
			this._doc.selection.noteStepAcross({ affect: 'vol', per: 'pin', add: ['x <= (1 / (maxrange - minrange) + 0.001) ? -x : -x/2'], onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volFadeOut) {
			this._doc.selection.noteStepAcross({ affect: 'vol', per: 'time', mult: [1, 0], onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volFadeIn) {
			this._doc.selection.noteStepAcross({ affect: 'vol', per: 'time', mult: [0, 1], onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volGainEnd) {
			this._doc.selection.noteStepAcross({ affect: 'vol', per: 'time', type: 'stretch', add: [0, '(x <= (1 / (maxrange - minrange) + 0.001) ? 1 / (maxrange - minrange) : 0) + ((((x / high * (1 - high)) * (maxrange - minrange))) / (maxrange - minrange))'], onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volGainStart) {
			this._doc.selection.noteStepAcross({ affect: 'vol', per: 'time', type: 'stretch', add: ['(x <= (1 / (maxrange - minrange) + 0.001) ? 1 / (maxrange - minrange) : 0) + ((((x / high * (1 - high)) * (maxrange - minrange))) / (maxrange - minrange))', 0], onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volStudioFadeOut) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(isModChannel
                ? { affect: 'vol', per: 'time', mult: ['1 - pow(num / (len - 1), 2)'] }
                : { affect: 'vol', per: 'time', mult: [1, 0.5625, 0.25, 0.0625, 0] },
                modTrackIndex);
		} else if (event.target === this._volStudioFadeIn) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(isModChannel
                ? { affect: 'vol', per: 'time', mult: ['pow(num / (len - 1), 2)'] }
                : { affect: 'vol', per: 'time', mult: [0, 0.0625, 0.25, 0.5625, 1] },
                modTrackIndex);
		} else if (event.target === this._volContrastMax) {
            this._doc.selection.noteStepAcross({ affect: 'vol', type: 'stretch', per: 'pin', add: ['((((x / high * (1 - high)) * (maxrange - minrange))) / (maxrange - minrange))'], onlyExistingPins: true }, modTrackIndex);
		}
    }

    private _setFunction = (): void => {
        const specialFunction = funcSpecialPresetsMap[this._functionSelect.value as keyof typeof funcSpecialPresetsMap];
        if (specialFunction !== undefined) {
            this._setSpecialFunction(specialFunction);
        } else {
            this._getStepFunctionGUI(
                funcVolPresets[this._functionSelect.value] ??
                funcPitchPresets[this._functionSelect.value] ??
                funcBendsPresets[this._functionSelect.value]);
        }
        
        this._functionRun.removeEventListener("click", this._specialFunctionCurried);
        this._functionRun.addEventListener("click", this._specialFunctionCurried);
        this._updateFunctionDisabled();
    }

	/** Creates an IStepData object and GUI from given options. Commas delimit entries in the array textboxes. */
	private _getStepFunctionGUI(preset?: IStepData) {
		interface IRowData {
            rowAffect: HTMLSelectElement;
            rowBehavior: HTMLSelectElement;
            rowAdd: HTMLInputElement;
            rowMultiplyBy: HTMLInputElement;
            rowOnlyExistingPins: HTMLInputElement;
            rowRemove: HTMLButtonElement;
            generated: HTMLDivElement[];
        }

        const rows: IRowData[] = [];

        const behaviors = {
            cycle: "cycle",
            stretch: "stretch",
            step: "step"
        }
        const affects = {
            vpn: "volume per note",
            vpp: "volume per pin",
            vbt: "volume by time",
            ppn: "base pitch per note",
            bpn: "pitch bends per note",
            bpp: "pitch bends per pin",
            bbt: "pitch bends by time"
        };

        let fromAffects: keyof typeof affects | undefined;
        let fromAdd: string | undefined;
        let fromMultiply: string | undefined;

        if (preset) {
            fromAffects = 
                (preset.affect === 'vol' && preset.per === 'note') ? 'vpn' :
                (preset.affect === 'vol' && preset.per === 'pin') ? 'vpp' :
                (preset.affect === 'vol' && preset.per === 'time') ? 'vbt' :
                (preset.affect === 'pitch') ? 'ppn' :
                (preset.affect === 'bends' && preset.per === 'note') ? 'bpn' :
                (preset.affect === 'bends' && preset.per === 'pin') ? 'bpp' :
                (preset.affect === 'bends' && preset.per === 'time') ? 'bbt' :
                undefined;

            if (preset.add) { fromAdd = preset.add.join(','); }
            if (preset.mult) { fromMultiply = preset.mult.join(','); }
        }

        /** Reads control values to update the action when user runs the function. */
        const updatePerform = () => {
            this._functionTargetsPitch = rows.some(row => row.rowAffect.value === 'ppn' ||
                row.rowAffect.value === 'bpn' || row.rowAffect.value === 'bpp' || row.rowAffect.value === 'bbt');
            this._updateFunctionDisabled();

            this._specialFunction = () => {
                for (let row of rows) {
                    const type = row.rowAffect.value as keyof typeof affects;
                    const behavior = (row.rowBehavior?.value ?? 'cycle') as IStepData['type'];
                    const stepData: IStepData = { affect: 'vol', type: behavior, onlyExistingPins: row.rowOnlyExistingPins.checked };
                    const scale = (str: string) => type === 'vpn' || type === 'vpp' || type === 'vbt'
                        ? `((${str}) / (maxrange - minrange))`
                        : `(${str})`;
                    const withDefault = (str: string, defaultVal: string) => str === "" ? defaultVal : str;

                    const addArr: string[] = row.rowAdd.value === '' ? ['0']
                        : row.rowAdd.value.split(',').map(str => withDefault(scale(str), scale('0')));
                    const multArr: string[] = row.rowMultiplyBy.value === '' ? ['1']
                        : row.rowMultiplyBy.value.split(',').map(str => withDefault(str, '1'));

                    // The last element in a step array occurs at/after the end. Bug? I don't know.
                    if (behavior === 'step') {
                        addArr.push('0'),
                        multArr.push('1')
                    }

                    stepData.per = (type === 'vpn' || type === 'ppn' || type === 'bpn') ? "note"
                        : type === 'vpp' || type === 'bpp' ? "pin"
                        : "time";
                    stepData.affect = (type === 'vpn' || type === 'vbt' || type === 'vpp') ? 'vol'
                        : type === 'ppn' ? 'pitch'
                        : 'bends';
                    stepData.add = addArr;
                    stepData.mult = multArr;
                    this._doc.selection.noteStepAcross(stepData, Config.modCount - this._affectModChannelNum.valueAsNumber);
                }
            }
        }

        /** Handles interactions of a single row, returning it + its components to be read by updatePerform */
        const createRow = (isFirstRow?: boolean): IRowData => {
            const affect = select({ },
                ...Object.keys(affects).map(key => option({ value: key }, affects[key as keyof typeof affects])));
            const behavior = select({ },
                ...Object.keys(behaviors).map(key => option({ value: key }, key as keyof typeof behaviors)));
            const onlyExistingPins = input({ type: "checkbox", class: "selectionOps-checkbox" });
            const add = input({ class: "selectionOps-textbox", placeholder: "0", type: "text" });
            const multiplyBy = input({ class: "selectionOps-textbox", placeholder: "1", type: "text" });
            const remove = button({ style: "margin-right: 4px;" }, "remove row");

            // Populate values from the passed-in preset.
            affect.value = isFirstRow && fromAffects
                ? fromAffects satisfies keyof typeof affects
                : 'vpn';
            behavior.value = isFirstRow && preset?.type
                ? preset.type
                : behaviors.cycle

            if (fromAdd) { add.value = isFirstRow ? fromAdd : ''; }
            if (fromMultiply) { multiplyBy.value = isFirstRow ? fromMultiply : ''; }
            onlyExistingPins.checked = isFirstRow ? (preset?.onlyExistingPins ?? false) : false

            // Clicking remove on a row finds itself in the rows and removes itself that way.
            if (!isFirstRow) {
                remove.addEventListener("click", () => {
                    const index = rows.findIndex(row => row.rowRemove === remove);
                    if (index !== -1) {
                        rows[index].generated.forEach(o => o.remove());
                        rows.splice(index, 1);
                    }
                    updatePerform();
                });
            }

            [affect, behavior, add, multiplyBy, onlyExistingPins].forEach(o => o.addEventListener("input", updatePerform));

            return {
                generated: [
                    div({ class: "selectionOps-action"}, label({ style: "width: 100%;" },
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepAffect") }, "Affect"),
                        div({ class: "selectContainer", style: "width: 100%;" }, affect))),
                    div({ class: "selectionOps-action"}, label({ style: "width: 100%;" },
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepBehavior") }, "Behavior"),
                        div({ class: "selectContainer", style: "width: 100%;" }, behavior))),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepArrays") }, "Add"), add)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepArrays") }, "Multiply by"), multiplyBy)),
                    div({ class: "selectionOps-action"}, label({ style: "width: 100%;" },
                        label({ class: "checkbox-container" }, onlyExistingPins, "Only Existing Pins?"))),
                    ...(isFirstRow ? [] : [div({ class: "inlineblock"}, remove)])],
                rowAffect: affect,
                rowBehavior: behavior,
                rowAdd: add,
                rowMultiplyBy: multiplyBy,
                rowOnlyExistingPins: onlyExistingPins,
                rowRemove: remove
            }
        }

        // Add first row and create "add row" button
        rows.push(createRow(true));
        const addRow = button({}, "Add row");
        addRow.addEventListener("click", () => {
            rows.push(createRow());
            this._functionParameterGroup?.lastElementChild?.before(...rows[rows.length - 1].generated);
            // no effects, skip updatePerform
        })

        this._functionParameterGroup?.replaceChildren(
            ...rows.flatMap(rows => rows.generated),
            div({ class: "inlineblock" }, addRow));
        updatePerform();
	}

    /** Creates an IStepData object and GUI from given options. Commas delimit entries in the array textboxes. */
	private _setSpecialFunction(specialFunction: funcSpecialPresets) {
        this._functionParameterGroup?.replaceChildren();
        this._functionTargetsPitch = false;
        this._updateFunctionDisabled();

        if (specialFunction === funcSpecialPresets.TapNotes) {
            this._specialFunction = () => this._doc.selection.noteTapAcross(Config.modCount - this._affectModChannelNum.valueAsNumber);
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

    /** Adjusts controls based on whether in a modulation channel or not, since pitch features are restricted. */
    private _monitorChannelType = () => {
        if (this._monitoredChannel !== this._doc.channel) {
            const incompatCheckboxes = [this._mergeAll, this._bridgeBend, this._spreadPitch, this._flattenPitch, this._flattenVolume];
            const incompatWithModulation = [this._mirrorV, ...incompatCheckboxes];

            if (this._doc.song.getChannelIsMod(this._doc.channel)) {
                incompatWithModulation.forEach(el => {
                    // Disabling the focused element defaults to body, which won't run key handling, so avoid breaking
                    // that. Notably, scrolling past a mod channel with focus on a disable-able control will cause
                    // arrowkeys to get "stuck" because of this.
                    if (document.activeElement === el) { 
                        document.querySelector<HTMLButtonElement>('button.noteOpMerge')?.focus();
                    }

                    el.setAttribute("disabled", "true")
                });
                this._affectModChannelContainer.style.display = "";

                // Disable pitch-related GUI in the step function when on a mod channel, and push to an
                // array to restore values for them later. Flatten volume is forced to stay on.
                if (this._rememberDisabledValues.length === 0) {
                    incompatCheckboxes.forEach(chkbx => {
                        this._rememberDisabledValues.push({ chkbx, val: chkbx.checked })
                        if (chkbx === this._flattenVolume) { chkbx.checked = true; }
                        else { chkbx.checked = false; }
                    });
                }
            }
            else {
                incompatWithModulation.forEach(el => el.removeAttribute("disabled"));
                this._rememberDisabledValues.forEach(entry => entry.chkbx.checked = entry.val);
                this._rememberDisabledValues = [];
                this._affectModChannelContainer.style.display = "none";
            }

            this._updateFunctionDisabled();
            this._monitoredChannel = this._doc.channel;
        }
    }

    private _updateFunctionDisabled = () => {
        if (
            (this._doc.song.getChannelIsMod(this._doc.channel) && this._functionTargetsPitch) ||
            (!Object.hasOwn(funcSpecialPresetsMap, this._functionSelect.value) &&
            !Object.hasOwn(funcVolPresets, this._functionSelect.value) &&
            !Object.hasOwn(funcPitchPresets, this._functionSelect.value) &&
            !Object.hasOwn(funcBendsPresets, this._functionSelect.value))) {
            this._functionRun.setAttribute("disabled", "true");
        } else {
            this._functionRun.removeAttribute("disabled");
        }
    }
}