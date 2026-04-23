// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { Dictionary, Config } from "../synth/SynthConfig";
import { Note, NotePin, Pattern } from "../synth/synth";
import { SongDocument } from "./SongDocument";
import { ChangeGroup } from "./Change";
import { ColorConfig } from "./ColorConfig";
import { ChangeTrackSelection, ChangeChannelBar, ChangeAddChannel, ChangeRemoveChannel, ChangeChannelOrder, ChangeDuplicateSelectedReusedPatterns, ChangeNoteAdded, ChangeNoteTruncate, ChangePatternNumbers, ChangePatternSelection, ChangeInsertBars, ChangeDeleteBars, ChangeEnsurePatternExists, ChangeNoteLength, ChangePaste, ChangeSetPatternInstruments, ChangeViewInstrument, ChangeModChannel, ChangeModInstrument, ChangeModSetting, ChangeModFilter, ChangePatternsPerChannel, ChangePatternRhythm, ChangePatternScale, ChangeTranspose, ChangeRhythm, comparePatternNotes, unionOfUsedNotes, generateScaleMap, discardInvalidPatternInstruments, patternsContainSameInstruments, ChangeDragSelectedNotes } from "./changes";
import { ChangeMergeAcross, ChangeSplitAcross, ChangeBridgeAcross, ChangeMergeAcrossAdjacent, ChangeStretchVertical, ChangeStretchVerticalRelative, ChangeMirrorHorizontal, ChangeTapNotesAcross, ChangeSpreadVertical, ChangeSpreadAcross, getVerticalBounds, IStepData, ChangeStepAcross, ChangeStackLeftAcross, ChangeStackBottomAcross, search } from "./changesNoteOps";

interface PatternCopy {
    instruments: number[];
    notes: any[];
}

interface ChannelCopy {
    isNoise: boolean;
    isMod: boolean;
    patterns: Dictionary<PatternCopy>;
    bars: number[];
}

interface SelectionCopy {
    partDuration: number;
    channels: ChannelCopy[];
}

export interface SelectionJSON {
    x0: number, x1: number,
    y0: number, y1: number,
    start: number, end: number,
    startY: number, endY: number
}
export class Selection {
    public trackX0: number = 0;
    public trackY0: number = 0;
    public trackX1: number = 0;
    public trackY1: number = 0;
    public patternX0: number = 0;
    public patternX1: number = 0;
    public patternY0: number = 0;
    public patternY1: number = Config.modCount - 1;
    public digits: string = "";
    public instrumentDigits: string = "";

    private _changeTranspose: ChangeGroup | null = null;
    private _changeTrack: ChangeGroup | null = null;
    private _changeInstrument: ChangeGroup | null = null;
    private _changeReorder: ChangeGroup | null = null;

    constructor(private _doc: SongDocument) { }

    public toJSON(): SelectionJSON {
        return {
            "x0": this.trackX0,
            "x1": this.trackX1,
            "y0": this.trackY0,
            "y1": this.trackY1,
            "start": this.patternX0,
            "end": this.patternX1,
            "startY": this.patternY0,
            "endY": this.patternY1,
        };
    }

    public fromJSON(json: SelectionJSON): void {
        if (json == null) return;
        this.trackX0 = +json["x0"];
        this.trackX1 = +json["x1"];
        this.trackY0 = +json["y0"];
        this.trackY1 = +json["y1"];
        this.patternX0 = +json["start"];
        this.patternX1 = +json["end"];
        this.patternY0 = +json["startY"];
        this.patternY1 = +json["endY"];
        this.digits = "";
        this.instrumentDigits = "";
    }

    public selectionUpdated(): void {
        this._doc.notifier.changed();
        this.digits = "";
        this.instrumentDigits = "";
    }

    public get boxSelectionBar(): number {
        return Math.min(this.trackX0, this.trackX1);
    }
    public get boxSelectionChannel(): number {
        return Math.min(this.trackY0, this.trackY1);
    }
    public get boxSelectionWidth(): number {
        return Math.abs(this.trackX0 - this.trackX1) + 1;
    }
    public get boxSelectionHeight(): number {
        return Math.abs(this.trackY0 - this.trackY1) + 1;
    }
    public get boxSelectionActive(): boolean {
        return this.boxSelectionWidth > 1 || this.boxSelectionHeight > 1;
    }
    public get patternSelectionActive(): boolean {
        return this.patternX0 < this.patternX1;
    }
    public scrollToSelectedPattern(): void {
        this._doc.barScrollPos = Math.min(this._doc.bar, Math.max(this._doc.bar - (this._doc.trackVisibleBars - 1), this._doc.barScrollPos));
        this._doc.channelScrollPos = Math.min(this._doc.channel, Math.max(this._doc.channel - (this._doc.trackVisibleChannels - 1), this._doc.channelScrollPos));
    }
    public scrollToEndOfSelection(): void {
        this._doc.barScrollPos = Math.min(this.trackX1, Math.max(this.trackX1 - (this._doc.trackVisibleBars - 1), this._doc.barScrollPos));
        this._doc.channelScrollPos = Math.min(this.trackY1, Math.max(this.trackY1 - (this._doc.trackVisibleChannels - 1), this._doc.channelScrollPos));
    }

    /** Called to ensure pattern vertical selection fits its channel. */
    public transferPatternSelectionY(toChannel: number, fromChannel?: number): void {
        const from =
            (fromChannel === undefined) ? -1 :
            (fromChannel < this._doc.song.pitchChannelCount) ? 0 :
            (fromChannel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount) ? 1 : 2;
        const to =
            (toChannel < this._doc.song.pitchChannelCount) ? 0 :
            (toChannel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount) ? 1 : 2;
        const limit = ((to === 2) ? Config.maxPitch : (to === 1) ? Config.drumCount : Config.modCount) - 1;
        [this.patternY0, this.patternY1] =
            (from !== -1 && from !== to && to === 2) ? [limit, limit] :
            (from === 2 && from !== to) ? [0, 0] :
            [Math.min(limit, this.patternY0), Math.min(limit, this.patternY1)];
    }

    public setChannelBar(channelIndex: number, bar: number): void {
        if (channelIndex == this._doc.channel && bar == this._doc.bar) return;
        const canReplaceLastChange: boolean = this._doc.lastChangeWas(this._changeTrack);
        this._changeTrack = new ChangeGroup();
        this._changeTrack.append(new ChangeChannelBar(this._doc, channelIndex, bar));
        this.transferPatternSelectionY(channelIndex, this._doc.channel);

        // @jummbus - changing current viewed instrument to the first for the current pattern if the viewedInstrument is not in the pattern
        const pattern: Pattern | null = this._doc.getCurrentPattern(0);
        if (pattern != null) {
            if (pattern.instruments.indexOf(this._doc.viewedInstrument[this._doc.channel]) < 0) {
                this._doc.viewedInstrument[this._doc.channel] = pattern.instruments[0];
            }
        }
        // Don't erase existing redo history just to look at highlighted pattern.
        if (!this._doc.hasRedoHistory()) {
            this._doc.record(this._changeTrack, canReplaceLastChange);
        }
        this.selectionUpdated();

    }

