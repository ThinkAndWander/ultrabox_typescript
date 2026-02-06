import { NotePin, Note, Pattern, Config } from "../synth/synth";
import { ChangeSequence } from "./Change";
import { SongDocument } from "./SongDocument";
import { ChangeNotesAdded, ChangeSplitNotesAtPoint, mod, pitchToPositionInScale, positionInScaleToPitch, removeRedundantPins, snapNoteToScale, snapPitchToScale } from "./changes";

/** Merges adjacent notes that share the same pitches in the given range.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeMergeAcrossAdjacent extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        let notesArray = pitchIndex === undefined ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);
        if (notesArray.length <= 1) { return; }

        let note: Note;
        let prevNote: Note | null = null;
        for (let i = 1; i < notesArray.length; i++) {
            note = notesArray[i];
            prevNote = notesArray[i - 1];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }
            if (prevNote.end <= x1 || prevNote.start >= x2) { continue; }

            const lastInterval = prevNote.pins[prevNote.pins.length - 1].interval;
            if (note.start === prevNote.end
                && note.pitches.length === prevNote.pitches.length
                && (new Set(note.pitches) as any).isSubsetOf(new Set(prevNote.pitches.map(pitch => pitch + lastInterval)))) {

                // sync again with for loop to pick up changes in main array and avoid recursive lock
                // sync before the new change so that it lags behind by 1 the same as the regular array.
                notesArray = pitchIndex === undefined
                    ? pattern.notes
                    : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);

                this.append(new ChangeMergeAcross(doc, pattern, prevNote.start, note.end, pitchIndex));
                prevNote = null;
                i -= 1;
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Merges notes in the given range, and will even push by 1, or delete pins to guarantee a merge.
 * This is incompatible with mod channels.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeMergeAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        if (pattern.notes.length <= 1) { return; }

        let note: Note;
        let firstNote: Note | null = null;
        let lastNote: Note | null = null;
        let basePitch = 0, notePitch = 0;
        let notePinList: NotePin[] = [];

        for (let i = 0; i < pattern.notes.length; i++) {
            note = pattern.notes[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }
            if (pitchIndex !== undefined && (note.pitches.length !== 1 || note.pitches[0] !== pitchIndex)) {
                continue;
            }

            if (!firstNote) {
                firstNote = note;
                basePitch = Math.min(...firstNote.pitches);
                notePinList = firstNote.pins;
            }

            if (!lastNote || note.end > lastNote.end) {
                lastNote = note;
            }

            if (note !== firstNote) {
                pattern.notes.splice(i, 1);
                i--;

                notePitch = Math.min(...note.pitches);

                // Accumulate pins across notes (adjust relative values based on first note)
                let newPin: NotePin;
                let lastPin = notePinList.length > 0 ? notePinList[notePinList.length - 1] : null;
                let pinBeforeLast: NotePin | null;
                for (const pin of note.pins) {
                    newPin = {
                        interval: notePitch + pin.interval - basePitch,
                        size: pin.size,
                        time: note.start - firstNote.start + pin.time
                    };

                    // If the last note's ending pin is fully redundant with the start of the new note, or if it has
                    // a length of 1, delete the last note's ending pin. Else, if they have the same time but aren't
                    // identical, nudge the last note's end pin backwards 1 unit of time.
                    if (lastPin) {
                        pinBeforeLast = notePinList.length > 1 ? notePinList[notePinList.length - 2] : null;
                        if (newPin.time == lastPin.time) {
                            // Delete prior pin if it's fully redundant with this one.
                            // Delete prior pin if it can't be nudged back by 1 (time - 1 conflicts with pin before it).
                            if ((newPin.interval === lastPin.interval && newPin.size === lastPin.size) ||
                                (pinBeforeLast && lastPin.time - 1 == pinBeforeLast.time)) {
                                notePinList.splice(notePinList.length - 1, 1);
                            } else {
                                // Adjust last pin time backwards by 1 since it's not redundant and is nudgeable.
                                lastPin.time -= 1;
                            }
                        }
                    }

                    notePinList.push(newPin);
                }
            }
        }

        // Nothing to merge if entire range is one note, or if no notes were found in range.
        if (firstNote === lastNote || !firstNote || !lastNote) {
            return;
        }

        // Span the first note through all pins, assuming its pitches across the full length.
        firstNote.end = lastNote.end;
        firstNote.pins = notePinList;

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Creates single notes to span the empty space between any two notes in the given range.
 * These notes have the pitch array of the note to their left.
 * doBends is unavailable for mod channels.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param grow If true, instead of creating bridge notes, extends the existing notes.
 * @param doBends If true, the bridge notes end with the right note's starting pitch and volume.
 * @param copyEnds If true, the bridge notes copy the left note's start volume; also end unless bends are performed.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeBridgeAcross extends ChangeSequence {
    private _notesInserted: Note[] = [];
    private _pattern: Pattern;
    constructor(doc: SongDocument, pattern: Pattern, grow: boolean, doBends: boolean, copyEnds: boolean, x1?: number, x2?: number, pitchIndex?: number) {
        super();
        this._pattern = pattern;

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        let notesArray = pitchIndex === undefined ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);
        if (notesArray.length <= 1) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2)); }

        let note: Note;
        let prevNote: Note | null;
        let noteLeftOfSelection: number | null = null;
        let startSize: number;
        let newNote: Note;
        for (let i = 0; i < notesArray.length; i++) {
            note = notesArray[i];

            // Skip out-of-bounds notes
            if (note.end <= x1) { noteLeftOfSelection = i; continue; }
            if (note.start >= x2) { break; }

            // Don't bridge from the note left of selection to first within.
            if (i - 1 == noteLeftOfSelection) { continue; }

            if (i > 0) {
                prevNote = notesArray[i - 1];
                if (note.start - prevNote.end > 0) {
                    startSize = copyEnds ? prevNote.pins[0].size : prevNote.pins[prevNote.pins.length - 1].size;
                    newNote = new Note(-1, prevNote.end, note.start, startSize, false);

                    // Adjust pitch so first pin has 0 interval
                    newNote.pitches = [];
                    for (let pitch of prevNote.pitches) {
                        newNote.pitches.push(pitch + prevNote.pins[prevNote.pins.length - 1].interval);
                    }

                    newNote.pins[1].size =
                        copyEnds ? prevNote!.pins[prevNote.pins.length - 1].size :
                        doBends ? note.pins[0].size :
                        newNote.pins[1].size;

                    if (pitchIndex === undefined && doBends) {
                        newNote.pins[1].interval = note.pitches[0] - newNote.pitches[0] + note.pins[0].interval;
                    }

                    this._notesInserted.push(newNote);
                }
            }
        }

        if (this._notesInserted.length === 0) {
            return;
        }

        this.append(new ChangeNotesAdded(doc, pattern, [], this._notesInserted));

        if (grow) {
            // Update again, even recreating the filtered view for mod channels as we compare indices from earlier.
            notesArray = pitchIndex === undefined
                ? pattern.notes
                : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);

            for (let i = this._notesInserted.length - 1; i >= 0; i--) {
                const index = notesArray.indexOf(this._notesInserted[i]);
                if (index !== -1) {
                    this.append(new ChangeMergeAcrossAdjacent(doc, pattern,
                        notesArray[index - 1].start,
                        notesArray[index].end, pitchIndex));
                }
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }

    /**
     * Performs a callback per-note added from this operation. Only includes matching notes.
     * Return true anytime to exit early.
    */
    public perNote(callback: (note: Note) => boolean | void) {
        if (callback === null) { return; }

        for (const entry of this._notesInserted) {
			if (this._pattern.notes.includes(entry) && callback(entry)) { return; }
        }
    }
}

