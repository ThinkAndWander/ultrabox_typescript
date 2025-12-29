import { ColorConfig } from "./ColorConfig";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Slider } from "./HTMLWrapper";
import { PatternEditor, SelectionMode } from "./PatternEditor";
import { SongDocument } from "./SongDocument";
import { IStepArray, IStepData } from "./changesNoteOps";
import { Config } from "../synth/SynthConfig";

const { button, div, label, input, option, optgroup, select } = HTML;

type TipHandler = (tipName: string) => void;

const wave = (f1: number, f2: number, amp: number) => `(sin(pi/(${f1} + num/len*(${f2}-${f1})) * num)*${amp} + 1) / 2`;
const stepPresetsVol: { [key: string]: IStepData } = {
    'Fade out every note': { volMult: { array: [ '1 - num / len'], per: 'pin' }, onlyExistingPins: true },
    'Wobble slow': { volMult: { array: [wave(16, 16, 0.5)], per: 'time' } },
    'Wobble slow to medium': { volMult: { array: [wave(16, 8, 0.5)], per: 'time' } },
    'Wobble slow to fast': { volMult: { array: [wave(16, 4, 0.5)], per: 'time' } },
    'Wobble medium to slow': { volMult: { array: [wave(8, 16, 0.5)], per: 'time' } },
    'Wobble medium': { volMult: { array: [wave(8, 8, 0.5)], per: 'time' } },
    'Wobble medium to fast': { volMult: { array: [wave(8, 4, 0.5)], per: 'time' } },
    'Wobble fast to slow': { volMult: { array: [wave(4, 16, 0.5)], per: 'time' } },
    'Wobble fast to medium': { volMult: { array: [wave(4, 8, 0.5)], per: 'time' } },
    'Wobble fast': { volMult: { array: [wave(4, 4, 0.5)], per: 'time' } },
    'Raise by 1': { volAdd: { array: [1], per: 'pin' }, onlyExistingPins: true },
    'Lower by 1': { volAdd: { array: [-1], per: 'pin' }, onlyExistingPins: true },
    'Double contrast': { volAdd: { array: ['((x - average) * 2) * (maxval - minval)'], per: 'pin' }, onlyExistingPins: true },
    'Halve contrast': { volAdd: { array: ['((x - average) * -0.5) * (maxval - minval)'], per: 'pin' }, onlyExistingPins: true },
    'Stagger on/off': { volMult: { array: [0, 1], per: 'note', type: 'cycle' } },
    'Stagger up/down': { volAdd: { array: ['(num % 2 === 0 ? 1 : -1)'], per: 'note', type: 'cycle' }, onlyExistingPins: true },
    'Invert': { volAdd: { array: ['(1 - x - x) * (maxval - minval)'], per: 'pin' }, onlyExistingPins: true },
    'Flip': { volAdd: { array: ['((x - average) * -2) * (maxval - minval)'], per: 'pin' }, onlyExistingPins: true },
    'Random interrupts': { volMult: { array: ['random() > 0.5 ? 0.5 : 1'], per: 'time' } }
};