    public setPattern(pattern: number): void {
        this._doc.record(new ChangePatternNumbers(this._doc, pattern, this.boxSelectionBar, this.boxSelectionChannel, this.boxSelectionWidth, this.boxSelectionHeight));
    }

    public setDigits(digits: string, forInstrument: boolean, forRhythms: boolean): void {
        if (forInstrument) { this.instrumentDigits = ""; }
        else if (!forRhythms) { this.digits = ""; } 
        this.nextDigit(digits, forInstrument, forRhythms);
    }

    public nextDigit(digit: string, forInstrument: boolean, forRhythms: boolean): void {
        if (forRhythms) {
            if (digit == "3") {
                this._doc.record(new ChangeRhythm(this._doc, 0));
            }
            else if (digit == "4") {
                this._doc.record(new ChangeRhythm(this._doc, 1));
            }
            else if (digit == "6") {
                this._doc.record(new ChangeRhythm(this._doc, 2));
            }
            else if (digit == "8") {
                this._doc.record(new ChangeRhythm(this._doc, 3));
            }
            else if (digit == "0" || digit == "1") {
                this._doc.record(new ChangeRhythm(this._doc, 4));
            }
        } else if (forInstrument) {
            // Treat "0" as meaning instrument 10
            if (digit == "0") digit = "10";
            this.instrumentDigits += digit;
            var parsed = parseInt(this.instrumentDigits);
            //var pattern: Pattern | null = this._doc.getCurrentPattern();
           if (parsed != 0 && parsed <= this._doc.song.channels[this._doc.channel].instruments.length) {
                this.selectInstrument(parsed - 1);
                return;
            }
            this.instrumentDigits = digit;
            parsed = parseInt(this.instrumentDigits);
           if (parsed != 0 && parsed <= this._doc.song.channels[this._doc.channel].instruments.length) {
                this.selectInstrument(parsed - 1);
                return;
            }
            this.instrumentDigits = "";
        }
        else {
            this.digits += digit;
            let parsed: number = parseInt(this.digits);
            if (parsed <= this._doc.song.patternsPerChannel) {

                this.setPattern(parsed);

                return;
            }

            this.digits = digit;
            parsed = parseInt(this.digits);
            if (parsed <= this._doc.song.patternsPerChannel) {

                this.setPattern(parsed);

                return;
            }

            this.digits = "";
        }
    }

    public setModChannel(mod: number, index: number): void {
        this._doc.record(new ChangeModChannel(this._doc, mod, index));
    }

    public setModInstrument(mod: number, instrument: number): void {
        this._doc.record(new ChangeModInstrument(this._doc, mod, instrument));
    }

    public setModSetting(mod: number, text: string): void {
        this._doc.record(new ChangeModSetting(this._doc, mod, text));
    }

    public setModFilter(mod: number, type: number): void {
        this._doc.record(new ChangeModFilter(this._doc, mod, type));
    }

    public insertBars(): void {
        this._doc.record(new ChangeInsertBars(this._doc, this.boxSelectionBar + this.boxSelectionWidth, this.boxSelectionWidth));
        const width: number = this.boxSelectionWidth;
        this.trackX0 += width;
        this.trackX1 += width;
    }

    public insertChannel(): void {
        const group: ChangeGroup = new ChangeGroup();
        const insertIndex: number = this.boxSelectionChannel + this.boxSelectionHeight;
        const isNoise: boolean = this._doc.song.getChannelIsNoise(insertIndex - 1);
        const isMod: boolean = this._doc.song.getChannelIsMod(insertIndex - 1)
        group.append(new ChangeAddChannel(this._doc, insertIndex, isNoise, isMod));
        if (!group.isNoop()) {
            this.trackY0 = this.trackY1 = insertIndex;
            group.append(new ChangeChannelBar(this._doc, insertIndex, this._doc.bar));
            this._doc.record(group);
        }
    }

    public deleteBars(andPull?: boolean): void {
        const group: ChangeGroup = new ChangeGroup();
        if (this._doc.selection.patternSelectionActive) {
            if (this.boxSelectionActive) {
                group.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
            }

            for (const channelIndex of this._eachSelectedChannel()) {
                for (const pattern of this._eachSelectedPattern(channelIndex)) {
                    for (const track of this.eachSelectedModTrack(channelIndex)) {
                        group.append(new ChangeNoteTruncate(this._doc, pattern, this._doc.selection.patternX0, this._doc.selection.patternX1, null, true, track));
                    }
                }
            }

            // Pulling moves notes leftwards to fill the "gap" removed.
            const selectionLength = this._doc.selection.patternX1 - this._doc.selection.patternX0;
            if (selectionLength > 0 && this._doc.selection.patternX1 < this._doc.song.partsPerPattern && andPull) {
                group.append(new ChangePatternSelection(this._doc, this._doc.selection.patternX1, this._doc.song.partsPerPattern));
                for (const channelIndex of this._eachSelectedChannel()) {
                    for (const pattern of this._eachSelectedPattern(channelIndex)) {
                        group.append(new ChangeDragSelectedNotes(this._doc, channelIndex, pattern, -selectionLength, 0));
                    }
                }
            }
            group.append(new ChangePatternSelection(this._doc, 0, 0));
        } else {
            group.append(new ChangeDeleteBars(this._doc, this.boxSelectionBar, this.boxSelectionWidth));
            const width: number = this.boxSelectionWidth;
            this.trackX0 = Math.max(0, this.trackX0 - width);
            this.trackX1 = Math.max(0, this.trackX1 - width);
        }
        this._doc.record(group);
    }

    public deleteChannel(): void {
        this._doc.record(new ChangeRemoveChannel(this._doc, this.boxSelectionChannel, this.boxSelectionChannel + this.boxSelectionHeight - 1));
        this.trackY0 = this.trackY1 = this._doc.channel;
        ColorConfig.resetColors();
    }

    private * _eachSelectedChannel(): IterableIterator<number> {
        for (let channelIndex: number = this.boxSelectionChannel; channelIndex < this.boxSelectionChannel + this.boxSelectionHeight; channelIndex++) {
            yield channelIndex;
        }
    }

    private * _eachSelectedBar(): IterableIterator<number> {
        for (let bar: number = this.boxSelectionBar; bar < this.boxSelectionBar + this.boxSelectionWidth; bar++) {
            yield bar;
        }
    }

    public * eachSelectedModTrack(channelIndex: number): IterableIterator<number | undefined> {
        if (this._doc.song.getChannelIsMod(channelIndex)) {
            if (this.patternSelectionActive) {
                for (let track = this.patternY0; track <= this.patternY1; track++) {
                    yield track;
                }
            } else {
                for (let track = 0; track <= Config.modCount - 1; track++) {
                    yield track;
                }
            }
        } else {
            yield undefined;
        }
    }

    private * _eachSelectedPattern(channelIndex: number): IterableIterator<Pattern> {
        const handledPatterns: Dictionary<boolean> = {};
        for (const bar of this._eachSelectedBar()) {
            const currentPatternIndex: number = this._doc.song.channels[channelIndex].bars[bar];
            if (currentPatternIndex == 0) continue;
            if (handledPatterns[String(currentPatternIndex)]) continue;
            handledPatterns[String(currentPatternIndex)] = true;
            const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
            if (pattern == null) throw new Error();
            yield pattern;
        }
    }

