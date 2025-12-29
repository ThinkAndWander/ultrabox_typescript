import { ColorConfig } from "./ColorConfig";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Slider } from "./HTMLWrapper";
import { PatternEditor, SelectionMode } from "./PatternEditor";
import { SongDocument } from "./SongDocument";
import { IStepArray, IStepData } from "./changesNoteOps";
import { Config } from "../synth/SynthConfig";

const { button, div, label, input, option, optgroup, select } = HTML;

type TipHandler = (tipName: string) => void;
type stepPresetsVolType = 'Fade out every note' | 'Stagger volume on/off' | 'Stagger volume up/down' |
    'Volume wobble slow' | 'Volume wobble slow to med' | 'Volume wobble slow to fast' |
    'Volume wobble med to slow' | 'Volume wobble medium' | 'Volume wobble med to fast' |
    'Volume wobble fast to slow' | 'Volume wobble fast to med' | 'Volume wobble fast' |
    'Volume up' | 'Volume down' | 'Double volume contrast' | 'Halve volume contrast' |
    'Flip volume' | 'Invert volume' | 'Random volume interrupts';
type stepPresetsPitchType = 'Stagger pitch' | 'Stagger pitch 1:2' | 'Stagger pitch 1:3' |
    'Stagger pitch 2:1' | 'Stagger pitch 3:1' | 'Staircase pitch up' | 'Staircase pitch down';

const stepPresetsVol = {
    VolumeFadePerNote: 'Fade out every note',
    VolumeWobbleSlow: 'Volume wobble slow',
    VolumeWobbleSlowMed: 'Volume wobble slow to med',
    VolumeWobbleSlowFast: 'Volume wobble slow to fast',
    VolumeWobbleMedSlow: 'Volume wobble med to slow',
    VolumeWobbleMed: 'Volume wobble medium',
    VolumeWobbleMedFast: 'Volume wobble med to fast',
    VolumeWobbleFastSlow: 'Volume wobble fast to slow',
    VolumeWobbleFastMed: 'Volume wobble fast to med',
    VolumeWobbleFast: 'Volume wobble fast',
    VolumeStepUp: 'Volume up',
    VolumeStepDown: 'Volume down',
    VolumeDoubleContrast: 'Double volume contrast',
    VolumeHalveContrast: 'Halve volume contrast',
    StaggerVolOnOff: 'Stagger volume on/off',
    StaggerVolUpDown: 'Stagger volume up/down',
    InvertVolume: 'Invert volume',
    FlipVolume: 'Flip volume',
    RandomVolumeInterrupts: 'Random volume interrupts'
} satisfies { [key: string]: stepPresetsVolType };

const stepPresetsPitch = {
    StaggerPitch: 'Stagger pitch',
    StaggerPitch12: 'Stagger pitch 1:2',
    StaggerPitch13: 'Stagger pitch 1:3',
    StaggerPitch21: 'Stagger pitch 2:1',
    StaggerPitch31: 'Stagger pitch 3:1',
    StaircasePitchUp: 'Staircase pitch up',
    StaircasePitchDown: 'Staircase pitch down',
} satisfies { [key: string]: stepPresetsPitchType };

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
            ...(Object.keys(stepPresetsVol).map((key) => option({value: key}, stepPresetsVol[key as keyof typeof stepPresetsVol])))
        ));
        this._stepFunctionSelect.appendChild(optgroup({ label: "Pitch Presets" },
            ...(Object.keys(stepPresetsPitch).map((key) => option({value: key}, stepPresetsPitch[key as keyof typeof stepPresetsPitch])))
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
			this._doc.selection.noteStepAcross('volume double', modTrackIndex);
		} else if (event.target === this._volDown) {
			this._doc.selection.noteStepAcross('volume halve', modTrackIndex);
		} else if (event.target === this._volFadeOut) {
			this._doc.selection.noteStepAcross('fade out', modTrackIndex);
		} else if (event.target === this._volFadeIn) {
			this._doc.selection.noteStepAcross('fade in', modTrackIndex);
		} else if (event.target === this._volGainEnd) {
			this._doc.selection.noteStepAcross('gain end', modTrackIndex);
		} else if (event.target === this._volGainStart) {
			this._doc.selection.noteStepAcross('gain start', modTrackIndex);
		} else if (event.target === this._volStudioFadeOut) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(isModChannel ? 'mod-studio fade out' : 'studio fade out', modTrackIndex);
		} else if (event.target === this._volStudioFadeIn) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(isModChannel ? 'mod-studio fade in' : 'studio fade in', modTrackIndex);
		} else if (event.target === this._volContrastMax) {
			this._doc.selection.noteStepAcross('max contrast', modTrackIndex);
		}
    }

    private _setStepFunction = (): void => {
        switch (this._stepFunctionSelect.value as keyof typeof stepPresetsVol | keyof typeof stepPresetsPitch) {
            case 'InvertVolume':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['invert']); break;
            case 'FlipVolume':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['flip volume']); break;
            case 'StaggerPitch':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['stagger pitch']); break;
            case 'StaggerPitch12':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['stagger pitch 1:2']); break;
            case 'StaggerPitch13':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['stagger pitch 1:3']); break;
            case 'StaggerPitch21':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['stagger pitch 2:1']); break;
            case 'StaggerPitch31':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['stagger pitch 3:1']); break;
            case 'StaircasePitchUp':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['staircase pitch up']); break;
            case 'StaircasePitchDown':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['staircase pitch down']); break;
            case 'StaggerVolOnOff':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['volume alternate']); break;
            case 'StaggerVolUpDown':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['volume toggle']); break;
            case 'VolumeFadePerNote':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['fade every note']); break;
            case 'VolumeWobbleSlow':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble slow']); break;
            case 'VolumeWobbleSlowMed':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble slow-med']); break;
            case 'VolumeWobbleSlowFast':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble slow-fast']); break;
            case 'VolumeWobbleMedSlow':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble med-slow']); break;
            case 'VolumeWobbleMed':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble med']); break;
            case 'VolumeWobbleMedFast':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble med-fast']); break;
            case 'VolumeWobbleFastSlow':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble fast-slow']); break;
            case 'VolumeWobbleFastMed':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble fast-med']); break;
            case 'VolumeWobbleFast':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['wobble fast']); break;
            case 'VolumeStepUp':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['volume up']); break;
            case 'VolumeStepDown':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['volume down']); break;
            case 'VolumeDoubleContrast':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['contrast double']); break;
            case 'VolumeHalveContrast':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['contrast halve']); break;
            case 'RandomVolumeInterrupts':
                this._getStepFunctionGUI(this._doc.selection.stepAcrossPresets['volume interrupt']); break;
            default:
                this._stepFunctionParameterGroup?.replaceChildren();
                break;
        }

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
            this._stepFunctionParameterGroup.lastElementChild?.before(...rows[rows.length - 1].generated);
            // no effects, skip updatePerform
        })

        this._stepFunctionParameterGroup.replaceChildren(
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