/** Performs cuts spread across the given range, which separate any notes they intersect.
 * Cuts are performed like space-around, not space-between, for a CSS analogy.
 * 
 * x1, x2 defaults to active selection. This is intended to be overridden to control where the operation works.
 * @param numCuts How many.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeSplitAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, numCuts: number, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (pattern.notes.length === 0) { return; } // Don't need to filter for pitchIndex since this function just calls others that do.

        const range = x2 - x1;
        numCuts = Math.min(numCuts, x2 - x1 - 1);
        if (numCuts < 1 || range <= 1) { return; }

        let cutIndices: number[] = [];

        if (numCuts === 1) {
            cutIndices.push(Math.round((x1 + x2) / 2));
        } else {
            const chunk = Math.max(range / (numCuts + 1), 1); // Never less than 1 for time.
            let cut: number;
            for (let i = 1; i < numCuts + 1; i++) {
                // Always cut integer sizes or greater; never the same spot twice.
                cut = Math.round(x1 + chunk * i);
                if (cutIndices.length === 0 || cutIndices[cutIndices.length - 1] !== cut) {
                    cutIndices.push(cut)
                }
            }
        }

        for (let i = 0; i < cutIndices.length; i++) {
            this.append(new ChangeSplitNotesAtPoint(doc, pattern, cutIndices[i], pitchIndex));
        }

        if (cutIndices.length > 0) {
            doc.notifier.changed();
            this._didSomething();    
        }
    }
}

/** Stacks all notes in range to the left side so that they're all touching.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeStackLeftAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        const notesArray = pitchIndex === undefined ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);
        if (notesArray.length === 0) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex)); }

        let firstNote = false;
        for (let i = 0; i < notesArray.length; i++) {
            const note = notesArray[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }

            if (!firstNote) {
                firstNote = true;
                note.start = x1;
                note.end = note.start + note.pins[note.pins.length - 1].time;
            } else if (i > 0) {
                note.start = notesArray[i - 1].end;
                note.end = note.start + note.pins[note.pins.length - 1].time;
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/**
 * Supplies arguments to the step function, which centers around arrays of numbers and/or math expressions that include
 * special variables, unprefixed Math function calls, and ternary comparisons using ==. Affect determines the data
 * set to iteratively edit. Only one entry in add/mult are used in computation at a time, and the index is determined
 * based on Type, while Per determines the current:length ratio passed into variables used by many of the presets.
 * 
 * @param add Numbers or string math expressions like "round(x + maxrange/2)". When applied, results will safely clamp.
 * If volume is affected, these values get multiplied by (maxrange - minrange). First multiply is performed, then add.
 * @param mult See add.
 * @param affects Whether to affect note pin volumes, or note base pitch (no pitch bends). Pitch edits are unavailable
 * for modulation channels and disabled in the GUI.
 * @param type How the array indices are chosen. "Stretch" (default) interpolates the actual resulting values
 * across the range, e.g. [0, 1] will compute as 0 to start, 0.5 at center and 1 at end of the range. "Step" similarly
 * stretches the chosen index across the range, but it doesn't interpolate the actual results. So [0, 1] will be 0 
 * until midway through the selection, then it'll be 1 for the rest of it. "Per" determines which ratio is used for the
 * special values "num" and "len" which act as a ratio of current:length (a value from zero to one) where "note" counts
 * up for each note, pins for each pin, and time is based on the absolute start position of the pin being evaluated.
 * Pitch is always treated using the "note" ratio.
 * @param onlyExistingPins Normally, certain configurations of options will make a pin in every possible spot, edit the
 * values, and then merge redundant pins away again, but this creates sudden value shifts which could be smoother if no
 * pin was inserted, since the synth engine interpolates between values a user cannot pin. When true, no new pins are
 * created in these scenarios. Unavailable if affects = note base pitch.
*/
export interface IStepData {
    add?: (number|string)[]
    mult?: (number|string)[]
    affect: 'vol'|'pitch'|'bends'
    type?: 'stretch'|'step'|'cycle'
    per?: 'note'|'pin'|'time'
    onlyExistingPins?: boolean
}