    private _parseCopiedInstrumentArray(patternCopy: any, channelIndex: number): number[] {
        const instruments: number[] = Array.from(patternCopy["instruments"]).map(i => (<any>i) >>> 0);
        discardInvalidPatternInstruments(instruments, this._doc.song, channelIndex);
        return instruments;
    }

    private _patternIndexIsUnused(channelIndex: number, patternIndex: number): boolean {
        for (let i: number = 0; i < this._doc.song.barCount; i++) {
            if (this._doc.song.channels[channelIndex].bars[i] == patternIndex) {
                return false;
            }
        }
        return true;
    }

    public copy(): void {
        const channels: ChannelCopy[] = [];

        for (const channelIndex of this._eachSelectedChannel()) {
            const patterns: Dictionary<PatternCopy> = {};
            const bars: number[] = [];

            for (const bar of this._eachSelectedBar()) {
                const patternNumber: number = this._doc.song.channels[channelIndex].bars[bar];
                bars.push(patternNumber);
                if (patterns[String(patternNumber)] == undefined) {
                    const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
                    let instruments: number[] = this._doc.recentPatternInstruments[channelIndex];
                    let notes: Note[] = [];
                    if (pattern != null) {
                        instruments = pattern.instruments.concat();

                        if (this.patternSelectionActive) {
                            for (const note of pattern.cloneNotes()) {
                                if (note.end <= this.patternX0) continue;
                                if (note.start >= this.patternX1) continue;
                                note.start -= this.patternX0;
                                note.end -= this.patternX0;
                                if (note.start < 0 || note.end > this.patternX1 - this.patternX0) {
                                    new ChangeNoteLength(null, note, Math.max(note.start, 0), Math.min(this.patternX1 - this.patternX0, note.end));
                                }
                                notes.push(note);
                            }
                        } else {
                            notes = pattern.notes;
                        }
                    }
                    patterns[String(patternNumber)] = { "instruments": instruments, "notes": notes };
                }
            }

            const channelCopy: ChannelCopy = {
                "isNoise": this._doc.song.getChannelIsNoise(channelIndex),
                "isMod": this._doc.song.getChannelIsMod(channelIndex),
                "patterns": patterns,
                "bars": bars,
            };
            channels.push(channelCopy);
        }

        const selectionCopy: SelectionCopy = {
            "partDuration": this.patternSelectionActive ? this.patternX1 - this.patternX0 : this._doc.song.partsPerPattern,
            "channels": channels,
        };
        window.localStorage.setItem("selectionCopy", JSON.stringify(selectionCopy));

        // Clear selections after copy
        new ChangePatternSelection(this._doc, 0, 0);
        this.resetBoxSelection();
        this.selectionUpdated();
    }

    private _remapToNoisePitches(oldPitches: number[]): number[] {
        let newPitches: number[] = oldPitches.slice();
        // There may be some very "pleasing" way to place these,
        // but I'm not sure it's worth the effort.
        newPitches.sort(function (a: number, b: number): number { return a - b; });
        let lowestPitch: number = newPitches[0] % Config.drumCount;
        const numberOfPitches: number = newPitches.length;
        let highestPitch: number = lowestPitch + (numberOfPitches - 1);
        while (highestPitch >= Config.drumCount) {
            lowestPitch--;
            highestPitch--;
        }
        for (let notePitchIndex: number = 0; notePitchIndex < newPitches.length; notePitchIndex++) {
            newPitches[notePitchIndex] = notePitchIndex + lowestPitch;
        }
        return newPitches;
    }

    private _convertCopiedPitchNotesToNoiseNotes(oldNotes: Note[]): Note[] {
        // When pasting from a pitch channel to a noise channel,
        // we may have pitches beyond what a noise channel supports.
        let newNotes: Note[] = [];
        for (let noteIndex: number = 0; noteIndex < oldNotes.length; noteIndex++) {
            const oldNote: Note = oldNotes[noteIndex];
            const newNotePitches: number[] = this._remapToNoisePitches(oldNote["pitches"].slice());
            const oldNotePins: NotePin[] = oldNote.pins;
            let newNotePins: NotePin[] = [];
            for (let notePinIndex: number = 0; notePinIndex < oldNotePins.length; notePinIndex++) {
                const oldPin: NotePin = oldNotePins[notePinIndex];
                newNotePins.push({
                    interval: oldPin.interval,
                    time: oldPin.time,
                    size: oldPin.size,
                });
            }
            const newNoteStart: number = oldNote["start"];
            const newNoteEnd: number = oldNote["end"];
            const newNoteContinuesLastPattern: boolean = oldNote["continuesLastPattern"];
            const newNote = new Note(0, newNoteStart, newNoteEnd, 0, false);
            newNote.pitches = newNotePitches;
            newNote.pins = newNotePins;
            newNote.continuesLastPattern = newNoteContinuesLastPattern;
            newNotes.push(newNote);
        }
        return newNotes;
    }

    public cutNotes(): void {
        const group: ChangeGroup = new ChangeGroup();
        const channelIndex: number = this.boxSelectionChannel;
        const barIndex: number = this.boxSelectionBar;
        const cutHeight: number = this.boxSelectionHeight;
        const cutWidth: number = this.boxSelectionWidth;
        this.copy();
        for (let channel = channelIndex; channel < channelIndex + cutHeight; channel++) {
            for (let bar = barIndex; bar < barIndex + cutWidth; bar++) {
                const patternNumber: number = this._doc.song.channels[channel].bars[bar];
                if (patternNumber != 0) {
                    const pattern: Pattern = this._doc.song.channels[channel].patterns[patternNumber - 1];
                    group.append(new ChangeNoteTruncate(this._doc, pattern, 0, Config.partsPerBeat * this._doc.song.beatsPerBar));
                }
            }
        }
        this._doc.record(group);
    }

