import { ColorConfig } from "./ColorConfig";
import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Slider } from "./HTMLWrapper";
import { PatternEditor, SelectionMode } from "./PatternEditor";
import { SongDocument } from "./SongDocument";
import { IStepData } from "./changesNoteOps";

const { button, div, label, input, option, select } = HTML;

type TipHandler = (tipName: string) => void;
type stepFunctionCategoriesType = 'Choose...' | 'Invert' | 'Stagger' | 'Ramp' | 'Wave' | 'Custom';
const stepFunctionCategories: { [key: string]: stepFunctionCategoriesType } = {
    Invert: 'Invert',
    Stagger: 'Stagger',
    Ramp: 'Ramp',
    Wave: 'Wave',
    Custom: 'Custom'
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
        this._tipHandler = tipHandler;
        this._constructHTML();
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
        const defaultOption: stepFunctionCategoriesType = "Choose...";
        this._stepFunctionSelect.appendChild(option({ value: defaultOption, selected: 'selected' }, defaultOption));
        (Object.keys(stepFunctionCategories))
            .forEach((key) => this._stepFunctionSelect.appendChild(option({value: key}, key)))
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
                this. _volGainEnd,
				this._volGainStart,
				this._volStudioFadeOut,
				this._volStudioFadeIn,
				this._volContrastMax));

        this._stepFunctionParameterGroup = div();

        const _selectionOps = [
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
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(this._patternEditor, isModChannel ? 'mod-studio fade out' : 'studio fade out');
		} else if (event.target === this._volStudioFadeIn) {
            const isModChannel = this._doc.song.getChannelIsMod(this._doc.channel);
			this._doc.selection.noteStepAcross(this._patternEditor, isModChannel ? 'mod-studio fade in' : 'studio fade in');
		} else if (event.target === this._volContrastMax) {
			this._doc.selection.noteStepAcross(this._patternEditor, 'max contrast');
		}
    }

    private _setStepFunction = (): void => {
        switch (this._stepFunctionSelect.value as stepFunctionCategoriesType) {
            case stepFunctionCategories.Invert:
                this._getInvertFunctionGUI();
                break;
            case stepFunctionCategories.Stagger:
                this._getStaggerFunctionGUI();
                break;
            case stepFunctionCategories.Ramp:
				this._getRampFunctionGUI();
                break;
            case stepFunctionCategories.Wave:
                break;
            case stepFunctionCategories.Custom:
                break;
            default:
                this._stepFunctionParameterGroup?.replaceChildren();
                break;
        }

        this._stepFunctionRun.removeEventListener("click", this._stepFunctionCurried);
        this._stepFunctionRun.addEventListener("click", this._stepFunctionCurried);

        if (!!stepFunctionCategories[this._stepFunctionSelect.value]) {
            this._stepFunctionRun.removeAttribute("disabled");
        } else {
            this._stepFunctionRun.setAttribute("disabled", "true");
        }
    }

	/** The invert GUI performs either invert from center (flip) or invert from top (invert). */
	private _getInvertFunctionGUI() {
		const chkbxInvertInstead = input({ type: "checkbox", class: "selectionOps-checkbox" });

		const updatePerform = () => {
			this._stepFunction = () => {
				this._doc.selection.noteStepAcross(this._patternEditor, chkbxInvertInstead.checked ? 'invert' : 'flip volume' );
			}
		}

		chkbxInvertInstead.addEventListener("change", updatePerform);

		this._stepFunctionParameterGroup.replaceChildren(
			div({ class: "selectionOps-action"},
				label({ class: "checkbox-container" }, chkbxInvertInstead, "Invert instead of flip?")
			));

		updatePerform();
	}

	/**
	 * The stagger GUI performs any number of changesets sequentially, where a changeset consists of the target unit,
	 * such as notes or pins, to then add and multiply every N units while performing a different add/multiply for the
	 * other cases. It's similar to IStepData except restricted to one array item.
	 * 
	 * The function template is identical for add and multiply and is: num % {EVERY} === 0 ? {VALUE} : {OTHER}
	 */
	private _getStaggerFunctionGUI() {
		interface IRowData {
            rowAffect: HTMLSelectElement;
            rowEvery: HTMLInputElement;
            rowAdd: HTMLInputElement;
            rowAddOther: HTMLInputElement;
            rowMultiplyBy: HTMLInputElement;
            rowMultiplyOther: HTMLInputElement;
            rowRemove: HTMLButtonElement;
            generated: HTMLDivElement[];
        }

        const rows: IRowData[] = [];
        const affects = {
            vpn: "volume per note",
            vpp: "volume per pin",
            vbt: "volume by time",
            ppn: "pitch per note",
            ppp: "pitch per pin",
            pbt: "pitch by time"
        };

        /** Reads control values to update the action when user runs the function. */
        const updatePerform = () => {
            this._stepFunction = () => {
                let isFirstRow = true;
                for (let row of rows) {
                    const stepData: IStepData = {};
                    const type = row.rowAffect.value as keyof typeof affects;
                    const or = (str: string, val: string) => str === "" ? val : str;

                    const add = [`num % (${or(row.rowEvery.value, "2")}) === 0 \
                        ? (${or(row.rowAdd.value, isFirstRow ? "(1 / (maxval - minval))" : "0")}) \
                        : (${or(row.rowAddOther.value, isFirstRow ? "(-1 / (maxval - minval))" : "0")})`];
                    const mul = [`num % (${or(row.rowEvery.value, "2")}) === 0 \
                        ? (${or(row.rowMultiplyBy.value, isFirstRow ? "(1 / (maxval - minval))" : "1")}) \
                        : (${or(row.rowMultiplyOther.value, isFirstRow ? "(1 / (maxval - minval))" : "1")})`];

                    if (type === affects.vbt || type === affects.vpn || type === affects.vpp) {
                        const per = type === affects.vpn ? "note" : type === affects.vpp ? "pin" : "time";
                        stepData.volAdd = { array: add, type: "cycle", per: per },
                        stepData.volMult = { array: mul, type: "cycle", per: per }
                    } else if (type === affects.pbt || type === affects.ppn || type === affects.ppp) {
                        const per = type === affects.ppn ? "note" : type === affects.ppp ? "pin" : "time";
                        stepData.pitchAdd = { array: add, type: "cycle", per: per },
                        stepData.pitchMult = { array: mul, type: "cycle", per: per }
                    }

                    this._doc.selection.noteStepAcross(this._patternEditor, stepData);
                    isFirstRow = false;
                }
            }
        }

        /** Handles interactions of a single row, returning it + its components to be read by updatePerform */
        const createRow = (isFirstRow?: boolean): IRowData => {
            const affect = select({ value: affects.vpn },
                ...Object.keys(affects).map(key => option({ value: affects[key as keyof typeof affects] }, affects[key as keyof typeof affects])));
            const every = input({ class: "selectionOps-textbox", placeholder: "2", type: "text" });
            const add = input({ class: "selectionOps-textbox", placeholder: isFirstRow ? "1 / (maxval - minval)" : "0", type: "text" });
            const addOther = input({ class: "selectionOps-textbox", placeholder: isFirstRow ? "-1 / (maxval - minval)" : "0", type: "text" });
            const multiplyBy = input({ class: "selectionOps-textbox", placeholder: "1", type: "text" });
            const multiplyOther = input({ class: "selectionOps-textbox", placeholder: "1", type: "text" });
            const remove = button({ style: "margin-right: 4px;" }, "remove row");

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

            [affect, every, add, addOther, multiplyBy, multiplyOther]
                .forEach(o => o.addEventListener("input", updatePerform));

            return {
                generated: [
                    div({ class: "selectionOps-action"}, label({ style: "width: 100%;" },
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerAffect") }, "Affect"),
                        div({ class: "selectContainer", style: "width: 100%;" }, affect))),
                    div({ class: "selectionOps-action"}, label({}, 
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerEvery") }, "Every"), every)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerAdd") }, "Add"), add)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerAdd") }, "Otherwise add"), addOther)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerMultiply") }, "Multiply by"), multiplyBy)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerMultiply") }, "Otherwise multiply"), multiplyOther)),
                    ...(isFirstRow ? [] : [div({ class: "inlineblock"}, remove)])],
                rowAffect: affect,
                rowEvery: every,
                rowAdd: add,
                rowAddOther: addOther,
                rowMultiplyBy: multiplyBy,
                rowMultiplyOther: multiplyOther,
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

	/**
	 * The ramp GUI performs a step function consisting of the granularity, such as notes or pins, and the target
	 * property such as volume or pitch, with the chosen cycle behavior and any number of entries for add/multiply.
	 * It's the same as IStepData.
	 * 
	 * The function template is pow(num / (len - 1), {VALUE}).
	 *   - edit this until it can ramp to a specific value as well
	 *   - types of easing functions here
	 */
	private _getRampFunctionGUI() {
		interface IRowData {
            rowAffect: HTMLSelectElement;
			rowCycling: HTMLSelectElement;
            rowAdd: HTMLInputElement;
            rowMultiplyBy: HTMLInputElement;
            rowRemove: HTMLButtonElement;
            generated: HTMLDivElement[];
        }

        const rows: IRowData[] = [];
        const affects = {
            vpn: "volume per note",
            vpp: "volume per pin",
            vbt: "volume by time",
            ppn: "pitch per note",
            ppp: "pitch per pin",
            pbt: "pitch by time"
        };

        /** Reads control values to update the action when user runs the function. */
        const updatePerform = () => {
            this._stepFunction = () => {
                for (let row of rows) {
                    const stepData: IStepData = {};
                    const type = row.rowAffect.value as keyof typeof affects;
                    const or = (str: string[]) => str?.[0] === "" ? ["0"] : str;
					const add = or(row.rowAdd.value.split(','));
					const mul = or(row.rowMultiplyBy.value.split(','));
					const cycleType = row.rowCycling.value as 'cycle' | 'step' | 'normal';

                    if (type === affects.vbt || type === affects.vpn || type === affects.vpp) {
                        const per = type === affects.vpn ? "note" : type === affects.vpp ? "pin" : "time";
                        stepData.volAdd = { array: add, type: cycleType, per: per },
                        stepData.volMult = { array: mul, type: cycleType, per: per }
                    } else if (type === affects.pbt || type === affects.ppn || type === affects.ppp) {
                        const per = type === affects.ppn ? "note" : type === affects.ppp ? "pin" : "time";
                        stepData.pitchAdd = { array: add, type: cycleType, per: per },
                        stepData.pitchMult = { array: mul, type: cycleType, per: per }
                    }

                    this._doc.selection.noteStepAcross(this._patternEditor, stepData);
                }
            }
        }

        /** Handles interactions of a single row, returning it + its components to be read by updatePerform */
        const createRow = (isFirstRow?: boolean): IRowData => {
            const affect = select({ value: affects.vpn },
                ...Object.keys(affects).map(key => option({ value: affects[key as keyof typeof affects] }, affects[key as keyof typeof affects])));
            const every = input({ class: "selectionOps-textbox", placeholder: "2", type: "text" });
            const add = input({ class: "selectionOps-textbox", placeholder: isFirstRow ? "1 / (maxval - minval)" : "0", type: "text" });
            const addOther = input({ class: "selectionOps-textbox", placeholder: isFirstRow ? "-1 / (maxval - minval)" : "0", type: "text" });
            const multiplyBy = input({ class: "selectionOps-textbox", placeholder: "1", type: "text" });
            const multiplyOther = input({ class: "selectionOps-textbox", placeholder: "1", type: "text" });
            const remove = button({ style: "margin-right: 4px;" }, "remove row");

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

            [affect, every, add, addOther, multiplyBy, multiplyOther]
                .forEach(o => o.addEventListener("input", updatePerform));

            return {
                generated: [
                    div({ class: "selectionOps-action"}, label({ style: "width: 100%;" },
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerAffect") }, "Affect"),
                        div({ class: "selectContainer", style: "width: 100%;" }, affect))),
                    div({ class: "selectionOps-action"}, label({}, 
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerEvery") }, "Every"), every)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerAdd") }, "Add"), add)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerAdd") }, "Otherwise add"), addOther)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerMultiply") }, "Multiply by"), multiplyBy)),
                    div({ class: "selectionOps-action"}, label({},
                        div({ class: "tip", onclick: () => this._tipHandler("selectionStepStaggerMultiply") }, "Otherwise multiply"), multiplyOther)),
                    ...(isFirstRow ? [] : [div({ class: "inlineblock"}, remove)])],
                rowAffect: affect,
                rowEvery: every,
                rowAdd: add,
                rowAddOther: addOther,
                rowMultiplyBy: multiplyBy,
                rowMultiplyOther: multiplyOther,
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
}