/** Adjusts volume/pitch across the given range using arrays of expressions & numbers to add and multiply.
 * 
 * You supply value(s) to multiply or add, in that order, and they're applied according to the interpretation behavior,
 * multiplied by current/total fraction. See IStepData for details.
 * 
 * @param data Any of a few arrays to multiply or add (in that order) volume and pitch.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
*/
export class ChangeStepAcross extends ChangeSequence {
    constructor(doc: SongDocument, channelIndex: number, pattern: Pattern, data: IStepData, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        // Runs guaranteed-safe eval on expressions in the array with variable substitutions.
        // whitelist is 0-9A-Za-z space and .!&|+-*/%=<>?:,() except the function sequences () and =>.
        const matchVariables = /(?<!\w)([a-zA-Z]+)\w*/
        const matchNotWhitelist = /[^0-9A-Za-z. !&|+\-*\/%=<>?:,()]|=\s*>/

        /** Given one expression or number, injects all variables and resolves everything to a number, or 0 on failure. */
        function resolve(entry: string | number, curr: number, stepInLength: number, endNum: number, info: noteData) {
            if (typeof entry === 'number') { return entry; }
            const scaleForVol = (data.affect === 'vol') ? volRange : 1
            const relPrev = (data.affect === 'vol') ? info.notePinSize.prev : (data.affect === 'bends') ? info.notePinInterval.prev : info.notePitch.prev
            const relAvg = (data.affect === 'vol') ? info.notePinSize.avg : (data.affect === 'bends') ? info.notePinInterval.avg : info.notePitch.avg

            try {
                entry = entry
                    .replaceAll(matchVariables, match => {
                        match = match.trim().toLowerCase();

                        // Allow members named in Math. Add the prefix automatically
                        return Object.hasOwn(Math, match) ? `Math.${match}`
                            : Object.hasOwn(Math, match.toUpperCase()) ? `Math.${match.toUpperCase()}`
                            // Allow substitutions with current values, for user to use
                            : match === 'x' ? String(curr)
                            : match === 'prev' ? String((relPrev ?? 0) / scaleForVol)
                            : match === 'num' ? String(stepInLength)
                            : match === 'len' ? String(endNum === 0 ? 1 : endNum)
                            : match === 'avg' ? String((relAvg ?? 0) / scaleForVol)
                            : match === 'maxrange' ? String(data.affect === 'vol' ? maxVolume : pitchLimit)
                            : match === 'minrange' ? String(data.affect === 'vol' ? minVolume : 0)
                            : match === 'pitchesavg' ? String(info.allLowPitch?.avg ?? 0)
                            : match === 'pitchesmax' ? String(info.allLowPitch?.max ?? 0)
                            : match === 'pitchesmin' ? String(info.allLowPitch?.min ?? 0)
                            : match === 'pitchavg' ? String(info.notePitch?.avg ?? 0)
                            : match === 'pitchprev' ? String(info.notePitch?.prev ?? 0)
                            : match === 'pitch' ? String(info.notePitch?.curr ?? 0)
                            : match === 'bendsavg' ? String(info.allPinInterval?.avg ?? 0)
                            : match === 'bendsmax' ? String(info.allPinInterval?.max ?? 0)
                            : match === 'bendsmin' ? String(info.allPinInterval?.min ?? 0)
                            : match === 'bendavg' ? String(info.notePinInterval?.avg ?? 0)
                            : match === 'bendprev' ? String(info.notePinInterval?.prev ?? 0) // only for "vol" or "bends"
                            : match === 'bend' ? String(info.notePinInterval?.curr ?? 0) // only for "vol" or "bends"
                            : match === 'volsavg' ? String((info.allPinSize?.avg ?? 0) / volRange)
                            : match === 'volsmax' ? String((info.allPinSize?.max ?? 0) / volRange)
                            : match === 'volsmin' ? String((info.allPinSize?.min ?? 0) / volRange)
                            : match === 'volavg' ? String((info.notePinSize?.avg ?? 0) / volRange)
                            : match === 'volprev' ? String((info.notePinSize?.prev ?? 0) / volRange) // only for "vol" or "bends"
                            : match === 'vol' ? String((info.notePinSize?.curr ?? 0) / volRange) // only for "vol" or "bends"
                            : ''});
                entry = entry.replaceAll(matchNotWhitelist, ''); // symbols except +-*/?:!()%&|. Clears () and =>
                entry = +(Function('return ' + entry)()); // Execute. Same as eval without the warning

                return (typeof entry === 'number' && !isNaN(entry) && isFinite(entry)) ? entry : 0;
            } catch {
                return 0;
            }
        }

        /** Resolves the index to an array, then that expression or number, and returns the final number or undefined on failure. */
        function getArrayValue(val: number, index: number, ratios: number[], lengths: number[], data: IStepData, stepArray: (number|string)[] | undefined, info: noteData) {
            if (!stepArray) { return undefined; }
            if (ratios.length === 3 && stepArray?.length !== 0) {
                const slot =
                    data.per === 'note' ? 0 :
                    data.per === 'pin' ? 1 :
                    2;

                const current = ratios[slot] * lengths[slot];

                if (data.type !== 'cycle') {
                    const numbersLR = [
                        resolve(stepArray[Math.floor(ratios[slot] * (stepArray.length - 1))], val, current, lengths[slot], info),
                        resolve(stepArray[Math.ceil(ratios[slot] * (stepArray.length - 1))], val, current, lengths[slot], info)];
                    let fraction = ratios[slot] * (stepArray.length - 1) - Math.floor(ratios[slot] * (stepArray.length - 1))
                    return data.type === 'step'
                        ? fraction <= 0.5 ? numbersLR[0] : numbersLR[1]
                        : numbersLR[0] + fraction * (numbersLR[1] - numbersLR[0])
                }
                
                return resolve(stepArray[index % stepArray.length], val, current, lengths[slot], info);
            }

            return undefined;
        }

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);

        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }
        if (pattern.notes.length === 0) { return; }

        // Usually, volume goes from 0 to Config.noteSizeMax. But both min and max can be different for mod channels,
        // so use the range of the one nearest the mouse, or if there isn't one nearby, pick the first (highest pitch).
        let minVolume = 0;
        let maxVolume = Config.noteSizeMax;
        let isModChannel = doc.song.getChannelIsMod(channelIndex);

        if (isModChannel) {
            const modTrack = pitchIndex ? Config.modCount - pitchIndex - 1 : 0;
            let mod = doc.song.channels[doc.channel].instruments[doc.getCurrentInstrument()].modulators[modTrack];
            minVolume = Config.modulators[mod].convertRealFactor;
            maxVolume = minVolume + doc.song.getVolumeCapForSetting(true, mod, doc.song.channels[doc.channel].instruments[doc.getCurrentInstrument()].modFilterTypes[modTrack]);
        }
        let volRange = maxVolume - minVolume;

        // Split now and re-merge later if needed.
        let intersects = getIntersects(doc, pattern, x1, x2, pitchIndex, this);

        // Find the start/end indices to find how many notes are in range.
        let note: Note;
        let prevNote: Note | undefined;
        let firstIndex = intersects.L !== -1 ? intersects.L + 1 : -1;
        let endIndex = intersects.R !== -1 ? intersects.R - 1 : -1;
        for (let i = 0; i < pattern.notes.length; i++) {
            note = pattern.notes[i];

            if (isModChannel && (note.pitches.length !== 1 || note.pitches[0] !== pitchIndex)) { continue; }
            if (note.end <= x1) { continue; }
            if (note.start >= x2) { endIndex = i - 1; break; }
            if (firstIndex === -1) { firstIndex = i; }
        }
        if (endIndex === -1 && isModChannel) {
            endIndex = pattern.notes.findLastIndex((note) => note.pitches.length === 1 && note.pitches[0] === pitchIndex);
        }
        if (endIndex === -1) { endIndex = pattern.notes.length - 1; }
        if (firstIndex === -1) { return; } // No notes due to filtering i.e. mod channel w/o notes matching pitchIndex.

        type noteData = {
            notePinSize: { avg?: number, prev?: number, curr?: number },
            allPinSize: { min?: number, max?: number, avg?: number },
            notePinInterval: { avg?: number, prev?: number, curr?: number },
            allPinInterval: { min?: number, max?: number, avg?: number }
            notePitch: { avg?: number, prev?: number, curr?: number },
            allLowPitch: { min?: number, max?: number, avg?: number }
        }

        // Collects cross-note measurements to pass to the algorithm.
        const init = { min: Number.MAX_SAFE_INTEGER, max: Number.MIN_SAFE_INTEGER, avg: 0 }
        const noteData: noteData = {
            allPinSize: { ...init }, notePinSize: { avg: 0 },
            allLowPitch: { ...init }, notePitch: { avg: 0 },
            allPinInterval: { ...init }, notePinInterval: { avg: 0 }
        };

        let noteCount = 0;
        for (let i = firstIndex; i < endIndex + 1; i++) {
            note = pattern.notes[i];
            if (isModChannel && (
                    note.pitches.length !== 1 ||
                    note.pitches[0] !== pitchIndex ||
                    note.pins.some(pin => pin.interval !== 0))) {
                continue;
            }

            const basePitch = Math.min(...note.pitches);
            noteData.allLowPitch.min = Math.min(noteData.allLowPitch.min!, basePitch);
            noteData.allLowPitch.max = Math.max(noteData.allLowPitch.max!, basePitch);
            noteData.allLowPitch.avg = noteData.allLowPitch.avg! + basePitch;

            let pinAvg = 0;
            const pinSizes = note.pins.map(p => { pinAvg += p.size; return p.size; });
            noteData.allPinSize.min = Math.min(...pinSizes, noteData.allPinSize.min!);
            noteData.allPinSize.max = Math.max(...pinSizes, noteData.allPinSize.max!);
            noteData.allPinSize.avg = noteData.allPinSize.avg! + (pinAvg / pinSizes.length);

            pinAvg = 0;
            const pinIntervals = note.pins.map(p => { pinAvg += p.interval; return p.interval; });
            noteData.allPinInterval.min = Math.min(...pinIntervals, noteData.allPinInterval.min!);
            noteData.allPinInterval.max = Math.max(...pinIntervals, noteData.allPinInterval.max!);
            noteData.allPinInterval.avg = noteData.allPinInterval.avg! + (pinAvg / pinIntervals.length);

            noteCount++;
        }
        noteData.allLowPitch.min = pitchToPositionInScale(doc, noteData.allLowPitch.min!);
        noteData.allLowPitch.max = pitchToPositionInScale(doc, noteData.allLowPitch.max!);
        noteData.allLowPitch.avg = pitchToPositionInScale(doc, noteData.allLowPitch.avg! / noteCount);
        noteData.allPinSize.avg = noteData.allPinSize.avg! / noteCount;
        noteData.allPinInterval.avg = noteData.allPinInterval.avg! / noteCount;

        let prevLowPitch = -1;

        const pitchLimit =
            doc.song.getChannelIsMod(channelIndex) ? Config.modCount :
            doc.song.getChannelIsNoise(channelIndex) ? Config.drumCount - 1 :
            Config.maxPitch;
        const noteEndNum = endIndex - firstIndex;
        let multValue = 1;
        let addValue = 0;

        let noteRatio: number;
        let notePinOrPitchRatio: number;
        let timeRatio: number;
        let endNums: number[];
        let ratios: number[];

        for (let i = firstIndex; i < endIndex + 1; i++) {
            note = pattern.notes[i];
            prevNote = (i > 0) ? pattern.notes[i - 1] : undefined;

            if (isModChannel && (
                note.pitches.length !== 1 ||
                note.pitches[0] !== pitchIndex ||
                note.pins.some(pin => pin.interval !== 0))) {
                continue;
            }

            // Collects this-note measurements to pass to the algorithm, except previous pin values.
            let avgSize = 0;
            let avgInterval = 0;
            note.pins.forEach(pin => {
                avgSize += pin.size;
                noteData.notePinSize.avg = noteData.notePinSize.avg! + pin.size;
                avgInterval += pin.interval;
                noteData.notePinInterval.avg = noteData.notePinInterval.avg! + pin.interval;
            });
            noteData.notePinSize.avg = noteData.notePinSize.avg! / note.pins.length;
            noteData.notePinInterval.avg = noteData.notePinInterval.avg! / note.pins.length;
            noteData.notePitch.avg = pitchToPositionInScale(doc, note.pitches.reduce((prev, curr) => prev + curr) / note.pitches.length);
            noteData.notePitch.curr = pitchToPositionInScale(doc, Math.min(...note.pitches));
            noteData.notePitch.prev = prevLowPitch;
            prevLowPitch = noteData.notePitch.curr;

            noteRatio = noteEndNum === 0 ? 1 : (i - firstIndex) / noteEndNum;

            // Automatically insert pins to fill all unoccupied slots in the note. Redundant pins will be removed later.
            // This makes it easy to never mess up for an algorithm or have to worry about hand-crafted timing, but it
            // comes with the caveat that two pins in a row will be preserved to allow holding a value, which means e.g.
            // a pitch or volume change across inserted pins will be near-instant, occurring between a time difference of
            // usually 1 unit. In other words, it creates a stepping effect, which is a drawback only because while the
            // actual values that can be saved are highly restrictive, the engine lerps between values and so it's best
            // to default to it. I think this can be modified to enable that if you track the pre-existing and inserted
            // pins and run a more aggressive version of remove redundant pins which does not allow two in a row, across
            // all of the ranges of inserted pins. But I won't be going that far. It's also worth mentioning that there
            // can be valuable changes in volume that causes similar stepping effects in pitch, and vice versa, since
            // pins couple both volume and pitch (I believe this to be a design flaw now).

            if (!data.onlyExistingPins && (data.affect === 'vol' || data.affect === 'bends')) {
                let pin: NotePin;
                let prev: NotePin;
                let timeSince: number;
                let lerpTime: number;

                // Cycle and many of the variables change across time, but the rest is redundant and we don't add pins for them.
                const regex = /num|random|prev|x|\?.*?:/gi;
                const allPins = (data.type === 'cycle' ||
                    [data.add, data.mult].some(arr => arr?.some(p => typeof p === 'string' && p.match(regex))));
                const allPinInserts = allPins ? []
                    : [data.add, data.mult].map(arr => Math.round(doc.song.partsPerPattern / (arr?.length ?? 1)));

                for (let pind = 1; pind < note.pins.length; pind++) {
                    pin = note.pins[pind];
                    prev = note.pins[pind - 1];
                    timeSince = pin.time - prev.time;

                    let time: number;
                    for (let step = 1; step < timeSince; step++) {
                        lerpTime = step/timeSince;
                        time = prev.time + step;

                        if (allPins || allPinInserts.some(o => time % o === 0)) {
                            note.pins.splice(pind, 0, {
                                ...prev,
                                interval: Math.round(prev.interval + lerpTime * (pin.interval - prev.interval)),
                                size: Math.round(prev.size + lerpTime * (pin.size - prev.size)),
                                time: prev.time + step
                            })
                            pind++;
                        }
                    }
                }
            }

            let indexToPass;

            // Affect the pin sizes (volumes).
            if (data.affect === 'vol') {
                endNums = [noteEndNum, note.pins.length - 1, pattern.notes[endIndex].end - pattern.notes[firstIndex].start]

                for (let j = 0; j < note.pins.length; j++) {
                    notePinOrPitchRatio = j / endNums[1];
                    timeRatio = (note.start - pattern.notes[firstIndex].start + note.pins[j].time) / endNums[2];
                    ratios = [noteRatio, notePinOrPitchRatio, timeRatio];
    
                    noteData.notePinSize.curr = note.pins[j].size;
                    noteData.notePinInterval.curr = note.pins[j].interval;
                    noteData.notePinSize.prev = (j !== 0)
                        ? note.pins[j - 1].size : (prevNote)
                        ? prevNote.pins[prevNote.pins.length - 1].size
                        : -1;
                    noteData.notePinInterval.prev = (j !== 0)
                        ? note.pins[j - 1].interval : (prevNote)
                        ? prevNote.pins[prevNote.pins.length - 1].interval
                        : -1;

                    indexToPass = data.per === 'note' ? i - firstIndex : j;
                    multValue = getArrayValue(note.pins[j].size / volRange, indexToPass, ratios, endNums, data, data.mult, noteData) ?? multValue;
                    addValue = getArrayValue(note.pins[j].size / volRange, indexToPass, ratios, endNums, data, data.add, noteData) ?? addValue;
    
                    // Perform. Note that mod channels express pins in the range 0 to MIN+MAX instead of -MIN to +MAX.
                    note.pins[j].size *= multValue;
                    note.pins[j].size = Math.round(note.pins[j].size + addValue * volRange);
                    note.pins[j].size = Math.max(Math.min(note.pins[j].size, volRange), 0);
                }
            }

            // Affect the base (lowest) pitches and/or the current note's pitches.
            else if (!isModChannel && data.affect === 'pitch') {
                endNums = [noteEndNum, Math.max(note.pitches.length - 1, 1), pattern.notes[endIndex].end - pattern.notes[firstIndex].start]
                timeRatio = (note.start - pattern.notes[firstIndex].start + note.pins[note.pins.length - 1].time) / endNums[2];

                // pitches treat "time" ratio always as the "note" granularity because there is no concept of current pin.
                for (let j = 0; j < note.pitches.length; j++) {
                    notePinOrPitchRatio = j / endNums[1];
                    ratios = [noteRatio, notePinOrPitchRatio, timeRatio];

                    noteData.notePitch.curr = pitchToPositionInScale(doc, note.pitches[j]);
                    noteData.notePitch.prev = (j !== 0) ? pitchToPositionInScale(doc, note.pitches[j]) : -1;

                    indexToPass = data.per === 'note' ? i - firstIndex : j;
                    multValue = getArrayValue(noteData.notePitch.curr, indexToPass, ratios, endNums, data, data.mult, noteData) ?? multValue;
                    addValue = getArrayValue(noteData.notePitch.curr, indexToPass, ratios, endNums, data, data.add, noteData) ?? addValue;

                    // Do arithmetic on scale index and convert back, then clamp.
                    note.pitches[j] = positionInScaleToPitch(doc, pitchToPositionInScale(doc, note.pitches[j]) * multValue + addValue);
                    note.pitches[j] = Math.max(Math.min(note.pitches[j], pitchLimit), 0);
                }

                note.pitches = [...new Set(note.pitches)]; // Keep unique.

                let indLow = -1;
                let indHi = -1;
                note.pitches.forEach((pitch, index) => {
                    if (indLow === -1 || pitch < note.pitches[indLow]) { indLow = index; }
                    if (indHi === -1 || pitch > note.pitches[indHi]) { indHi = index; }
                })

                note.pins.forEach(pin => {
                    if (note.pitches[indLow] + pin.interval < 0) { pin.interval += Math.abs(note.pitches[indLow] + pin.interval); }
                    if (note.pitches[indHi] + pin.interval > pitchLimit) { pin.interval -= (note.pitches[indHi] + pin.interval - pitchLimit); }
                    pin.interval = snapPitchToScale(doc, note.pitches[indLow] + pin.interval) - note.pitches[indLow]; // scale if any
                })
            }

            // Affect the changes in pitch (the pitch bends).
            // Note pin size/interval reports the previous note value.
            else if (!isModChannel && data.affect === 'bends') {
                endNums = [noteEndNum, note.pins.length - 1, pattern.notes[endIndex].end - pattern.notes[firstIndex].start]

                // The first pitch bend to consider is at the first pin, which due to logic restrictions means the
                // interval = 0 and previous pin size/interval the last note's ending pin. Any add/mult value besides
                // zero gets applied to every pitch on the note, and the change is recorded to a variable because every
                // subsequent pin then has to be offset by it in order to preserve this change.
                let indLow = -1;
                let indHi = -1;
                let basePitchShift = 0;
                for (let j = 0; j < note.pitches.length; j++) {
                    const origValue = note.pitches[j];

                    if (j === 0) {
                        timeRatio = (note.start - pattern.notes[firstIndex].start + note.pins[0].time) / endNums[2];
                        ratios = [noteRatio, 0, timeRatio];
                        indexToPass = data.per === 'note' ? i - firstIndex : 0;

                        noteData.notePinSize.curr = note.pins[j].size;
                        noteData.notePinInterval.curr = note.pins[j].interval;
                        noteData.notePinSize.prev = prevNote?.pins[prevNote.pins.length - 1].size ?? -1;
                        noteData.notePinInterval.prev = prevNote?.pins[prevNote.pins.length - 1].interval ?? -1;

                        // Interval of 1st pin is zero, so multiplying with it is pointless. Skip.
                        addValue = getArrayValue(0, indexToPass, ratios, endNums, data, data.add, noteData) ?? addValue;
                    }

                    // Do arithmetic on scale index and convert back, then clamp.
                    note.pitches[j] = positionInScaleToPitch(doc, Math.round(
                        pitchToPositionInScale(doc, note.pitches[j]) + addValue));
                    note.pitches[j] = Math.max(Math.min(note.pitches[j], pitchLimit), 0);

                    if (j === 0) { basePitchShift = note.pitches[0] - origValue; }
                    if (indLow === -1 || note.pitches[j] < note.pitches[indLow]) { indLow = j; }
                    if (indHi === -1 || note.pitches[j] > note.pitches[indHi]) { indHi = j; }
                }
                note.pitches = [...new Set(note.pitches)]; // Keep unique.

                // Continue evaluating each pin starting with the 2nd.
                for (let j = 1; j < note.pins.length; j++) {
                    notePinOrPitchRatio = j / endNums[1];
                    timeRatio = (note.start - pattern.notes[firstIndex].start + note.pins[j].time) / endNums[2];
                    ratios = [noteRatio, notePinOrPitchRatio, timeRatio];
    
                    noteData.notePinSize.curr = note.pins[j].size;
                    noteData.notePinInterval.curr = note.pins[j].interval;
                    noteData.notePinSize.prev = note.pins[j - 1].size;
                    noteData.notePinInterval.prev = note.pins[j - 1].interval;

                    indexToPass = data.per === 'note' ? i - firstIndex : j;
                    multValue = getArrayValue(note.pins[j].interval, indexToPass, ratios, endNums, data, data.mult, noteData) ?? multValue;
                    addValue = getArrayValue(note.pins[j].interval, indexToPass, ratios, endNums, data, data.add, noteData) ?? addValue;

                    // Do arithmetic on scale index and convert back, then clamp.
                    note.pins[j].interval = positionInScaleToPitch(doc, Math.round(
                        pitchToPositionInScale(doc, note.pins[j].interval + note.pitches[indLow] - basePitchShift) * multValue + addValue))
                        - note.pitches[indLow];

                    if (note.pitches[indLow] + note.pins[j].interval < 0) {
                        note.pins[j].interval += Math.abs(note.pitches[indLow] + note.pins[j].interval);
                    }
                    if (note.pitches[indHi] + note.pins[j].interval > pitchLimit) {
                        note.pins[j].interval -= (note.pitches[indHi] + note.pins[j].interval - pitchLimit);
                    }
                    
                    // Snap to scale after clamping, in case it clamps to top/bottom but there's no position there.
                    note.pins[j].interval = snapPitchToScale(doc, note.pitches[indLow] + note.pins[j].interval) - note.pitches[indLow];
                }
            }

            // If pins were interacted with, remove excess pins to keep UI clean.
            if (data.affect === 'vol' || data.affect === 'bends') {
                removeRedundantPins(note.pins);

                // When pins are edited, notes should re-merge at the ends of the selection in case it was split, as pin edits
                // don't logically involve splitting notes, but it was necessary to greatly simplify iterating the notes.
                if (!isModChannel) {
                    if (intersects.L !== -1) {
                        this.append(new ChangeMergeAcross(doc, pattern, pattern.notes[intersects.L].start, pattern.notes[intersects.L + 1].end, pitchIndex))
                        intersects.R--;
                    }
                    if (intersects.R > -1) {
                        this.append(new ChangeMergeAcross(doc, pattern, pattern.notes[intersects.R - 1].start, pattern.notes[intersects.R].end, pitchIndex))
                    }
                }
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Spreads notes horizontally across the given range such that they have equal space between. Centers single notes.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
*/
export class ChangeSpreadAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        const notesArray = pitchIndex === undefined ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);
        if (notesArray.length === 0) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex)); }

        // Get the total free space available and number of notes in the range.
        let note: Note;
        let totalSpace = 0;
        let firstIndex = -1;
        let finalIndex = -1;
        for (let i = 0; i < notesArray.length; i++) {
            note = notesArray[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { finalIndex = i - 1; break; }

            if (firstIndex === -1) {
                firstIndex = i;
                totalSpace += note.start - x1;
            } else {
                totalSpace += note.start - notesArray[i - 1].end;
            }
        }
        if (finalIndex === -1) { finalIndex = notesArray.length - 1; }
        totalSpace += x2 - notesArray[finalIndex].end;

        if (totalSpace === 0) { return; }

        // Stack left, leaving no space.
        const spaceBetween = totalSpace / (finalIndex - firstIndex);
        this.append(new ChangeStackLeftAcross(doc, pattern, x1, x2, pitchIndex));

        // Add space between.
        for (let i = firstIndex; i < finalIndex + 1; i++) {
            note = notesArray[i];

            if (i === firstIndex) {
                // Center an individual note, if only one.
                if (firstIndex === finalIndex) {
                    note.start += Math.round(totalSpace / 2);
                    note.end = note.start + note.pins[note.pins.length - 1].time;
                    if (note.start !== 0) { note.continuesLastPattern = false; }
                }
            } else {
                note.start += Math.floor(spaceBetween * (i - firstIndex));
                note.end = note.start + note.pins[note.pins.length - 1].time;
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Spreads notes vertically (pitch edit) in a de/crescendo via slope detection, between detected bounds for the given
 * range. Chorused notes are placed using the computed center pitch as the origin, so that the difference in pitch
 * remains unaffected. (Note: rounding may cause drift between consecutive applications of this operation, and merge touching
 * pitches within the same note.)
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
*/
export class ChangeSpreadVertical extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }
        if (pattern.notes.length <= 1) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2)); }

        // Get the note count, the min/max pitch of every note + overall min/max, and detect slope.
        let note: Note;
        let noteCount = 0;
        let indices: { start: number, end: number } = {} as any;
        let vertBounds = { min: Number.MAX_SAFE_INTEGER, max: Number.MIN_SAFE_INTEGER };
        let notePitches: { min: number, max: number }[] = [];
        let slope = 0;

        for (let i = 0; i < pattern.notes.length; i++) {
            note = pattern.notes[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }

            noteCount++;
            indices = { start: indices.start ?? i, end: i };
            notePitches[i - indices.start] = getVerticalBounds([note], note.start, note.end);
            vertBounds = {
                min: Math.min(vertBounds.min, notePitches[i - indices.start].min),
                max: Math.max(vertBounds.max, notePitches[i - indices.start].max)
            };

            // The trendline informs whether to force a crescendo ( slope>=0), or a decrescendo.
            if (i - indices.start > 0) {
                const last = notePitches[i - indices.start - 1];
                const curr = notePitches[i - indices.start];
                const oldCenter = last.min + (last.max - last.min)/2;
                const center = curr.min + (curr.max - curr.min)/2;
                slope += center - oldCenter;
            }
        }

        if (noteCount < 2) { return; }
        if (vertBounds.max === vertBounds.min) { return; }

        // Get the total bounds.
        const vertRange = vertBounds.max - vertBounds.min;
        const verticalSpaceBetween = vertRange / (noteCount - 1);

        // Set the new note pitches based on ratio of the ranges, following trendline.
        let targetPitch: number;
        let nearestEdgeToTarget: number;
        let offset: number;

        for (let i = indices.start; i <= indices.end; i++) {
            note = pattern.notes[i];
            targetPitch = slope >= 0
                ? vertBounds.min + verticalSpaceBetween * (i - indices.start) //crescendo
                : vertBounds.max - verticalSpaceBetween * (i - indices.start); //decrescendo

            let range = notePitches[i - indices.start];
            nearestEdgeToTarget =
                ((range.min >= targetPitch) ? range.min // bottom
                : (targetPitch >= range.max) ? range.max // top
                : range.min + (range.max - range.min)/2); // center

            offset = targetPitch - nearestEdgeToTarget;

            // Add offset to pitch. For some reason this results in mathematical anomalies
            // at large range differences, which is compensated by bruteforce measure-and-fix :|
            let overageLow = 0;
            let overageHigh = 0;
            note.pitches = note.pitches.map((pitch) =>
            {
                pitch = Math.round(pitch + offset); 
                if (pitch > vertBounds.max) {
                    overageHigh = Math.max(overageHigh, pitch - vertBounds.max);
                    pitch = vertBounds.max;
                } else if (pitch < vertBounds.min) {
                    overageLow = Math.max(overageLow, vertBounds.min - pitch);
                    pitch = vertBounds.min;
                }

                return pitch;
            });

            note.pitches = note.pitches.map((pitch) => pitch - overageHigh + overageLow);
            note.pitches = [...new Set(note.pitches)]; // Keep unique.
            snapNoteToScale(doc, note);
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Stacks notes vertically (pitch edit) along the lowest detected bound for the given
 * range. Chorused notes are placed using the computed center pitch as the origin, so that the difference in pitch
 * remains unaffected. (Note: rounding may cause drift between consecutive applications of this operation, and merge touching
 * pitches within the same note.)
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
*/
export class ChangeStackBottomAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }
        if (pattern.notes.length <= 1) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2)); }

        // Get the note count, the min/max pitch of every note + overall min/max, and detect slope.
        let note: Note;
        let noteCount = 0;
        let indices: { start: number, end: number } = {} as any;
        let vertBounds = { min: Number.MAX_SAFE_INTEGER, max: Number.MIN_SAFE_INTEGER };
        let notePitches: { min: number, max: number }[] = [];

        for (let i = 0; i < pattern.notes.length; i++) {
            note = pattern.notes[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }

            noteCount++;
            indices = { start: indices.start ?? i, end: i };
            notePitches[i - indices.start] = getVerticalBounds([note], note.start, note.end);
            vertBounds = {
                min: Math.min(vertBounds.min, notePitches[i - indices.start].min),
                max: Math.max(vertBounds.max, notePitches[i - indices.start].max)
            };
        }

        if (noteCount < 2) { return; }
        if (vertBounds.max === vertBounds.min) { return; }

        // Set the new note pitches based on ratio of the ranges, following trendline.
        let targetPitch: number;
        let nearestEdgeToTarget: number;
        let offset: number;

        for (let i = indices.start; i <= indices.end; i++) {
            note = pattern.notes[i];
            targetPitch = vertBounds.min;

            let range = notePitches[i - indices.start];
            nearestEdgeToTarget =
                ((range.min >= targetPitch) ? range.min // bottom
                : (targetPitch >= range.max) ? range.max // top
                : range.min + (range.max - range.min)/2); // center

            offset = targetPitch - nearestEdgeToTarget;

            // Add offset to pitch. For some reason this results in mathematical anomalies
            // at large range differences, which is compensated by bruteforce measure-and-fix :|
            let overageLow = 0;
            let overageHigh = 0;
            note.pitches = note.pitches.map((pitch) =>
            {
                pitch = Math.round(pitch + offset); 
                if (pitch > vertBounds.max) {
                    overageHigh = Math.max(overageHigh, pitch - vertBounds.max);
                    pitch = vertBounds.max;
                } else if (pitch < vertBounds.min) {
                    overageLow = Math.max(overageLow, vertBounds.min - pitch);
                    pitch = vertBounds.min;
                }

                return pitch;
            });

            note.pitches = note.pitches.map((pitch) => pitch - overageHigh + overageLow);
            note.pitches = [...new Set(note.pitches)]; // Keep unique.
            snapNoteToScale(doc, note);
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Randomly nudges notes in range left/right by 1 time unit if possible. (Note: this is a weak implementation because
 * it goes left-to-right, thus requiring the edges to move to create the space needed to nudge notes in the center of
 * several touching notes.)
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
*/
export class ChangeTapNotesAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        const notesArray = pitchIndex === undefined ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);
        if (notesArray.length === 0) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex)); }

        let canTapLeft: boolean;
        let canTapRight: boolean;
        for (let i = 0; i < notesArray.length; i++) {
            const note = notesArray[i];

            if (note.start < x2 && note.end > x1) {
                canTapLeft = note.start > x1
                    && (i == 0 || note.start - notesArray[i - 1].end > 0);

                canTapRight = note.end < x2
                    && note.end < doc.song.partsPerPattern
                    && (i === notesArray.length - 1 || notesArray[i + 1].start - note.end > 0);

                if (canTapLeft && Math.random() >= 0.5) { note.start--; note.end--; }
                if (canTapRight && Math.random() >= 0.5) { note.start++; note.end++; }
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/**
 * Horizontally flips notes in the given range, or flips them in-place.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param inPlace If true, reverses pins without changing any note positions.
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeMirrorHorizontal extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, inPlace?: boolean, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }

        const notesArray = pitchIndex === undefined
            ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);

        if (notesArray.length === 0) { return; }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex)); }

        let note: Note;
        const firstNote = notesArray[0].clone();
        let startDist: number;
        let endDist: number;

        const center = (x1 + x2) / 2;

        for (let i = 0; i < notesArray.length; i++) {
            note = notesArray[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }
            if (!inPlace || note.pins[note.pins.length - 1].interval !== 0) {
                note.continuesLastPattern = false;
            }

            for (let j = 0; j < note.pins.length; j++) {
                note.pins[j].time = Math.abs(note.pins[j].time - note.pins[note.pins.length - 1].time);
            }
            note.pins.reverse();

            // It's so simple...but it was too hard for me to compute. So here's 2 functions.
            if (!inPlace) {
                if (note.start < center) {
                    endDist = center - note.end;
                    note.start = center + endDist
                } else {
                    startDist = note.start - center;
                    note.start = center - startDist - note.pins[note.pins.length - 1].time;
                }

                note.end = note.start + note.pins[note.pins.length - 1].time;
            }
        }

        // For mod channels, this sorts only same-pitch notes and leaves as zero otherwise to preserve order of other notes. 
        pattern.notes.sort((a, b) =>
            pitchIndex === undefined || (a.pitches.length === 1 && b.pitches.length === 1 && a.pitches[0] === b.pitches[0] && a.pitches[0] === pitchIndex)
                ? a.start - b.start
                : 0);

        // Normalize notes that don't start at interval zero.
        notesArray.forEach((entry) => {
            if (entry.pins[0].interval !== 0) {
                entry.pitches = entry.pitches.map(pitch => pitch + entry.pins[0].interval);
                entry.pins = entry.pins.map(pin => ({ ...pin, interval: pin.interval - entry.pins[0].interval }));
                // We restrict pitch + interval from exceeding bounds, so no need to clamp or ensure unique pitches.
            }
        })

        // Restore last pattern continuation if the mirrored note starts at x=0 and starts where the last note ends.
        if (pitchIndex === undefined && !inPlace && firstNote.start === 0 && notesArray[0].start === 0) {
            const sorted = notesArray[0].pitches.toSorted((a, b) => a - b);
            const sortedFirst = firstNote.pitches.toSorted((a, b) => a - b);

            if (sorted.length === sortedFirst.length &&
                sorted.every((pitch, index) => pitch === sortedFirst[index])) {
                notesArray[0].continuesLastPattern = firstNote.continuesLastPattern;
            }
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/**
 * Stretch/shrink notes by position proportionate to the selected range containing them, and transpose to a new range.
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * x1b, x2b define the location of the new range.
 * 
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
*/
export class ChangeStretchHorizontal extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, x1new: number, x2new: number, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x2new = Math.min(x2new, doc.song.partsPerPattern);
        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern
            || x1new < 0 || x2new < 0 || x1new == x2new || x1new > doc.song.partsPerPattern || x2new > doc.song.partsPerPattern
            || (x1 === x1new && x2 == x2new)) {
            return;
        }

        if (x2new <= x1new) {
            return;
        }

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex)); }

        // Cut notes at the new range bound ends so they chop off nicely.
        if (x1new !== 0 && (x1new < x1 || x1new > x2)) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1new, pitchIndex)); }
        if (x2new !== doc.song.partsPerPattern && (x2new < x1 || x2new > x2)) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2new, pitchIndex)); }

        const oldNotes: Note[] = [];
        const newNotes: Note[] = [];
        const scaleFactor = (x2new - x1new) / (x2 - x1);
        const notesArray = pitchIndex === undefined
            ? pattern.notes
            : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);

        // Construct stretched notes
        let note: Note;
        let prevNote: Note | null = null;
        let newNote: Note;
        let minCompressedSize = 0;
        for (let i = 0; i < notesArray.length; i++) {
            note = notesArray[i];

            if (pitchIndex !== undefined && (note.pitches.length !== 1 || note.pitches[0] !== pitchIndex)) {
                continue; // For mod channels, skip off-pitch notes
            }
            if ((note.start >= x1 && note.end <= x2) ||
                (note.start >= x1new && note.end <= x2new)) {
                oldNotes.push(note); // Delete old and new range
            }
            if (note.start >= x2 || note.end <= x1) {
                continue; // Don't stretch unless in old range
            }

            // The new range must be at least this big to avoid loss.
            minCompressedSize += note.pins.length;

            // transpose the note, then stretch it to hold at minimum its pins.
            newNote = note.clone();
            newNote.start += x1new - x1;
            newNote.end += x1new - x1;
            removeRedundantPins(newNote.pins); // to maximize compressability, just in case.

            let prevPin: NotePin | null = null;
            for (const pin of newNote.pins) {
                // Stretch the pins, but don't allow them to overlap. Assumes they're sorted by time.
                pin.time = Math.trunc(pin.time * scaleFactor);
                if (prevPin && pin.time <= prevPin.time) {
                    pin.time = prevPin.time + 1;
                }

                prevPin = pin;
            }

            // Scale note position. Size to fit pins.
            newNote.start = Math.trunc(x1new + (newNote.start - x1new) * scaleFactor);
            newNote.end = Math.max(
                newNote.start + newNote.pins[newNote.pins.length - 1].time,
                newNote.start + newNote.pins.length - 1);

            // Move notes so they don't overlap.
            if (prevNote && newNote.start < prevNote.end) {
                newNote.end += prevNote.end - newNote.start;
                newNote.start = prevNote.end;
            }

            if (newNote.continuesLastPattern && newNote.start !== 0) {
                newNote.continuesLastPattern = false;
            }

            newNotes.push(newNote);
            prevNote = newNote;
        }

        // Do nothing if out of bounds.
        if (newNotes.length === 0 ||
            newNotes[newNotes.length - 1].end > x2new) {
            return;
        }

        this.append(new ChangeNotesAdded(doc, pattern, oldNotes, newNotes));

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Stretch/shrink note pitches proportionate to the selected range containing them using their center pitch as the
 * origin for stretching. The stretch factor is a multiply and/or added value, both which may be negative. Negative
 * stretch will mirror the notes across their pitch.
 * Incompatible with mod channels.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param multBy A multiplier, which if negative will mirror the notes across their computed center pitch.
 * @param add This is added to the pitch of all notes.
 * @param yOrig Instead of detecting the original note bounds, uses this range when provided. This is useful when the
 * function is iteratively applied per-note and those notes need the context of their combined range
 * */