const stepPresetsPitch: { [key: string]: IStepData } = {
    'Stagger every other': { pitchAdd: { array: [-1, 1], per: 'note', type: 'cycle' } },
    'Stagger every 1 to 2': { pitchAdd: { array: [1, 0, 0], per: 'note', type: 'cycle' } },
    'Stagger every 1 to 3': { pitchAdd: { array: [1, 0, 0, 0], per: 'note', type: 'cycle' } },
    'Stagger every 2 to 1': { pitchAdd: { array: [1, 1, 0], per: 'note', type: 'cycle' } },
    'Stagger every 3 to 1': { pitchAdd: { array: [1, 1, 1, 0], per: 'note', type: 'cycle' } },
    'Staircase up': { pitchAdd: { array: ['num'], per: 'note', type: 'cycle' } },
    'Staircase down': { pitchAdd: { array: ['-num'], per: 'note', type: 'cycle' } },
    'Random shifts': { pitchAdd: { array: ['random() > 0.5 ? 1 : 0'], per: 'time' } }
}

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
    private _stepFunctionRun : HTMLButtonElement;
    private _stepFunctionParameterGroup : HTMLDivElement;
    private _stepFunction = () => {};
    private _stepFunctionCurried = () => { this._stepFunction(); }
    private _stepTargetsPitch = false; /* For mod channels, disables running if true. */
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
        this._bridgeBend = input({ type: "checkbox", class: "selectionOps-checkbox"});
        this._spread = button({ class: "selectionOps-actionbutton noteOpSpread" });
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

        this._stepFunctionSelect = select();
        this._stepFunctionSelect.appendChild(option({ value: "Choose...", selected: 'selected' }, "Choose..."));
        this._stepFunctionSelect.appendChild(optgroup({ label: "Volume Presets" },
            ...(Object.keys(stepPresetsVol).map((key) => option({ value: key }, key)))
        ));
        this._stepFunctionSelect.appendChild(optgroup({ label: "Pitch Presets" },
            ...(Object.keys(stepPresetsPitch).map((key) => option({ value: key }, key)))
        ));

        this._stepFunctionSelect.addEventListener('change', this._setStepFunction);
        this._stepFunctionRun = button({ class: "selectionOps-actionbutton noteOpFunction" });
        this._stepFunctionRun.addEventListener("click", this._stepFunction);
        this._setStepFunction(); // set defaults

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

        this._stepFunctionParameterGroup = div();

        const _selectionOps = [
            this._affectModChannelContainer,
            div({ class: "selectionOps-action"},
                this._merge,
                div({ class: "tip", onclick: () => this._tipHandler("selectionMerge") }, "Merge"),
                label({ class: "checkbox-container" }, this._mergeAll, "All")),
            div({ class: "selectionOps-action"},
                this._bridge,
                div({ class: "tip", onclick: () => this._tipHandler("selectionBridge") }, "Bridge"),
                label({ class: "checkbox-container" }, this._bridgeBend, "Bend")),
            div({ class: "selectionOps-action"},
                this._spread,
                div({ class: "tip", onclick: () => this._tipHandler("selectionSpread") }, "Spread"),
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
                this._stepFunctionRun,
                div({ class: "tip", onclick: () => this._tipHandler("selectionFunction") }, "Function"),
                div({ class: "selectContainer", style: "padding-left: 4px; width:100%;" }, this._stepFunctionSelect)
            ),
            this._stepFunctionParameterGroup
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
            this._doc.selection.noteMerge(!this._mergeAll.checked);
        } else if (event.target === this._bridge) {
            this._doc.selection.noteBridge(this._bridgeBend.checked);
        } else if (event.target === this._spread) {
            this._doc.selection.noteSpreadAcross(this._spreadPitch.checked);
        } else if (event.target === this._flatten) {
            this._doc.selection.noteFlattenAcross(!this._flattenPitch.checked, this._flattenVolume.checked, modTrackIndex);
        } else if (event.target === this._mirrorH) {
            this._doc.selection.noteMirrorAcross(false);
        } else if (event.target === this._mirrorV) {
            this._doc.selection.noteMirrorAcross(true);
        } else if (event.target === this._split) {
            this._doc.selection.noteSplitAcross(Number(this._splitSlider.input.value),
            this._splitAbsolute.checked, !this._splitAcross.checked)
        } else if (event.target === this._volUp) {
			this._doc.selection.noteStepAcross({ volMult: { array: [2], per: 'pin' }, onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volDown) {
			this._doc.selection.noteStepAcross({ volMult: { array: [0.5], per: 'pin' }, onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volFadeOut) {
			this._doc.selection.noteStepAcross({ volMult: { array: [1, 0], per: 'time' }, onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volFadeIn) {
			this._doc.selection.noteStepAcross({ volMult: { array: [0, 1], per: 'time' }, onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volGainEnd) {
			this._doc.selection.noteStepAcross({ volAdd: { array: ['(num === 1 ? 1 : 0) * (maxval - minval)'], per: 'time' }, volMult: { array: [1, 2], per: 'time' }, onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volGainStart) {
			this._doc.selection.noteStepAcross({ volAdd: { array: ['(num === 0 ? 1 : 0) * (maxval - minval)'], per: 'time' }, volMult: { array: [2, 1], per: 'time' }, onlyExistingPins: true }, modTrackIndex);
		} else if (event.target === this._volStudioFadeOut) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(isModChannel
                ? { volMult: { array: ['1 - pow(num / (len - 1), 2)'], per: 'time' } }
                : { volMult: { array: [1, 0.5625, 0.25, 0.0625, 0], per: 'time' } },
                modTrackIndex);
		} else if (event.target === this._volStudioFadeIn) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(isModChannel
                ? { volMult: { array: ['pow(num / (len - 1), 2)'], per: 'time' } }
                : { volMult: { array: [0, 0.0625, 0.25, 0.5625, 1], per: 'time' } },
                modTrackIndex);
		} else if (event.target === this._volContrastMax) {
			this._doc.selection.noteStepAcross({ volAdd: { array: ['(x / biggest * (1 - biggest)) * (maxval - minval)'], per: 'pin' }, onlyExistingPins: true }, modTrackIndex);
		}
    }

    private _setStepFunction = (): void => {
        this._getStepFunctionGUI(stepPresetsVol[this._stepFunctionSelect.value] ?? stepPresetsPitch[this._stepFunctionSelect.value]);
        this._stepFunctionRun.removeEventListener("click", this._stepFunctionCurried);
        this._stepFunctionRun.addEventListener("click", this._stepFunctionCurried);
        this._updateStepFunctionDisabled();
    }

	/**
     * Constructs an IStepData object from user input, using commas to delimit items in the add/multiply arrays.
     * If an IStepData object is supplied, the GUI is constructed to match it.
    */
	private _getStepFunctionGUI(from?: IStepData) {
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
            stretch: "normal",
            step: "step"
        } satisfies { [key: string]: IStepArray['type'] }

        const affects = {
            vpn: "volume per note",
            vpp: "volume per pin",
            vbt: "volume by time",
            ppn: "pitch per note",
        };

        // Simplified conversion of IStepData that only works if array type is uniform in all arrays and only pich or
        // volume are provided, exclusively.
        let fromBehavior: IStepArray['type'] | undefined;
        let fromAffects: keyof typeof affects | undefined;
        let fromAdd: string | undefined;
        let fromMultiply: string | undefined;

        if (from) {
            fromBehavior =
                (from?.volAdd?.type === 'cycle' || from?.volMult?.type === 'cycle' ||
                from?.pitchAdd?.type === 'cycle' || from?.pitchMult?.type === 'cycle') ? 'cycle' :
                (from?.volAdd?.type === 'normal' || from?.volMult?.type === 'normal' ||
                from?.pitchAdd?.type === 'normal' || from?.pitchMult?.type === 'normal') ? 'normal' :
                (from?.volAdd?.type === 'step' || from?.volMult?.type === 'step' ||
                from?.pitchAdd?.type === 'step' || from?.pitchMult?.type === 'step') ? 'step' :
                undefined;

            fromAffects =
                (from?.volAdd?.per === 'note' || from?.volMult?.per === 'note') ? 'vpn' :
                (from?.volAdd?.per === 'pin' || from?.volMult?.per === 'pin') ? 'vpp' :
                (from?.volAdd?.per === 'time' || from?.volMult?.per === 'time') ? 'vbt' :
                (from?.pitchAdd?.per === 'note' || from?.pitchMult?.per === 'note') ? 'ppn' :
                undefined;

            if (from?.volAdd?.array || from?.pitchAdd?.array) {
                fromAdd = (from?.volAdd?.array ?? from?.pitchAdd?.array ?? []).join(',');    
            }
            if (from?.volMult?.array || from?.pitchMult?.array) {
                fromMultiply = (from?.volMult?.array ?? from?.pitchMult?.array ?? []).join(',');
            }
        }

        /** Reads control values to update the action when user runs the function. */
        const updatePerform = () => {
            this._stepTargetsPitch = rows.some(row => row.rowAffect.value === 'ppn');
            this._updateStepFunctionDisabled();

            this._stepFunction = () => {
                for (let row of rows) {
                    const stepData: IStepData = { onlyExistingPins: row.rowOnlyExistingPins.checked };
                    const type = row.rowAffect.value as keyof typeof affects;
                    const behavior = row.rowBehavior?.value ? behaviors[row.rowBehavior.value as keyof typeof behaviors] : behaviors['cycle'];
                    const scale = (str: string) => type === 'ppn' || str === '0' ? `(${str})` : `((${str}) / (maxval - minval))`;
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

                    if (type === 'vbt' || type === 'vpn' || type === 'vpp') {
                        const per = type === 'vpn' ? "note" : type === 'vpp' ? "pin" : "time";
                        stepData.volAdd = { array: addArr, type: behavior, per: per },
                        stepData.volMult = { array: multArr, type: behavior, per: per }
                    } else if (type === 'ppn') {
                        stepData.pitchAdd = { array: addArr, type: behavior, per: 'note' },
                        stepData.pitchMult = { array: multArr, type: behavior, per: 'note' }
                    }

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

            // Populate values from the passed-in preset, if any.
            affect.value = fromAffects ?? 'ppn' satisfies keyof typeof affects;
            behavior.value = fromBehavior ?? behaviors.cycle

            if (fromAdd) { add.value = fromAdd; }
            if (fromMultiply) { multiplyBy.value = fromMultiply; }
            if (from?.onlyExistingPins !== undefined) {
                onlyExistingPins.checked = from?.onlyExistingPins;
            }

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
            this._stepFunctionParameterGroup?.lastElementChild?.before(...rows[rows.length - 1].generated);
            // no effects, skip updatePerform
        })

        this._stepFunctionParameterGroup?.replaceChildren(
            ...rows.flatMap(rows => rows.generated),
            div({ class: "inlineblock" }, addRow));
        updatePerform();
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
                incompatWithModulation.forEach(el => el.setAttribute("disabled", "true"));
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

            this._updateStepFunctionDisabled();
            this._monitoredChannel = this._doc.channel;
        }
    }

    private _updateStepFunctionDisabled = () => {
        if (
            (this._doc.song.getChannelIsMod(this._doc.channel) && this._stepTargetsPitch) ||
            (!Object.hasOwn(stepPresetsVol, this._stepFunctionSelect.value) &&
            !Object.hasOwn(stepPresetsPitch, this._stepFunctionSelect.value))) {
            this._stepFunctionRun.setAttribute("disabled", "true");
        } else {
            this._stepFunctionRun.removeAttribute("disabled");
        }
    }
}