    // I'm sorry this function is so complicated!
    // Basically I'm trying to avoid accidentally modifying patterns that are used
    // elsewhere in the song (unless we're just pasting a single pattern) but I'm
    // also trying to reuse patterns where it makes sense to do so, especially 
    // in the same channel it was copied from.
    public pasteNotes(): void {
        const selectionCopy: SelectionCopy | null = JSON.parse(String(window.localStorage.getItem("selectionCopy")));
        if (selectionCopy == null) return;
        const channelCopies: ChannelCopy[] = selectionCopy["channels"] || [];
        const copiedPartDuration: number = selectionCopy["partDuration"] >>> 0;

        const group: ChangeGroup = new ChangeGroup();
        const fillSelection: boolean = (this.boxSelectionWidth > 1 || this.boxSelectionHeight > 1);

        const pasteHeight: number = fillSelection ? this.boxSelectionHeight : Math.min(channelCopies.length, this._doc.song.getChannelCount() - this.boxSelectionChannel);
        for (let pasteChannel: number = 0; pasteChannel < pasteHeight; pasteChannel++) {
            const channelCopy: ChannelCopy = channelCopies[pasteChannel % channelCopies.length];
            const channelIndex: number = this.boxSelectionChannel + pasteChannel;
               const channelIsNoise = this._doc.song.getChannelIsNoise(channelIndex);
		
            const isNoise: boolean = !!channelCopy["isNoise"];
            const isMod: boolean = !!channelCopy["isMod"];
		const isPitch = !isNoise && !isMod;
            const patternCopies: Dictionary<PatternCopy> = channelCopy["patterns"] || {};
            const copiedBars: number[] = channelCopy["bars"] || [];
            if (copiedBars.length == 0) continue;
		// Allow pasting from a pitch channel to a noise channel (and the opposite).
            if (isNoise && this._doc.song.getChannelIsMod(channelIndex)) continue;
            if (isMod != this._doc.song.getChannelIsMod(channelIndex)) continue;
                // if (isNoise != this._doc.song.getChannelIsNoise(channelIndex))
                //     continue;

            const pasteWidth: number = fillSelection ? this.boxSelectionWidth : Math.min(copiedBars.length, this._doc.song.barCount - this.boxSelectionBar);
            if (!fillSelection && copiedBars.length == 1 && channelCopies.length == 1) {
                // Special case: if there's just one pattern being copied, try to insert it
                // into whatever pattern is already selected.
                const copiedPatternIndex: number = copiedBars[0] >>> 0;
                const bar: number = this.boxSelectionBar;
                const currentPatternIndex: number = this._doc.song.channels[channelIndex].bars[bar];
                if (copiedPatternIndex == 0 && currentPatternIndex == 0) continue;

                const patternCopy: PatternCopy = patternCopies[String(copiedPatternIndex)];

                const instrumentsCopy: number[] = this._parseCopiedInstrumentArray(patternCopy, channelIndex);

                 let pastedNotes: Note[] = patternCopy["notes"];
                   if (isPitch && channelIsNoise) {
                       pastedNotes = this._convertCopiedPitchNotesToNoiseNotes(pastedNotes);
                    }
		    
                if (currentPatternIndex == 0) {
                    const existingPattern: Pattern | undefined = this._doc.song.channels[channelIndex].patterns[copiedPatternIndex - 1];
                    if (existingPattern != undefined &&
                        !this.patternSelectionActive &&
                        ((comparePatternNotes(pastedNotes, existingPattern.notes) && patternsContainSameInstruments(instrumentsCopy, existingPattern.instruments)) ||
                            this._patternIndexIsUnused(channelIndex, copiedPatternIndex))) {
                        group.append(new ChangePatternNumbers(this._doc, copiedPatternIndex, bar, channelIndex, 1, 1));
                    } else {
                        group.append(new ChangeEnsurePatternExists(this._doc, channelIndex, bar));
                    }
                }

                const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
                if (pattern == null) throw new Error();
                group.append(new ChangePaste(this._doc, pattern, pastedNotes, this.patternX0, this.patternSelectionActive ? this.patternX1 : Config.partsPerBeat * this._doc.song.beatsPerBar, copiedPartDuration));
                // @jummbus - I actually like it better if instruments copy over, unless it's not a mod and there are notes in the pattern.
                if (currentPatternIndex == 0 || patternCopy.notes.length == 0 || channelIndex >= this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount) {
                    this.selectInstrument(instrumentsCopy[0]);
                    group.append(new ChangeSetPatternInstruments(this._doc, channelIndex, instrumentsCopy, pattern));
                }
            } else if (this.patternSelectionActive) {
                const reusablePatterns: Dictionary<number> = {};
                const usedPatterns: Dictionary<boolean> = {};

                group.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, pasteWidth, this.boxSelectionChannel, pasteHeight));

                for (let pasteBar: number = 0; pasteBar < pasteWidth; pasteBar++) {
                    const bar: number = this.boxSelectionBar + pasteBar;
                    const copiedPatternIndex: number = copiedBars[pasteBar % copiedBars.length] >>> 0;
                    const currentPatternIndex: number = this._doc.song.channels[channelIndex].bars[bar];
                    const reusedIndex: string = [copiedPatternIndex, currentPatternIndex].join(",");
                    if (copiedPatternIndex == 0 && currentPatternIndex == 0) continue;
                    if (reusablePatterns[reusedIndex] != undefined) {
                        group.append(new ChangePatternNumbers(this._doc, reusablePatterns[reusedIndex], bar, channelIndex, 1, 1));
                        continue;
                    }

                    if (currentPatternIndex == 0) {
                        group.append(new ChangeEnsurePatternExists(this._doc, channelIndex, bar));
                        const patternCopy: PatternCopy = patternCopies[String(copiedPatternIndex)];
                        const instrumentsCopy: number[] = this._parseCopiedInstrumentArray(patternCopy, channelIndex);
                        const pattern: Pattern = this._doc.song.getPattern(channelIndex, bar)!;
                        group.append(new ChangeSetPatternInstruments(this._doc, channelIndex, instrumentsCopy, pattern));
                    } else {
                        const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
                        if (pattern == null) throw new Error();

                        if (!usedPatterns[String(currentPatternIndex)]) {
                            usedPatterns[String(currentPatternIndex)] = true;
                        } else {
                            // If this pattern is used here and elsewhere, it's not safe to modify it directly, so
                            // make a duplicate of it and modify that instead.
                            group.append(new ChangePatternNumbers(this._doc, 0, bar, channelIndex, 1, 1));
                            group.append(new ChangeEnsurePatternExists(this._doc, channelIndex, bar));
                            const newPattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
                            if (newPattern == null) throw new Error();
                            for (const note of pattern.cloneNotes()) {
                                   if (isPitch && channelIsNoise) {
                                        note.pitches = this._remapToNoisePitches(note.pitches);
                                    }
				    group.append(new ChangeNoteAdded(this._doc, newPattern, note, newPattern.notes.length, false));
                            }
                            // Don't overwrite the existing pattern's instruments if only part of the pattern content is being replaced.
                            //group.append(new ChangeSetPatternInstruments(this._doc, channelIndex, pattern.instruments, newPattern));
                        }
                    }

                    const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
                    if (pattern == null) throw new Error();
                    if (copiedPatternIndex == 0) {
                        group.append(new ChangeNoteTruncate(this._doc, pattern, this.patternX0, this.patternX1));
                    } else {
                        const patternCopy: PatternCopy = patternCopies[String(copiedPatternIndex)];
                        let pastedNotes: Note[] = patternCopy["notes"];
                        if (isPitch && channelIsNoise) {
                            pastedNotes = this._convertCopiedPitchNotesToNoiseNotes(pastedNotes);
                        }
                        group.append(new ChangePaste(this._doc, pattern, pastedNotes, this.patternX0, this.patternX1, copiedPartDuration));
                    }

                    reusablePatterns[reusedIndex] = this._doc.song.channels[channelIndex].bars[bar];
                }
            } else {
                for (let pasteBar: number = 0; pasteBar < pasteWidth; pasteBar++) {
                    // When a pattern becomes unused when replaced by rectangular selection pasting,
                    // remove all the notes from the pattern so that it may be reused.
                    this.erasePatternInBar(group, channelIndex, this.boxSelectionBar + pasteBar);
                }

                const reusablePatterns: Dictionary<number> = {};
                for (let pasteBar: number = 0; pasteBar < pasteWidth; pasteBar++) {
                    const bar: number = this.boxSelectionBar + pasteBar;
                    const copiedPatternIndex: number = copiedBars[pasteBar % copiedBars.length] >>> 0;
                    const reusedIndex: string = String(copiedPatternIndex);
                    if (copiedPatternIndex == 0) continue;
                    if (reusablePatterns[reusedIndex] != undefined) {
                        group.append(new ChangePatternNumbers(this._doc, reusablePatterns[reusedIndex], bar, channelIndex, 1, 1));
                        continue;
                    }
                    const patternCopy: PatternCopy = patternCopies[String(copiedPatternIndex)];
                    const instrumentsCopy: number[] = this._parseCopiedInstrumentArray(patternCopy, channelIndex);
                    const existingPattern: Pattern | undefined = this._doc.song.channels[channelIndex].patterns[copiedPatternIndex - 1];

                 let pastedNotes: Note[] = patternCopy["notes"];
                        if (isPitch && channelIsNoise) {
                            pastedNotes = this._convertCopiedPitchNotesToNoiseNotes(pastedNotes);
                        }
			
		if (existingPattern != undefined &&
                        copiedPartDuration == Config.partsPerBeat * this._doc.song.beatsPerBar &&
                        comparePatternNotes(pastedNotes, existingPattern.notes) &&
                        patternsContainSameInstruments(instrumentsCopy, existingPattern.instruments)) {
                        group.append(new ChangePatternNumbers(this._doc, copiedPatternIndex, bar, channelIndex, 1, 1));
                    } else {
                        if (existingPattern != undefined && this._patternIndexIsUnused(channelIndex, copiedPatternIndex)) {
                            group.append(new ChangePatternNumbers(this._doc, copiedPatternIndex, bar, channelIndex, 1, 1));
                        } else {
                            group.append(new ChangeEnsurePatternExists(this._doc, channelIndex, bar));
                        }
                        const pattern: Pattern | null = this._doc.song.getPattern(channelIndex, bar);
                        if (pattern == null) throw new Error();
                        group.append(new ChangePaste(this._doc, pattern, pastedNotes, this.patternX0, this.patternSelectionActive ? this.patternX1 : Config.partsPerBeat * this._doc.song.beatsPerBar, copiedPartDuration));
                        group.append(new ChangeSetPatternInstruments(this._doc, channelIndex, instrumentsCopy, pattern));
                    }

                    reusablePatterns[reusedIndex] = this._doc.song.channels[channelIndex].bars[bar];

                }
            }
        }

        this._doc.record(group);
    }

    // Set a bar's pattern number to zero, and if that pattern was not used
    // elsewhere in the channel, erase all notes in it as well.
    public erasePatternInBar(group: ChangeGroup, channelIndex: number, bar: number): void {
        const removedPattern: number = this._doc.song.channels[channelIndex].bars[bar];
        if (removedPattern != 0) {
            group.append(new ChangePatternNumbers(this._doc, 0, bar, channelIndex, 1, 1));
            if (this._patternIndexIsUnused(channelIndex, removedPattern)) {
                // When a pattern becomes unused when replaced by rectangular selection pasting,
                // remove all the notes from the pattern so that it may be reused.
                this._doc.song.channels[channelIndex].patterns[removedPattern - 1].notes.length = 0;
            }
        }
    }

    public pasteNumbers(): void {
        const selectionCopy: SelectionCopy | null = JSON.parse(String(window.localStorage.getItem("selectionCopy")));
        if (selectionCopy == null) return;
        const channelCopies: ChannelCopy[] = selectionCopy["channels"] || [];

        const group: ChangeGroup = new ChangeGroup();
        const fillSelection: boolean = this.boxSelectionActive;

        const pasteHeight: number = fillSelection ? this.boxSelectionHeight : Math.min(channelCopies.length, this._doc.song.getChannelCount() - this.boxSelectionChannel);
        for (let pasteChannel: number = 0; pasteChannel < pasteHeight; pasteChannel++) {
            const channelCopy: ChannelCopy = channelCopies[pasteChannel % channelCopies.length];
            const channelIndex: number = this.boxSelectionChannel + pasteChannel;

            const copiedBars: number[] = channelCopy["bars"] || [];
            if (copiedBars.length == 0) continue;

            const pasteWidth: number = fillSelection ? this.boxSelectionWidth : Math.min(copiedBars.length, this._doc.song.barCount - this.boxSelectionBar);
            for (let pasteBar: number = 0; pasteBar < pasteWidth; pasteBar++) {
                const copiedPatternIndex: number = copiedBars[pasteBar % copiedBars.length] >>> 0;
                const bar: number = this.boxSelectionBar + pasteBar;

                if (copiedPatternIndex > this._doc.song.patternsPerChannel) {
                    group.append(new ChangePatternsPerChannel(this._doc, copiedPatternIndex));
                }

                group.append(new ChangePatternNumbers(this._doc, copiedPatternIndex, bar, channelIndex, 1, 1));
            }
        }

        this._doc.record(group);
    }

    public selectAllPatterns(): void {
        new ChangePatternSelection(this._doc, 0, 0);
        if (this.boxSelectionBar == 0 &&
            this.boxSelectionChannel == 0 &&
            this.boxSelectionWidth == this._doc.song.barCount &&
            this.boxSelectionHeight == this._doc.song.getChannelCount()) {
            this.setTrackSelection(this._doc.bar, this._doc.bar, this._doc.channel, this._doc.channel);
        } else {
            this.setTrackSelection(0, this._doc.song.barCount - 1, 0, this._doc.song.getChannelCount() - 1);
        }
        this.selectionUpdated();
    }

    public selectChannel(): void {
        new ChangePatternSelection(this._doc, 0, 0);
        if (this.boxSelectionBar == 0 && this.boxSelectionWidth == this._doc.song.barCount) {
            this.setTrackSelection(this._doc.bar, this._doc.bar, this.trackY0, this.trackY1);
        } else {
            this.setTrackSelection(0, this._doc.song.barCount - 1, this.trackY0, this.trackY1);
        }
        this.selectionUpdated();
    }

    public duplicatePatterns(): void {
        this._doc.record(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
    }

    public muteChannels(allChannels: boolean): void {
        if (allChannels) {
            let anyMuted: boolean = false;
            for (let channelIndex: number = 0; channelIndex < this._doc.song.channels.length; channelIndex++) {
                if (this._doc.song.channels[channelIndex].muted) {
                    anyMuted = true;
                    break;
                }
            }
            for (let channelIndex: number = 0; channelIndex < this._doc.song.channels.length; channelIndex++) {
                this._doc.song.channels[channelIndex].muted = !anyMuted;
            }
        } else {
            let anyUnmuted: boolean = false;
            for (const channelIndex of this._eachSelectedChannel()) {
                if (!this._doc.song.channels[channelIndex].muted) {
                    anyUnmuted = true;
                    break;
                }
            }
            for (const channelIndex of this._eachSelectedChannel()) {
                this._doc.song.channels[channelIndex].muted = anyUnmuted;
            }
        }

        this._doc.notifier.changed();
    }

    public soloChannels(invert: boolean): void {
        let alreadySoloed: boolean = true;

        // Soloing mod channels - solo all channels affected by the mod, instead
        if (this.boxSelectionChannel >= this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount) {

            const currentChannel = this._doc.song.channels[this.boxSelectionChannel];
            const bar: number = currentChannel.bars[this._doc.bar] - 1;
            const modInstrument = (bar >= 0) ? currentChannel.instruments[currentChannel.patterns[bar].instruments[0]] : currentChannel.instruments[this._doc.viewedInstrument[this.boxSelectionChannel]];
            const soloPattern: boolean[] = [];
            let matchesSoloPattern: boolean = !invert;

            // First pass: determine solo pattern
            for (let channelIndex: number = 0; channelIndex < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channelIndex++) {
                soloPattern[channelIndex] = false;
                for (let mod: number = 0; mod < Config.modCount; mod++) {
                    if (modInstrument.modChannels[mod] == channelIndex) {
                        soloPattern[channelIndex] = true;
                    }
                }
            }

            // Second pass: determine if channels match solo pattern, overall
            for (let channelIndex: number = 0; channelIndex < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channelIndex++) {
                if (this._doc.song.channels[channelIndex].muted == soloPattern[channelIndex]) {
                    matchesSoloPattern = invert;
                    break;
                }
            }

            // Third pass: Actually apply solo pattern or unmute all
            for (let channelIndex: number = 0; channelIndex < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channelIndex++) {
                if (matchesSoloPattern) {
                    this._doc.song.channels[channelIndex].muted = false;
                }
                else {
                    this._doc.song.channels[channelIndex].muted = !soloPattern[channelIndex];
                }
            }

        }
        else {

            for (let channelIndex: number = 0; channelIndex < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channelIndex++) {
                const shouldBeMuted: boolean = (channelIndex < this.boxSelectionChannel || channelIndex >= this.boxSelectionChannel + this.boxSelectionHeight) ? !invert : invert;
                if (this._doc.song.channels[channelIndex].muted != shouldBeMuted) {
                    alreadySoloed = false;
                    break;
                }
            }

            if (alreadySoloed) {
                for (let channelIndex: number = 0; channelIndex < this._doc.song.channels.length; channelIndex++) {
                    this._doc.song.channels[channelIndex].muted = false;
                }
            } else {
                for (let channelIndex: number = 0; channelIndex < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount; channelIndex++) {
                    this._doc.song.channels[channelIndex].muted = (channelIndex < this.boxSelectionChannel || channelIndex >= this.boxSelectionChannel + this.boxSelectionHeight) ? !invert : invert;
                }
            }

        }

        this._doc.notifier.changed();
    }

    public forceRhythm(): void {
        const group: ChangeGroup = new ChangeGroup();

        if (this.boxSelectionActive) {
		    group.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
        }

        for (const channelIndex of this._eachSelectedChannel()) {
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                group.append(new ChangePatternRhythm(this._doc, pattern));
            }
        }

        this._doc.record(group);
    }

    public forceScale(): void {
        const group: ChangeGroup = new ChangeGroup();

        if (this.boxSelectionActive) {
		    group.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
        }

        const scaleFlags: boolean[] = [true, false, false, false, false, false, false, false, false, false, false, false];
        for (const channelIndex of this._eachSelectedChannel()) {
            if (this._doc.song.getChannelIsNoise(channelIndex) || this._doc.song.getChannelIsMod(channelIndex)) continue;
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                unionOfUsedNotes(pattern, scaleFlags);
            }
        }

        const scaleMap: number[] = generateScaleMap(scaleFlags, this._doc.song.scale, this._doc.song.scaleCustom);

        for (const channelIndex of this._eachSelectedChannel()) {
            if (this._doc.song.getChannelIsNoise(channelIndex) || this._doc.song.getChannelIsMod(channelIndex)) continue;
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                group.append(new ChangePatternScale(this._doc, pattern, scaleMap));
            }
        }

        this._doc.record(group);
    }

    public setTrackSelection(newX0: number, newX1: number, newY0: number, newY1: number): void {
        const canReplaceLastChange: boolean = true;//this._doc.lastChangeWas(this._changeTrack);
        this._changeTrack = new ChangeGroup();
        this._changeTrack.append(new ChangeTrackSelection(this._doc, newX0, newX1, newY0, newY1));
        this._doc.record(this._changeTrack, canReplaceLastChange);
    }

    /**
     * Returns {x1, x2} or undefined for the coordinates of the found feature type, seeking to the nearest feature
     * left or right of the given position. It will snap on notes, pins, gaps between notes, and/or the edges of the
     * pattern and will pick the nearest snapping point among mod tracks in the case of a vertical selection. "Back"
     * searches backwards.
    */
    public search(seekFrom?: number, notes?: boolean, pins?: boolean, gaps?: boolean, edges?: boolean, back?: boolean) {
        const seek = seekFrom ?? (this.patternSelectionActive
            ? (back ? this.patternX0 : this.patternX1)
            : (back ? this._doc.song.partsPerPattern : 0));

        // Finds the nearest coords-set
        let smallest = 999;
        let found: { x1: number, x2: number } | undefined;
        for (const i of this._doc.selection.eachSelectedModTrack(this._doc.channel)) {
            const results = search(this._doc, this._doc.getCurrentPattern(0)!, back, seek, notes, pins, gaps, edges, i);
            if (results === null) { continue; }
            if (back && seek - results.x2 < smallest) { smallest = seek - results.x2; found = results; }
            else if (!back && results.x1 - seek < smallest) { smallest = results.x1 - seek; found = results; }
        }

        return found;
    }

    /**
     * Merges notes, optionally only adjacent ones. This requires adjacent mode on mod channels, but it allows
     * to simulate non-adjacency by running bridge first.
     * 
     * See the merge functions in changesNoteOps.ts.
     * @param adjacentOnly If true, uses adjacent merge, else uses normal merge.
     * @param pitchIndex For modulation channels, this indicates which pitch index to affect.
     * Defaults to Config.modCount - 1 (the "first" track, aka the one visually at top).
     */
    public noteMerge(adjacentOnly: boolean): void {
        const change = new ChangeGroup();

        for (const channelIndex of this._eachSelectedChannel()) {
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                const isMod = this._doc.song.getChannelIsMod(channelIndex);
                if (adjacentOnly || isMod) {
                    for (const track of this.eachSelectedModTrack(channelIndex)) {
                        if (!adjacentOnly && isMod) {
                            // Mod channels simulate "all" by bridging, then merging, because it's equivalent to
                            // filling in the space without making a real effect.
                            change.append(new ChangeBridgeAcross(this._doc, pattern, false, false, false, undefined, undefined, track))
                        }
                        change.append(new ChangeMergeAcrossAdjacent(this._doc, pattern, undefined, undefined, track));
                    }
                } else {
                    change.append(new ChangeMergeAcross(this._doc, pattern, undefined, undefined, undefined));
                }
			}
        }

        this._doc.record(change);
    }

    /**
     * Creates notes between notes. This disables doBends on mod channels.
     * 
     * See the bridge function in changesNoteOps.ts.
     * @param grow if true, instead of creating new notes in the gap, extends the existing note
     * @param doBends Copy pitch/volume of adjacent following note
     * @param copyEnds Copy volume of start & end of previous note. If not provided, this defaults to true when it's a
     * noise channel, because that is extremely common (and in-line with how noise channels work), else false.
     */
    public noteBridge(grow: boolean, doBends: boolean): void {
        const change = new ChangeGroup();

        for (const channelIndex of this._eachSelectedChannel()) {
            const isMod = this._doc.song.getChannelIsMod(channelIndex);
            const isNoise = this._doc.song.getChannelIsNoise(channelIndex);
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                for (const track of this.eachSelectedModTrack(channelIndex)) {
                    const bridgeOp = new ChangeBridgeAcross(this._doc, pattern, grow, doBends && !isMod, isNoise, undefined, undefined, track);
                    change.append(bridgeOp);
                }
			}
        }

        this._doc.record(change);
    }

    /**
     * Splits at regular intervals.
     * 
     * See the split function in changesNoteOps.ts.
     * @param cuts The number of cuts (not absolute), or, how many parts between each cut (absolute).
     * @param absolute See cuts.
     * @param perNote If perNote, a copy of split runs per-note.
     */
    public noteSplitAcross(cuts: number, absolute?: boolean, perNote?: boolean): void {
        const change = new ChangeGroup();
        let x1 = this._doc.selection.patternX0;
        let x2 = this._doc.selection.patternSelectionActive ? this._doc.selection.patternX1 : this._doc.song.partsPerPattern;

        // Instead of cuts-per-range, this makes a split every {cut} units of time.
        if (absolute && !perNote) {
            cuts = Math.max(Math.floor((x2 - x1) / cuts) - 1, 1);
        }

        for (const channelIndex of this._eachSelectedChannel()) {
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                for (const track of this.eachSelectedModTrack(channelIndex)) {
                    if (perNote) {
                        const notesCopy = track === undefined
                            ? pattern.notes.concat()
                            : pattern.notes.filter(o => o.pitches.length === 1 && o.pitches[0] === track);

                        for (const note of notesCopy) {
                            const adjustedX1 = Math.max(x1 as number, note.start);
                            let adjustedX2 = Math.min(x2 as number, note.end);
                            let adjustedCuts: number;

                            if (absolute) {
                                const width = adjustedX2 - adjustedX1;
                                if (width <= cuts) { continue; }
                                adjustedX2 = adjustedX1 + Math.ceil(width / cuts) * cuts;
                                adjustedCuts = Math.max(Math.ceil(width / cuts) - 1, 1);
                            } else {
                                adjustedCuts = cuts;
                            }

                            change.append(new ChangeSplitAcross(this._doc, pattern, adjustedCuts, adjustedX1, adjustedX2, track));
                        }
                    } else {
                        change.append(new ChangeSplitAcross(this._doc, pattern, cuts, x1, x2, track));
                    }
                }
			}
        }

        this._doc.record(change);
    }

    /**
     * Eliminates pitch bends and optionally, sets to an averaged pitch or sets volume to 1.
     * Pitch options are disabled in mod channels.
     * 
     * See the stretch vertical relative function in changesNoteOps.ts.
     * @param dontAveragePitch If true, flattens notes without averaging their base pitch between all notes.
     * @param vol If true, flattens the volume to full (100%) which is considered the most useful behavior.
    */
    public noteFlattenAcross(dontAveragePitch?: boolean, vol?: boolean): void {
        const change = new ChangeGroup();

        const x1 = this._doc.selection.patternX0;
        const x2 = this._doc.selection.patternSelectionActive ? this._doc.selection.patternX1 : this._doc.song.partsPerPattern;

        for (const channelIndex of this._eachSelectedChannel()) {
            const isMod = this._doc.song.getChannelIsMod(channelIndex);
            const isNoise = this._doc.song.getChannelIsNoise(channelIndex);
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                for (const track of this.eachSelectedModTrack(channelIndex)) {
                    let bounds = dontAveragePitch ? undefined : getVerticalBounds(pattern.notes, x1, x2);

                    for (let i = 0; i < pattern.notes.length; i++) {
                        const note = pattern.notes[i];
                        if (note.end > x1 && note.start < x2) {
                            if (vol) {
                                if (isNoise) { // Volume max -> Fade out
                                    change.append(new ChangeStepAcross(this._doc, channelIndex, pattern,
                                        { affect: 'vol', per: 'pin', add: ['maxrange - minrange'], onlyExistingPins: true }));
                                    change.append(new ChangeStepAcross(this._doc, channelIndex, pattern,
                                        { affect: 'vol', per: 'pin', mult: [ '1 - num / len'], onlyExistingPins: true }));
                                } else {
                                    change.append(new ChangeStepAcross(this._doc, channelIndex, pattern,
                                        { affect: 'vol', per: 'note', add: ['maxrange - minrange'], onlyExistingPins: true },
                                        undefined, undefined, track
                                    ));
                                }
                            } else if (!isMod) {
                                change.append(new ChangeStretchVerticalRelative(
                                    this._doc, channelIndex, pattern, 0, 0, dontAveragePitch, note.start, note.end, bounds));
                            }
                        }
                    }
                }
                
			}
        }

        this._doc.record(change);
    }

    /**
     * Spread notes evenly, or stack them, across a horizontal range, or vertical detected pitch bounds.
     * Spreading pitch is disabled for mod channels.
     * 
     * See the spread horizontal/vertical functions in changesNoteOps.ts.
     * @param spreadPitch Performs a pitch spread instead of regular spread.
     * @param stackOnly If true, stacks left instead of between, or along bottom if pitch is true.
    */
    public noteSpreadAcross(spreadPitch: boolean, stackOnly: boolean): void {
        const change = new ChangeGroup();

        for (const channelIndex of this._eachSelectedChannel()) {
            const isMod = this._doc.song.getChannelIsMod(this._doc.channel);
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                for (const track of this.eachSelectedModTrack(channelIndex)) {
                    if (stackOnly) {
                        if (spreadPitch && !isMod) {
                            change.append(new ChangeStackBottomAcross(this._doc, pattern));
                        }
                        else if (!spreadPitch) {
                            change.append(new ChangeStackLeftAcross(this._doc, pattern, undefined, undefined, track));
                        }
                    } else if (spreadPitch && !isMod) {
                        change.append(new ChangeSpreadVertical(this._doc, pattern));
                    }
                    else if (!spreadPitch) {
                        change.append(new ChangeSpreadAcross(this._doc, pattern, undefined, undefined, track));
                    }
                }
			}
        }

        this._doc.record(change);
    }

    /** Shifts notes by 1 unit of time left or right at random, if there's space. See the tap function in changesNoteOps.ts. */
    public noteTapAcross(): void {
        const change = new ChangeGroup();
        for (const channelIndex of this._eachSelectedChannel()) {
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                for (const track of this.eachSelectedModTrack(channelIndex)) {
                    change.append(new ChangeTapNotesAcross(this._doc, pattern, undefined, undefined, track));
                }
			}
        }

        this._doc.record(change);
    }

    /**
     * Cumulatively performs changes to notes or pins, possibly generating new pins.
     * 
     * See the step function in changesNoteOps.ts.
     * @param data The arrays and how they interact.
    */
    public noteStepAcross(data: IStepData): void {
        const change = new ChangeGroup();
        for (const channelIndex of this._eachSelectedChannel()) {
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                for (const track of this.eachSelectedModTrack(channelIndex)) {
                    change.append(new ChangeStepAcross(this._doc, channelIndex, pattern, data, undefined, undefined, track));
                }
			}
        }
        this._doc.record(change);
    }

    /**
     * Mirrors notes horizontally/vertically within the horizontal selection or vertical detected bounds.
     * Vertical mirror is disabled in mod channels.
     * 
     * See the mirror horizontal function, or relative vertical stretch function in changesNoteOps.ts.
     * @param isVertical If true, mirrors the selection vertically, else horizontally.
     */
    public noteMirrorAcross(isVertical: boolean): void {
        const change = new ChangeGroup();
        const range = {
            start: this._doc.selection.patternX0,
            end: this._doc.selection.patternSelectionActive ? this._doc.selection.patternX1 : this._doc.song.partsPerPattern
        };

        for (const channelIndex of this._eachSelectedChannel()) {
            const isMod = this._doc.song.getChannelIsMod(channelIndex);
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                const vertRange = getVerticalBounds(pattern.notes, range.start, range.end);

                if (isVertical && !isMod) {
                    change.append(new ChangeStretchVertical(this._doc, channelIndex, pattern, vertRange.max, vertRange.min));
                }
                if (!isVertical) {
                    for (const track of this.eachSelectedModTrack(channelIndex)) {
                        change.append(new ChangeMirrorHorizontal(this._doc, pattern, false, range.start, range.end, track));
                    }
                }
            }
        }

        this._doc.record(change);
    }

    /** Moves notes upwards (or down) by a full step (or octave). */
    public transpose(upward: boolean, octave: boolean): void {
        const canReplaceLastChange: boolean = this._doc.lastChangeWas(this._changeTranspose);
        this._changeTranspose = new ChangeGroup();

        if (this.boxSelectionActive) {
		    this._changeTranspose.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
        }

        for (const channelIndex of this._eachSelectedChannel()) {
		    // Can't transpose mod channels.
		    if (channelIndex >= this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount)
                continue;
            for (const pattern of this._eachSelectedPattern(channelIndex)) {
                this._changeTranspose.append(new ChangeTranspose(this._doc, channelIndex, pattern, upward, this._doc.prefs.notesOutsideScale, octave));
			}
        }

        this._doc.record(this._changeTranspose, canReplaceLastChange);
    }

    public swapChannels(offset: number): void {
        const possibleSectionBoundaries: number[] = [
            this._doc.song.pitchChannelCount,
            this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount,
            this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount + this._doc.song.modChannelCount,
            this._doc.song.getChannelCount(),
        ];
        let channelSectionMin: number = 0;
        let channelSectionMax: number = 0;
        for (const nextBoundary of possibleSectionBoundaries) {
            if ((this.boxSelectionChannel < nextBoundary && offset < 0) || (this.boxSelectionChannel + this.boxSelectionHeight <= nextBoundary)) {
                channelSectionMax = nextBoundary - 1;
                break;
            }
            channelSectionMin = nextBoundary;
        }
        const newSelectionMin: number = Math.max(this.boxSelectionChannel, channelSectionMin);
        const newSelectionMax: number = Math.min(this.boxSelectionChannel + this.boxSelectionHeight - 1, channelSectionMax);
        offset = Math.max(offset, channelSectionMin - newSelectionMin);
        offset = Math.min(offset, channelSectionMax - newSelectionMax);

        if (offset != 0) {
            const canReplaceLastChange: boolean = this._doc.lastChangeWas(this._changeReorder);
            this._changeReorder = new ChangeGroup();
            this.trackY0 = newSelectionMin + offset;
            this.trackY1 = newSelectionMax + offset;
            this._changeReorder.append(new ChangeChannelOrder(this._doc, newSelectionMin, newSelectionMax, offset));
            this._changeReorder.append(new ChangeChannelBar(this._doc, Math.max(this.trackY0, Math.min(this.trackY1, this._doc.channel + offset)), this._doc.bar));
            this.selectionUpdated();
            this._doc.record(this._changeReorder, canReplaceLastChange);
        }
    }

    public selectInstrument(instrument: number): void {
        if (this._doc.viewedInstrument[this._doc.channel] == instrument) {
            // Multi-selection is not possible for mods... that would not make much sense.
            if (this._doc.song.layeredInstruments && this._doc.song.patternInstruments && this._doc.channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount) {
                const canReplaceLastChange: boolean = this._doc.lastChangeWas(this._changeInstrument);
                this._changeInstrument = new ChangeGroup();
                const instruments: number[] = this._doc.recentPatternInstruments[this._doc.channel];
                this._doc.notifier.changed(); // doc.recentPatternInstruments changes even if a 0 pattern is selected.
                if (instruments.indexOf(instrument) == -1) {
                    instruments.push(instrument);
                    const maxLayers: number = this._doc.song.getMaxInstrumentsPerPattern(this._doc.channel);
                    if (instruments.length > maxLayers) {
                        instruments.splice(0, instruments.length - maxLayers);
                    }
                } else {
                    instruments.splice(instruments.indexOf(instrument), 1);
                    if (instruments.length == 0) instruments[0] = 0;
                }

                if (this.boxSelectionActive) {
                    this._changeInstrument.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
                }
                for (const channelIndex of this._eachSelectedChannel()) {
                    for (const pattern of this._eachSelectedPattern(channelIndex)) {
                        this._changeInstrument.append(new ChangeSetPatternInstruments(this._doc, channelIndex, instruments, pattern));
                    }
                }
                if (!this._changeInstrument.isNoop())
		    this._doc.record(this._changeInstrument, canReplaceLastChange);
            }
        } else {
            const canReplaceLastChange: boolean = this._doc.lastChangeWas(this._changeInstrument);
            this._changeInstrument = new ChangeGroup();
            this._changeInstrument.append(new ChangeViewInstrument(this._doc, instrument));

            if (!(this._doc.song.layeredInstruments && this._doc.channel < this._doc.song.pitchChannelCount + this._doc.song.noiseChannelCount) && this._doc.song.patternInstruments) {
                if (this.boxSelectionActive) {
                    this._changeInstrument.append(new ChangeDuplicateSelectedReusedPatterns(this._doc, this.boxSelectionBar, this.boxSelectionWidth, this.boxSelectionChannel, this.boxSelectionHeight));
                }
                const instruments: number[] = [instrument];
                for (const channelIndex of this._eachSelectedChannel()) {
                    for (const pattern of this._eachSelectedPattern(channelIndex)) {
                        this._changeInstrument.append(new ChangeSetPatternInstruments(this._doc, channelIndex, instruments, pattern));
                    }
                }
                this._doc.record(this._changeInstrument, canReplaceLastChange);
            } else if (!this._doc.hasRedoHistory()) {
                // Don't erase existing redo history just to look at highlighted pattern.
                this._doc.record(this._changeInstrument, canReplaceLastChange);
            }
        }
    }

    public resetBoxSelection(): void {
        this.trackX0 = this.trackX1 = this._doc.bar;
        this.trackY0 = this.trackY1 = this._doc.channel;
    }
}