export class ChangeStretchVerticalRelative extends ChangeSequence {
    constructor(doc: SongDocument, channelIndex: number, pattern: Pattern,
        multBy?: number, add?: number, perNote?: boolean, x1?: number, x2?: number, yOrig?: { min: number, max: number }) {
        super();

        const pitchLimit = doc.song.getChannelIsNoise(channelIndex) ? Config.drumCount - 1 : Config.maxPitch;
        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }
        if (pattern.notes.length === 0) { return; }

        multBy ??= 1;
        add ??= 0;

        const bounds = yOrig ?? getVerticalBounds(pattern.notes, x1, x2);
        const stretch = (xStart: number, xEnd: number, yRange: { min: number, max: number }) => {
            const halfDist = (yRange.max - yRange.min) / 2;
            const center = yRange.min + halfDist;
            this.append(new ChangeStretchVertical(doc, channelIndex, pattern,
                Math.max(center - (halfDist * multBy) - add/2, 0),
                Math.min(center + (halfDist * multBy) + add/2, pitchLimit),
                yRange, xStart, xEnd));
        }

        if (perNote) {
            let note: Note;
            for (note of pattern.notes) {
                if (note.end <= x1) { continue; }
                if (note.start >= x2) { break; }
                stretch(note.start, note.end, bounds);
            }
        } else {
            stretch(x1, x2, bounds);
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/**
 * Stretch/shrink a section of notes vertically to fit a new vertical range. yMax < yMin can mirror notes.
 * Incompatible with mod channels.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * 
 * yMin, yMax define the location of the new range.
 * @param yOrig Instead of detecting the original note bounds, uses this range when provided. This is useful when the
 * function is iteratively applied per-note and those notes need the context of their combined range
 */
export class ChangeStretchVertical extends ChangeSequence {
    constructor(doc: SongDocument, channelIndex: number, pattern: Pattern,
        yMin: number, yMax: number, yOrig?: { min: number, max: number }, x1?: number, x2?: number) {
        super();

        const pitchLimit = doc.song.getChannelIsNoise(channelIndex) ? Config.drumCount - 1 : Config.maxPitch;
        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern
            || yMin < 0 || yMin > pitchLimit
            || yMax < 0 || yMax > pitchLimit) { return; }
        if (pattern.notes.length === 0) { return; }

        const bounds = yOrig ?? getVerticalBounds(pattern.notes, x1, x2);
        let origRange = bounds.max - bounds.min;
        let newRange = yMax - yMin;
        if (origRange === 0) { origRange = 1; newRange = 1; } // only transpose if same-line.

        let note: Note;
        for (let i = 0; i < pattern.notes.length; i++) {
            note = pattern.notes[i];

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }

            // Pins are relative to pitches, so they'll fit when multiplied by the ratio of the ranges.
            for (let j = 0; j < note.pins.length; j++) {
                note.pins[j].interval = Math.round(note.pins[j].interval * (newRange / origRange));
            }

            // Pitches are set to a lerped position of new range based on their position in the old range.
            let origDistance: number;
            for (let j = 0; j < note.pitches.length; j++) {
                origDistance = (note.pitches[j] - bounds.min) / origRange;
                note.pitches[j] = Math.round(yMin + origDistance * newRange);
            }

            note.pitches = [...new Set(note.pitches)]; // Keep it unique.
            snapNoteToScale(doc, note);
        }

        doc.notifier.changed();
        this._didSomething();
    }
}

/**
 * Wraps around note data within the selection bounds by an integer amount of time.
 * 
 * x1, x2 defaults to active selection and are intended to be overridden to control where the operation works.
 * @param amountInParts How far to wrap. Accepts any integer, positive (wrap right) or negative (left).
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export class ChangeWrapAcross extends ChangeSequence {
    constructor(doc: SongDocument, pattern: Pattern, amountInParts: number, x1?: number, x2?: number, pitchIndex?: number) {
        super();

        x1 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionStart : 0);
        x2 ??= (doc.selection.patternSelectionActive ? doc.selection.patternSelectionEnd : doc.song.partsPerPattern);
        if (x1 < 0 || x2 <= x1 || x2 > doc.song.partsPerPattern) { return; }
        if (pattern.notes.length === 0) { return; }

        const width = x2 - x1;
        amountInParts = mod(amountInParts, width);
        const remainder = width - amountInParts;
        if (amountInParts === 0) { return; } // Exact wrap needs no change.

        if (x1 !== 0) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex)); }
        if (x2 !== doc.song.partsPerPattern) { this.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex)); }

        // Cut at the wrap point.
        const oldNotes: Note[] = [];
        const newNotes: Note[] = [];
        const cutPoint = x1 + amountInParts;
        this.append(new ChangeSplitNotesAtPoint(doc, pattern, cutPoint, pitchIndex));

        const notesArray = pitchIndex === undefined
            ? pattern.notes : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === pitchIndex);
        if (notesArray.length === 0) { return; }

        for (let i = 0; i < notesArray.length; i++) {
            const note = notesArray[i].clone();
            note.continuesLastPattern = false;

            if (note.end <= x1) { continue; }
            if (note.start >= x2) { break; }

            // Left side of cut is transposed to the end, right side wraps to the start
            if (note.start < cutPoint) {
                note.start += remainder;
                note.end += remainder;
            } else {
                note.start -= amountInParts;
                note.end -= amountInParts;
            }

            oldNotes.push(notesArray[i]);
            newNotes.push(note);
        }

        this.append(new ChangeNotesAdded(doc, pattern, oldNotes, newNotes));

        doc.notifier.changed();
        this._didSomething();
    }
}

/** Returns the pitches of the lowest and highest point among all notes in the given range. Incompatible with mod channels. */
export function getVerticalBounds(notes: Note[], x1: number, x2: number) {
    let absoluteMax = 0;
    let absoluteMin = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < notes.length; i++) {
        if (notes[i].end <= x1) { continue; }
        if (notes[i].start >= x2) { break; }

        // For all notes in selection range
        let pinMax = 0;
        let pinMin = Number.MAX_SAFE_INTEGER;

        // Find vertical min/max among pins.
        for (let j = 0; j < notes[i].pins.length; j++) {
            pinMax = Math.max(pinMax, notes[i].pins[j].interval);
            pinMin = Math.min(pinMin, notes[i].pins[j].interval);
        }

        // The vertical min/max among pitches + pin min/max gives the highest/lowest points in a note.
        for (let j = 0; j < notes[i].pitches.length; j++) {
            absoluteMax = Math.max(absoluteMax, notes[i].pitches[j] + pinMax);
            absoluteMin = Math.min(absoluteMin, notes[i].pitches[j] + pinMin);
        }
    }

    return { min: absoluteMin, max: absoluteMax };
}

/** For the given range, returns the indices of the notes that cross the boundaries on left and right. -1 indicates
 * that side does not cross boundaries. x1,x2 define the range.
 * @param appendSplits Splits at the bounds for convenience, and adjusts indices.R accordingly.
 */
export function getIntersects(doc: SongDocument, pattern: Pattern, x1: number, x2: number, pitchIndex?: number, appendSplits?: ChangeSequence) {
    const indices = {L: -1, R: -1};
    for (let i = 0; i < pattern.notes.length; i++) {
        if (indices.L === -1 && (pattern.notes[i].start < x1 && pattern.notes[i].end > x1)) {
            indices.L = i;
        }
        if (indices.R === -1 && (pattern.notes[i].start < x2 && pattern.notes[i].end > x2)) {
            indices.R = i;
            break;
        }
    }

    if (appendSplits) {
        if (indices.L !== -1) {
            appendSplits.append(new ChangeSplitNotesAtPoint(doc, pattern, x1, pitchIndex));
        }
        if (indices.R !== -1) {
            appendSplits.append(new ChangeSplitNotesAtPoint(doc, pattern, x2, pitchIndex));
        }
        // Rightmost index moves due to split operation(s).
        if (indices.R !== -1) {
            indices.R += (indices.L !== -1) ? 2 : 1;
        }
    }

    return indices;
}

/**
 * Searches a pattern in one direction from a starting point and returns the bounds of the found feature, else null. If
 * no starting position is provided, defaults to selection bounds. If not provided, assumes whole pattern is selected.
 * Stops searching at the ends, returning null if no element found. Note, the coordinates are always returned with the
 * smallest one as x1, even in backwards mode.
 * @param backwards Whether to search backwards (left on the pattern) instead of forwards (default false)
 * @param seekFrom The x-position to start searching from. If not provided and a selection is active, starts from
 * selection end (or start if backwards is true). If not provided and no selection is active, defaults to 0.
 * @param notes Whether to seek for notes (default false)
 * @param gaps Whether to seek for gaps between notes (default false)
 * @param edges Whether to seek for the gaps at the start/end of a pattern (default false)
 * @param pitchIndex Used only if the current channel is a mod channel. This indicates which pitch track to affect.
 * Must be a value under Config.modCount. Value is not checked to see if in range.
 */
export function search(doc: SongDocument, pattern: Pattern, backwards: boolean, seekFrom?: number,
    notes?: boolean, gaps?: boolean, edges?: boolean, pitchIndex?: number): ({x1: number, x2: number} | null)
{
    let seek = seekFrom !== undefined ? seekFrom : doc.selection.patternSelectionActive
        ? backwards ? doc.selection.patternSelectionStart : doc.selection.patternSelectionEnd
        : 0;

    let prev: Note | undefined;
    let note: Note;

    // For empty patterns, match if edges is true
    if (pattern.notes.length === 0 && edges) {
        return { x1: 0, x2: doc.song.partsPerPattern };
    }

    if (backwards) {
        for (let i = pattern.notes.length - 1; i >= 0; i--) {
            note = pattern.notes[i];

            if (note.start >= seek || (pitchIndex !== undefined && (note.pitches.length !== 1 || note.pitches[0] !== pitchIndex))) { continue; }
            prev = i < pattern.notes.length - 1 ? pattern.notes[i + 1] : undefined;

            // Match pattern edge start-gap, else this gap, else this note
            if (edges && !prev && note.end < seek) { return { x1: note.end, x2: doc.song.partsPerPattern } }
            if (gaps && prev && prev.start >= seek && note.end < seek) { return { x1: note.start, x2: prev.end } }
            if (notes) { return { x1: note.start, x2: note.end }; }
            seek = note.start;
        }
    } else {
        for (let i = 0; i < pattern.notes.length; i++) {
            note = pattern.notes[i];

            if (note.end <= seek || (pitchIndex !== undefined && (note.pitches.length !== 1 || note.pitches[0] !== pitchIndex))) { continue; }
            prev = i > 0 ? pattern.notes[i - 1] : undefined;

            // Match pattern edge start-gap, else this gap, else this note
            if (edges && !prev && note.start > seek) { return { x1: 0, x2: note.start } }
            if (gaps && prev && prev.end <= seek && note.start > seek) { return { x1: prev.end, x2: note.start } }
            if (notes) { return { x1: note.start, x2: note.end }; }
            seek = note.end;
        }
    }

    // Match pattern edge end-gap
    if (edges) {
        if (backwards) { return { x1: pattern.notes[0].start, x2: 0 } }
        return { x1: pattern.notes[pattern.notes.length - 1].end, x2: doc.song.partsPerPattern }
    }

    return null;
}