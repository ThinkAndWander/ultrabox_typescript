import {HTML} from "imperative-html/dist/esm/elements-strict";
import { SongDocument } from "./SongDocument";
const { span, kbd } = HTML;

/**
 * This is the complete command subsystem, which is self-contained except for the custom shortcut editor prompt and
 * command palette, the serialization of those commands in Preferences.ts and event hook bindings of ShortcutHandler in
 * SongEditor.ts on the "mainlayer" div. Documentation should be very complete, find and contact a developer if you have
 * questions.
 * 
 * Commands are parameter-driven actions with associated shortcuts to invoke them, along with optional action data
 * associated per-shortcut or command-wide. The CommandTargetName enum and targets object define the parameters of an
 * action, while the Command class has action data that default shortcut handling mechanisms pipe in as arguments.
 * The performance of a command is done by event handling from SongEditor.ts as it has access to all the relevant data.
 * 
 * Parameters can define metadata for what's valid for the arguments, such as number metadata for whether the argument
 * should be rounded to an int or clamped to a min/max range (during evaluation). Arguments can also define metadata,
 * such as how the main data for a numeric argument gets combined (set, add, multiply, etc.) with the original data.
 * The original data is usually supplied after the command is invoked, whenever the argument should actually be read.
 * This way it can all be done by the main event handling in SongEditor.ts.
 * 
 * Shortcuts support chords of mixed inputs, like Ctrl + left-click. Invalid inputs are not detected or prevented as
 * there is no future-proof way to do so. Shortcuts should match KeyboardEvent.key or MouseEvent.button, using the
 * CursorButtons enum for the latter, which is a superset that includes vertical mouse wheel up/down.
 * 
 * Shortcut handling tracks the currently-held inputs and contexts for the sake of identifying which commands to invoke
 * via hashing the options to an object upfront and accessing the key matching hashed current input commands. As inputs
 * are pressed, commands are evaluated for early invocation and again as inputs are released, for late invocation.
 * These modes are the same except that early invocation will not fire commands when ambiguous, e.g. [A] is held, there
 * is a command matching [A] but also one matching [A + B]. The idea is that a user might be typing [A + B] and it
 * doesn't become clear they only want to invoke [A] until they start releasing inputs. As such, late invocation occurs
 * BEFORE the key is released, or nothing would happen. The order of current held inputs / inputs in shortcut entries
 * are irrelevant.
 * 
 * Shortcut handling supports holding down keys to invoke repeatedly, with the caveat that shortcuts that get deferred
 * until late invocation cannot be repeated.
 * 
 * Shortcomings of this system:
 * - all shortcomings of KeyboardEvent.key, which is only a concern for default shortcuts, namely that modifier keys
 *     change the key, i.e. you can fire [`] or [Shift, ~] but not [Shift, `] because if shift is held, ` becomes ~ and
 *     this might not be true on your keyboard. But unless users are exporting layouts or swapping their own keyboard
 *     layout, it will reliably be true for custom commands a user sets. Those scenarios are rare enough to leave it to
 *     users to adjust their own commands.
 * - you cannot specify commands based on up or down state (you can override this), because it was decided that it's
 *     better to abstract this out of the user's hands. Allowing it would complicate scenarios for no special reason.
 * - you cannot hold inputs to repeat-invoke a command that defers (late invocation)
 * - default shortcuts should not rely on Alt or other keybinds that major browsers like to use. The end user can be
 * expected to avoid their own browser's shortcuts when they set custom ones, so this applies only to defaults. Usually
 * we don't use modifier keys, and we need to also be careful about default shortcuts that include the easyPianoKey
 * keys because when held, shortcuts without that key also fire. (Note: easyPiano escape key used to be Control, but it
 * was an annoying binding to work around due to how often shortcuts use Control.)
 */

const commandSyntaxVersion = 1;
const matchNumber = /^[\+\-]?\d*\.?\d+$/; // No hex, octal or scientific notation
const clamp = (orig: number, min: number, max: number) => {
    return orig > max ? max : orig < min ? min : orig;
}

//#region Commands
/**
 * Identifies an action like undo or redo, with no associated data, or a setting that can have its value modified.
 * Note: This is serialized with custom commands. Don't change publicly-released entries.
*/
export enum CommandTargetName {
    None = -1,
    CopyInstrument = 0,
    CopyPattern = 1,
    CutPattern = 2,
    DeleteBar = 3,
    DeleteChannel = 4,
    DuplicatePattern = 5,
    EditBeatsPerBar = 6,
    EditChannelSettings = 7,
    EditCustomSamples = 8,
    EditLimiter = 9,
    EditNoteFilter = 10,
    EditSongEQ = 11,
    EditSongLength = 12,
    Export = 13,
    ExportInstrument = 14,
    ExtendSelectionLeft = 15,
    ExtendSelectionRight = 16,
    GenerateEuclideanRhythm = 17,
    Import = 18,
    InsertBarNext = 19,
    InsertBarPrev = 20,
    InsertChannel = 21,
    Jummbify = 22,
    LoopPattern = 23,
    MoveChannelDown = 24,
    MoveChannelUp = 25,
    MoveNotesSideways = 26,
    MovePatternLeft = 27,
    MovePatternRight = 28,
    MuteAll = 29,
    MuteChannel = 30,
    NewPattern = 31,
    NewPatternFromEmpty = 32,
    NewSong = 33,
    NextBar = 34,
    OpenSongPlayer = 35,
    PasteInstrument = 36,
    PastePattern = 37,
    PastePatternNumbers = 38,
    PatternDown = 39,
    PatternUp = 40,
    PlayOrPause = 41,
    PlayAtCursor = 42,
    PrevBar = 43,
    RandomInstrumentPreset = 44,
    RandomInstrumentGenerated = 45,
    Redo = 46,
    ResetBoxSelection = 47,
    RemovePattern = 48,
    SelectAllPatterns = 49,
    SelectChannel = 50,
    SelectionDown = 51,
    SelectionUp = 52,
    SetInstrument = 53,
    SetChannel = 54,
    SetRhythm = 55,
    SnapPlayheadToBeginning = 56,
    SnapPlayheadToLoopStart = 57,
    SnapPlayheadToSelected = 58,
    SoloChannel = 59,
    SongRecovery = 60,
    ToggleRecording = 61,
    TransposeDown = 62,
    TransposeOctaveDown = 63,
    TransposeOctaveUp = 64,
    TransposeUp = 65,
    Undo = 66,
    Macro = 67,
    EditShortcutsAndCommands = 68,
    SetNoteSelection = 69,
    InvertSelection = 70,
    SelectByFeature = 71,
    NotesMerge = 72,
    NotesBridge = 73,
    NotesSpread = 74,
    NotesMirror = 75,
    NotesFlatten = 76,
    NotesSplit = 77,
    NotesVolumeUp = 78,
    NotesVolumeDown = 79,
    NotesFadeOut = 80,
    NotesFadeIn = 81,
    NotesGainIn = 82,
    NotesGainOut = 83,
    NotesMaxContrast = 84,
    RunNoteFunction = 85,
    RunCommand = 86,
    RepeatLastCommand = 87
}

/**
 * Commands can have data passed to them.
 * Note: This is serialized with custom commands. Don't change publicly-released entries.
*/
export const enum CommandActionDataType {
    Bool = 0,
    Number = 1,
    String = 2
}

/**
 * Contexts indicate when a command should/n't be available. In all cases, eligibility and all safeguards must be part
 * of the command handling in case the command is invoked by any means.
 * Note: This is serialized with custom commands. Don't change publicly-released entries.
 */
export enum CommandContext {
    /** When playback is actively occurring. */
    LivePlayback = 0,

    /** When a pattern selection exists. */
    PatternSelection = 1,

    /** When a channel selection exists. */
    ChannelSelection = 2,

    /** When the active channel is a modulation channel. */
    ModulationChannelActive = 3,

    /** When there is a MIDI device registered and actively monitored to record. */
    Recording = 4,

    /** For setting mobile-only shortcuts. */
    IsMobile = 5
}

export interface CommandTargetInfo {
    name: string,
    params: (Param | ParamNum)[]
}

export interface Param { type: CommandActionDataType, hint: string }
export interface ParamNum extends Param { type: CommandActionDataType.Number, isInt: boolean }

export function isArgumentValid(param: Param, data: CommandArgument): boolean {
    switch (param.type) {
        case CommandActionDataType.String:
            return true;
        case CommandActionDataType.Bool:
            const actionDataLower = data.value.toLowerCase();
            return actionDataLower === "t" || actionDataLower === "true" ||
                actionDataLower === "f" || actionDataLower === "false" ||
                actionDataLower === "toggle";
        case CommandActionDataType.Number:
            if (data.metadata === undefined) {
                return matchNumber.test(data.value)
                && (!(param as ParamNum).isInt || Number.isInteger(+data.value));
            }

            const isListType =
                data.metadata === "cycle" ||
                data.metadata === "cycle--stop" ||
                data.metadata === "cycle-add" ||
                data.metadata === "cycle-add-stop" ||
                data.metadata === "cycle-sub" ||
                data.metadata === "cycle-sub-stop" ||
                data.metadata === "random-list-set" ||
                data.metadata === "random-list-add" ||
                data.metadata === "random-list-sub" ||
                data.metadata === "random-list-mul" ||
                data.metadata === "random-list-div";

            const isRangeType =
                data.metadata === "random-add" ||
                data.metadata === "random-set" ||
                data.metadata === "random-sub" ||
                data.metadata === "random-mul" ||
                data.metadata === "random-div";

            // Type must be recognized.
            if (!isListType && !isRangeType &&
                data.metadata !== "add" &&
                data.metadata !== "set" &&
                data.metadata !== "sub" &&
                data.metadata !== "mul" &&
                data.metadata !== "div" &&
                data.metadata !== "add-wrap" &&
                data.metadata !== "sub-wrap") {
                return false;
            }

            // There must be at least 1 value, and all values must be valid numbers (this is intentional for
            // int types, since float math can still be useful).
            if (isListType || isRangeType)
            {
                const numberStrings = data.value.split(",");

                if ((isListType && numberStrings.length === 0) ||
                    (isRangeType && numberStrings.length !== 2))
                {
                    return false;
                }

                for (const numberString of numberStrings) {
                    if (!matchNumber.test(numberString)) {
                        return false;
                    }
                }

                return true;
            }

            return matchNumber.test(data.value);
        default: (param.type satisfies never) // Catch missing TS cases
            return false;
    }
}

/** Interprets data as a number, returning origValue if anything is wrong. */
export function actionDataAsNumber(actiondata: CommandArgument, origValue: number, min: number, max: number): number {
    let data = actiondata.value;
    let metadata = actiondata.metadata ?? "set"; // Treat undefined as set.

    /** Cycles the list of numbers based on the current value. Valid syntaxes:
     * cycle: selects next item, or first item if current value isn't in list.
     * cycle--stop: same as cycle, but does nothing if at end of list.
     * cycle-add: selects next item, or nearest greater number if current value isn't in list.
     * cycle-add-stop: same as cycle-add, but does nothing if at end of list.
     * cycle-sub: selects prev item, or nearest smaller number if current value isn't in list.
     * cycle-sub-stop: same as cycle-sub, but does nothing if at start of list.
     */
    if (metadata.startsWith("cycle")) {
        const numbers: number[] = [];
        const numberStrings = data.split(",");
        let num: number;
        for (let i = 0; i < numberStrings.length; i++) {
            num = +numberStrings[i];
            if (Number.isFinite(num) && !Number.isNaN(num)) {
                numbers.push(clamp(num, min, max));
            }
        }
        if (numbers.length === 0) {
                return origValue;
        }

        const pieces = metadata.split("-");
        const doAdd = pieces.length > 1 && pieces[1] === "add";
        const doSub = pieces.length > 1 && pieces[1] === "sub";
        const doStop = pieces.length > 2 && pieces[2] === "stop";

        // Jump to the exact number.
        let nearestValueIndex = -1;
        let nearestValueDiff = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < numbers.length; i++) {
            // If a number in the cycle is matched, shift to the next/prev.
            if (origValue === numbers[i]) {
                if (doSub) {
                    return (i !== 0)
                        ? numbers[i - 1]
                        : doStop ? origValue : numbers[numbers.length - 1];
                }

                return (i < numbers.length - 1)
                    ? numbers[i + 1]
                    : doStop ? origValue : numbers[0];
            }

            // While no number is matched, track the nearest one to snap to.
            if ((doAdd && numbers[i] - origValue > 0 && numbers[i] - origValue < nearestValueDiff) ||
                (doSub && origValue - numbers[i] > 0 && origValue - numbers[i] < nearestValueDiff)) {
                nearestValueIndex = i;
                nearestValueDiff = origValue - numbers[i];
            }
        }

        // snaps to nearest if set, else jumps to start.
        return (nearestValueIndex !== -1)
            ? numbers[nearestValueIndex]
            : numbers[0];
    }

    /** Performs randomization. Valid syntaxes:
     * random-set: sets to a value between [min, max).
     * random-add: adds a value between [min, max].
     * random-sub: subtracts a value between [min, max].
     * random-mul: multiplies by a value between [min, max].
     * random-div: divides by a value between [min, max].
     * random-list-set: randomly picks a value from the list, then sets to it.
     * random-list-add: randomly picks a value from the list, then adds it.
     * random-list-sub: randomly picks a value from the list, then subtracts it.
     * random-list-mul: randomly picks a value from the list, then multiplies it.
     * random-list-div: randomly picks a value from the list, then divides it.
     */
    if (metadata.startsWith("random-list")) {
        const numbers: number[] = [];
        const numberStrings: string[] = data.split(",");
        for (let i = 0; i < numberStrings.length; i++) {
            const num = +numberStrings[i];
            if (Number.isFinite(num) && !Number.isNaN(num)) {
                numbers.push(num);
            }
        }
        if (numbers.length < 1) { return origValue; }

        const pickedNumber = numbers[Math.round(Math.random() * numbers.length)];
        if (metadata === "random-list-set") { return clamp(pickedNumber, min, max); }
        if (metadata === "random-list-add") { return clamp(origValue + pickedNumber, min, max); }
        if (metadata === "random-list-sub") { return clamp(origValue - pickedNumber, min, max); }
        if (metadata === "random-list-mul") { return clamp(origValue * pickedNumber, min, max); }
        if (metadata === "random-list-div") { return clamp(origValue / pickedNumber, min, max); }
        return origValue;
    }
    else if (metadata.startsWith("random")) {
        const numbers: number[] = [];
        const rangeStrings = data.split(",");
        for (let i = 0; i < rangeStrings.length; i++) {
            const num = +rangeStrings[i];
            if (Number.isFinite(num) && !Number.isNaN(num)) {
                numbers.push(num);
            }
        }
        if (numbers.length !== 2) { return origValue; }
        const randomNumber = numbers[0] + Math.random() * Math.abs(numbers[1] - numbers[0]);
        if (metadata === "random-set") { return clamp(randomNumber, min, max); }
        if (metadata === "random-add") { return clamp(origValue + randomNumber, min, max); }
        if (metadata === "random-sub") { return clamp(origValue - randomNumber, min, max); }
        if (metadata === "random-mul") { return clamp(origValue * randomNumber, min, max); }
        if (metadata === "random-div") { return clamp(randomNumber === 0 ? max : origValue / randomNumber, min, max); }
        return origValue;
    }

    /**
     * Valid syntaxes: set, add, sub, mul, div, add-wrap, sub-wrap. Performs simple arithmetic on one value,
     * where add-wrap and sub-wrap are add/sub that wraps around the range.
    */
    let value = +data;
    if (!Number.isFinite(value) || Number.isNaN(value)) { return origValue; }
    if (metadata === "set") { return clamp(value, min, max); }
    if (metadata === "add") { return clamp(origValue + value, min, max); }
    if (metadata === "sub") { return clamp(origValue - value, min, max); }
    if (metadata === "mul") { return clamp(origValue * value, min, max); }
    if (metadata === "div") { return clamp(value === 0 ? max : origValue / value, min, max); }
    if (metadata === "add-wrap" || metadata === "sub-wrap") {
        let val = metadata === "add-wrap" ? origValue + value : origValue - value;
        while (val < min) { val += max + (1 - min); }
        while (val > max) { val -= max + (1 - min); }
        return clamp(val, min, max);
    }

    return origValue;
}

/** Interprets data as a bool, returning false for unknown values. */
export function actionDataAsBool(actiondata: CommandArgument, origValue: boolean): boolean {
    const lower = actiondata.value.toLowerCase();
    return lower === "toggle" ? !origValue : lower === "t" || lower === "true";
}

/** Where argument data is required, it's treated as a string. Some types (e.g. numbers), may have metadata. */
export type CommandArgument = { value: string; metadata?: string; }

/**
 * The serialized format of custom commands; if the format or meaning of data changes, increment the version so
 * old versions can be migrated successfully.
 */
interface CommandJSON {
    N: string // name
    T: CommandTargetName // target
    C?: string // context
    S: IShortcut[] // shortcuts
    D?: CommandArgument[] // argumentdata
    V: number // version
}

// keyed by built-in ID, which == target index (serial safe). A built-in entry is disabled if null is found with its
// same index, or edited if a command is found.
export interface BuiltInLookup {[key: string]: Command | null}
interface BuiltInLookupJSON {[key: string]: CommandJSON | null}

/**
 * Commands are invocable actions with a target concept such as "undo" or "left selection position", and the parameters
 * of its target are defined by the targets object. A command is intended to provide action data as a semicolon-delimited
 * string, where each value satisfies the parameters in-order for its target. Action data can be provided by calling a
 * ShortcutHandler's command invoke callback, since it takes a command and action data. This isn't validated. Otherwise,
 * it comes from, in fallback order:
 * 1. Freeform input if a shortcut requests it,
 * 2. Action data associated to the shortcut that invoked it,
 * 3. Action data associated to the command itself
 * 
 * A command with a target that has parameters must satisfy those in all of its shortcuts, or any number of them if its
 * default action data satisfies it.
 */
export class Command
{
    /** Display name of the command, used by e.g. a shortcut manager or command palette. */
    public Name: string

    /** The setting or action associated to the command invocation. */
    public Target: CommandTargetName

    /**
     * Context must be true for the command to be normally invoked. This is a string of number sequences representing
     * enum values of CommandContext that evaluates to a boolean when values prefixed by ! are absent and the rest aren't.
     */
    public Context: string

    /** A list of input sequences that invoke the command (per the default implementation). */
    public Shortcuts: IShortcut[]

    /**
     * Parameterized commands must provide valid default action data, or have valid action data for each shortcut.
     * This is used by the shortcut-firing implementation if the firing shortcut provides no data itself.
     */
    public ArgumentData?: CommandArgument[]

    /**
     * Custom commands are versioned for backwards compatibility. The current version is set to a constant maintained
     * by the custom shortcut editor.
     */
    public Version?: number

    public constructor(
        name: string,
        target: CommandTargetName,
        context: string,
        shortcuts: IShortcut[],
        argumentData?: CommandArgument[],
        version?: number)
    {
        this.Name = name;
        this.Target = target;
        this.Context = context;
        this.Shortcuts = shortcuts;
        this.ArgumentData = argumentData;
        this.Version = version;
    }

    /** Verifies that every shortcut provides valid values for expected parameters. */
    public ValidArguments(): boolean {
        const numParams = targets[this.Target].params.length;

        if (this.ArgumentData !== undefined && (this.ArgumentData.length !== numParams ||
            targets[this.Target].params.some((o, index) => !isArgumentValid(o, this.ArgumentData![index]))))
        {
            return false;
        }

        let allShortcutsHaveArgsOrFreeform = true;
        for (const shortcut of this.Shortcuts) {
            if (!shortcut.freeformEntry && !shortcut.argumentData) {
                allShortcutsHaveArgsOrFreeform = false;
            }
            if (shortcut.argumentData !== undefined && (shortcut.argumentData.length !== numParams ||
                targets[this.Target].params.some((o, index) => !isArgumentValid(o, shortcut.argumentData![index]))))
            {
                return false;
            }
        }

        return (allShortcutsHaveArgsOrFreeform || (this.ArgumentData ?? []).length === targets[this.Target].params.length);
    }

    /**
     * Returns true for empty contexts or if every number sequence in the command's context matches an enum value in
     * active contexts, or is absent if the number sequence starts with a ! symbol. Example: "4 !3 1 42 !5"
     */
    public static ValidContext(command: Command, activeContexts: CommandContext[]): boolean {
        return (command.Context === "") || (command.Context.match(/!?[0-9]*/g)?.some(
            str => (str[0] === '!') !== activeContexts.includes(+str)) ?? false);
    }

    private static ToJSONObj(cmd: Command): CommandJSON {
        return {
            N: cmd.Name,
            T: cmd.Target,
            ...(cmd.Context !== "" && { C: cmd.Context }),
            S: cmd.Shortcuts,
            ...(cmd.ArgumentData && cmd.ArgumentData.length > 0 && { D: cmd.ArgumentData }),
            V: cmd.Version ?? commandSyntaxVersion // Version cleared during load.
        };
    }

    private static FromJSONObj(jsonObj: CommandJSON): Command | undefined {
        const command = new Command(
            jsonObj.N ?? "",
            jsonObj.T ?? CommandTargetName.None,
            jsonObj.C ?? "",
            jsonObj.S.map(o => ({ ...o, keys: o.keys.map(k => k.toLowerCase()) })),
            jsonObj.D,
            jsonObj.V);

        if (!command.ValidArguments()) { return undefined; } // Don't rehydrate bad arguments
        /* Migrate old versions here */
        command.Version = undefined;
        return command;
    }

    public static ToJSON(cmd: Command): string { return JSON.stringify(Command.ToJSONObj(cmd)); }
    public static ToJSONArray(commands: Command[]): string { return JSON.stringify(commands.map(o => Command.ToJSONObj(o))); }
    public static FromJSON(commandJson: string): Command | undefined { return Command.FromJSONObj(JSON.parse(commandJson) as CommandJSON); }
    public static FromJSONArray(commandArrayJson: string): Command[] { return (JSON.parse(commandArrayJson) as CommandJSON[]).map(entry => Command.FromJSONObj(entry)).filter(o => o !== undefined) as Command[]; }
    public static FromJSONLookup(commandLookupJson: string): BuiltInLookup {
        const lookup: BuiltInLookup = {};
        const jsonObj = JSON.parse(commandLookupJson) as BuiltInLookupJSON;
        Object.entries(jsonObj).forEach(o => {
            if (o[1]) { const restored = Command.FromJSONObj(o[1]);  if (restored) { lookup[o[0]] = restored; } }
            else { lookup[o[0]] = null; }
        });
        return lookup;
    }
    public static ToJSONLookup(lookup: BuiltInLookup): string {
        const jsonObj: BuiltInLookupJSON = {};
		Object.entries(lookup).forEach(o => jsonObj[o[0]] = o[1] === null ? null : Command.ToJSONObj(o[1]))
        return JSON.stringify(jsonObj);
    }
}

/** The metadata of all possible targets. Names here are for actions, but argument-less commands often reuse them. */
const channelparam = { hint: 'modulation track # (0 to ignore)', type: CommandActionDataType.Number };
export const targets: { [key in CommandTargetName]: CommandTargetInfo } = {
    [CommandTargetName.None]: { name: '', params: [] },
    [CommandTargetName.CopyInstrument]: { name: 'Copy instrument', params: [] },
    [CommandTargetName.CopyPattern]: { name: 'Copy pattern', params: [] },
    [CommandTargetName.CutPattern]: { name: 'Cut pattern', params: [] },
    [CommandTargetName.DeleteBar]: { name: 'Delete bar', params: [] },
    [CommandTargetName.DeleteChannel]: { name: 'Delete channel', params: [] },
    [CommandTargetName.DuplicatePattern]: { name: 'Duplicate pattern', params: [] },
    [CommandTargetName.EditBeatsPerBar]: { name: 'Edit beats per bar', params: [] },
    [CommandTargetName.EditChannelSettings]: { name: 'Edit channel settings', params: [] },
    [CommandTargetName.EditCustomSamples]: { name: 'Edit custom samples', params: [] },
    [CommandTargetName.EditLimiter]: { name: 'Edit limiter', params: [] },
    [CommandTargetName.EditNoteFilter]: { name: 'Edit note filter', params: [] },
    [CommandTargetName.EditSongEQ]: { name: 'Edit song EQ', params: [] },
    [CommandTargetName.EditSongLength]: { name: 'Edit song length', params: [] },
    [CommandTargetName.Export]: { name: 'Export song', params: [] },
    [CommandTargetName.ExportInstrument]: { name: 'Export instrument', params: [] },
    [CommandTargetName.ExtendSelectionLeft]: { name: 'Extend selection left', params: [] },
    [CommandTargetName.ExtendSelectionRight]: { name: 'Extend selection right', params: [] },
    [CommandTargetName.GenerateEuclideanRhythm]: { name: 'Generate Euclidean rhythm', params: [] },
    [CommandTargetName.Import]: { name: 'Import samples', params: [] },
    [CommandTargetName.InsertBarNext]: { name: 'Insert bar in front', params: [] },
    [CommandTargetName.InsertBarPrev]: { name: 'Insert bar behind', params: [] },
    [CommandTargetName.InsertChannel]: { name: 'Insert channel', params: [] },
    [CommandTargetName.Jummbify]: { name: 'Jummbify', params: [] },
    [CommandTargetName.LoopPattern]: { name: 'Loop pattern', params: [] },
    [CommandTargetName.MoveChannelDown]: { name: 'Move channel down', params: [] },
    [CommandTargetName.MoveChannelUp]: { name: 'Move channel up', params: [] },
    [CommandTargetName.MoveNotesSideways]: { name: 'Move notes sideways', params: [] },
    [CommandTargetName.MovePatternLeft]: { name: 'Move pattern left', params: [] },
    [CommandTargetName.MovePatternRight]: { name: 'Move pattern right', params: [] },
    [CommandTargetName.MuteAll]: { name: 'Mute all channels', params: [] },
    [CommandTargetName.MuteChannel]: { name: 'Mute channel', params: [] },
    [CommandTargetName.NewPattern]: { name: 'New pattern', params: [] },
    [CommandTargetName.NewPatternFromEmpty]: { name: 'New pattern from empty', params: [] },
    [CommandTargetName.NewSong]: { name: 'New song', params: [] },
    [CommandTargetName.NextBar]: { name: 'Next bar', params: [] },
    [CommandTargetName.OpenSongPlayer]: { name: 'Open song player', params: [] },
    [CommandTargetName.PasteInstrument]: { name: 'Paste instrument', params: [] },
    [CommandTargetName.PastePattern]: { name: 'Paste pattern', params: [] },
    [CommandTargetName.PastePatternNumbers]: { name: 'Paste pattern numbers', params: [] },
    [CommandTargetName.PatternDown]: { name: 'Pattern down', params: [] },
    [CommandTargetName.PatternUp]: { name: 'Pattern up', params: [] },
    [CommandTargetName.PlayOrPause]: { name: 'Play or pause', params: [] },
    [CommandTargetName.PlayAtCursor]: { name: 'Play at cursor', params: [] },
    [CommandTargetName.PrevBar]: { name: 'Previous bar', params: [] },
    [CommandTargetName.RandomInstrumentPreset]: { name: 'Random instrument preset', params: [] },
    [CommandTargetName.RandomInstrumentGenerated]: { name: 'Random instrument generated', params: [] },
    [CommandTargetName.Redo]: { name: 'Redo', params: [] },
    [CommandTargetName.ResetBoxSelection]: { name: 'Reset box selection', params: [] },
    [CommandTargetName.RemovePattern]: { name: 'Remove pattern', params: [] },
    [CommandTargetName.SelectAllPatterns]: { name: 'Select all patterns', params: [] },
    [CommandTargetName.SelectChannel]: { name: 'Select channel', params: [] },
    [CommandTargetName.SelectionDown]: { name: 'Selection down', params: [] },
    [CommandTargetName.SelectionUp]: { name: 'Selection up', params: [] },
    [CommandTargetName.SetInstrument]: { name: 'Set instrument #', params: [
        { hint: 'instrument #', type: CommandActionDataType.Number, isInt: true }] },
    [CommandTargetName.SetChannel]: { name: 'Set channel', params: [
        { hint: 'channel #', type: CommandActionDataType.Number, isInt: true }] },
    [CommandTargetName.SetRhythm]: { name: 'Set rhythm', params: [
        { hint: 'rhythm (3, 4, 6, 8, 12)', type: CommandActionDataType.Number, isInt: true }] },
    [CommandTargetName.SnapPlayheadToBeginning]: { name: 'Snap playhead to start', params: [] },
    [CommandTargetName.SnapPlayheadToLoopStart]: { name: 'Snap playhead to loop start', params: [] },
    [CommandTargetName.SnapPlayheadToSelected]: { name: 'Snap playhead to selected', params: [] },
    [CommandTargetName.SoloChannel]: { name: 'Solo channel', params: [] },
    [CommandTargetName.SongRecovery]: { name: 'Open song recovery', params: [] },
    [CommandTargetName.ToggleRecording]: { name: 'Toggle recording', params: [] },
    [CommandTargetName.TransposeDown]: { name: 'Move notes down a step', params: [] },
    [CommandTargetName.TransposeOctaveDown]: { name: 'Move notes down an octave', params: [] },
    [CommandTargetName.TransposeOctaveUp]: { name: 'Move notes up an octave', params: [] },
    [CommandTargetName.TransposeUp]: { name: 'Move notes up a step', params: [] },
    [CommandTargetName.Undo]: { name: 'Undo', params: [] },
    [CommandTargetName.Macro]: { name: 'Macro', params: [
        { hint: 'List of command names followed by (), with args inside', type: CommandActionDataType.String }]},
    [CommandTargetName.EditShortcutsAndCommands]: { name: 'Edit shortcuts and commands', params: [] },
    [CommandTargetName.SetNoteSelection]: { name: 'Set note selection', params: [
        { hint: 'Start (-1 no change)', type: CommandActionDataType.Number, isInt: true },
        { hint: 'End (-1 no change)', type: CommandActionDataType.Number, isInt: true }]},
    [CommandTargetName.InvertSelection]: { name: 'Invert selection', params: [
        { hint: 'Prefer left side? (prefers right otherwise)', type: CommandActionDataType.Bool }]},
    [CommandTargetName.SelectByFeature]: { name: 'Select by feature', params: [
        { hint: 'any/all (n=notes g=gaps e=ends p=pins b=backwards, x=exclusive)', type: CommandActionDataType.String },
        channelparam]},
    [CommandTargetName.NotesMerge]: { name: 'Note merge', params: [
        { hint: 'all?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesBridge]: { name: 'Note bridge', params: [
        { hint: 'grow?', type: CommandActionDataType.Bool },
        { hint: 'bend?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesSpread]: { name: 'Note spread', params: [
        { hint: 'stack?', type: CommandActionDataType.Bool },
        { hint: 'pitch?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesMirror]: { name: 'Mirror notes', params: [
        { hint: 'vertical? (otherwise horizontal)', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesFlatten]: { name: 'Note flatten', params: [
        { hint: 'pitch?', type: CommandActionDataType.Bool },
        { hint: 'volume?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesSplit]: { name: 'Note split', params: [
        { hint: '# splits', type: CommandActionDataType.Number, isInt: true },
        { hint: 'across?', type: CommandActionDataType.Bool },
        { hint: 'absolute?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesVolumeUp]: { name: 'Note volume up', params: [ channelparam ] },
    [CommandTargetName.NotesVolumeDown]: { name: 'Note volume down', params: [ channelparam ] },
    [CommandTargetName.NotesFadeOut]: { name: 'Note fade out', params: [
        { hint: 'quadratic fade?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesFadeIn]: { name: 'Note fade in', params: [
        { hint: 'quadratic fade?', type: CommandActionDataType.Bool },
        channelparam]},
    [CommandTargetName.NotesGainIn]: { name: 'Note gain in', params: [ channelparam ] },
    [CommandTargetName.NotesGainOut]: { name: 'Note gain out', params: [ channelparam ] },
    [CommandTargetName.NotesMaxContrast]: { name: 'Note max contrast', params: [ channelparam ] },
    [CommandTargetName.RunNoteFunction]: { name: 'Run note function', params: [
        { hint: 'preset name or JSON', type: CommandActionDataType.String },
        channelparam]},
    [CommandTargetName.RunCommand]: { name: 'Run command', params: [] },
    [CommandTargetName.RepeatLastCommand]: { name: 'Repeat last command', params: [] }
};

// Just to keep below neat
const nums = ['0','1','2','3','4','5','6','7','8','9'];
const simple = (target: CommandTargetName, keys: string[], repeat?: boolean, early?: boolean) => {
    return new Command(targets[target].name, target, "", [{ keys, repeat, invokeOptions: early ? InvokeOptions.Early : undefined }]);
}
const entry = (target: CommandTargetName, shortcuts: IShortcut[], commandArgumentData?: CommandArgument[]) => {
    return new Command(targets[target].name, target, "", shortcuts, commandArgumentData);
}

/**
 * The built-in commands list, indexed by command target (one entry each).
 * 
 * Built-in commands. These are indexed by target so the GUI can find and display shortcuts, though fair warning, not
 * all targets have an entry. Most borrow the display name of their target as most aren't parameterized, so this is
 * mainly for the default shortcuts. Note that Control is used by keyboard performance (playing it as a piano) which
 * uses either caps lock state or control to activate keys. Meaning no keybind should by default require Control. The
 * danger here is that two keybinds that only differ by whether Control is held or not will, when control is required
 * to activate, both be triggered by the same keybind which is surprising and unhelpful to users. However, it's
 * familiar to users as well. So ideally there should be a legacy default that does that and a brand new redesign of
 * keyboard functionality which is the actual default.
 * 
 * Avoid default keybinds that use Meta or Alt due to OS/browser interception when assigning defaults.
 * Control also has some shortcuts in use among browsers. Try to avoid those.
 */
const argFalse = { value: "false" }, argTrue = { value: "true" }, arg0 = { value: "0" }; // avoid redundance
export const builtInCommands = {
    [CommandTargetName.PlayOrPause]: simple(CommandTargetName.PlayOrPause, [' ']),
    [CommandTargetName.PlayAtCursor]: simple(CommandTargetName.PlayAtCursor, ['shift', ' ']),
    [CommandTargetName.ToggleRecording]: entry(CommandTargetName.ToggleRecording, [
        { keys: ['control', ' '] },
        { keys: ['control', 'p'] }]),
    [CommandTargetName.OpenSongPlayer]: simple(CommandTargetName.OpenSongPlayer, ['shift', 'p']),
    [CommandTargetName.NewSong]: simple(CommandTargetName.NewSong, ['shift', '~']),
    [CommandTargetName.SongRecovery]: simple(CommandTargetName.SongRecovery, ['`']),
    [CommandTargetName.Undo]: entry(CommandTargetName.Undo, [
        { keys: ['z'], repeat: true },
        { keys: ['control', 'z'], repeat: true }]),
    [CommandTargetName.Redo]: entry(CommandTargetName.Redo, [
        { keys: ['y'], repeat: true },
        { keys: ['control', 'y'], repeat: true },
        { keys: ['shift', 'z'], repeat: true }]),
    [CommandTargetName.ResetBoxSelection]: simple(CommandTargetName.ResetBoxSelection, ['escape']),
    [CommandTargetName.CutPattern]: entry(CommandTargetName.CutPattern, [
        { keys: ['x'] },
        { keys: ['control', 'x'] }]),
    [CommandTargetName.EditBeatsPerBar]: simple(CommandTargetName.EditBeatsPerBar, ['shift', 'b']),
    [CommandTargetName.Jummbify]: simple(CommandTargetName.Jummbify, ['control', 'shift', 'alt', 'j']),
    [CommandTargetName.LoopPattern]: simple(CommandTargetName.LoopPattern, ['b']),
    [CommandTargetName.CopyInstrument]: entry(CommandTargetName.CopyInstrument, [
        { keys: ['shift', 'c'] }]),
    [CommandTargetName.CopyPattern]: entry(CommandTargetName.CopyPattern, [
        { keys: ['c'] },
        { keys: ['control', 'c'] }]),
    [CommandTargetName.InsertBarNext]: simple(CommandTargetName.InsertBarNext, ['enter'], true),
    [CommandTargetName.InsertBarPrev]: simple(CommandTargetName.InsertBarPrev, ['shift', 'enter'], true),
    [CommandTargetName.InsertChannel]: simple(CommandTargetName.InsertChannel, ['control', 'enter'], true),
    [CommandTargetName.DeleteBar]: simple(CommandTargetName.DeleteBar, ['backspace'], true),
    [CommandTargetName.DeleteChannel]: simple(CommandTargetName.DeleteChannel, ['control', 'backspace'], true),
    [CommandTargetName.SelectAllPatterns]: entry(CommandTargetName.SelectAllPatterns, [
        { keys: ['a'] },
        { keys: ['control', 'a'] }]),
    [CommandTargetName.SelectChannel]: simple(CommandTargetName.SelectChannel, ['shift', 'a']),
    [CommandTargetName.DuplicatePattern]: simple(CommandTargetName.DuplicatePattern, ['d']),
    [CommandTargetName.EditSongEQ]: simple(CommandTargetName.EditSongEQ, ['shift', 'e']),
    [CommandTargetName.GenerateEuclideanRhythm]: simple(CommandTargetName.GenerateEuclideanRhythm, ['e']),
    [CommandTargetName.SnapPlayheadToBeginning]: simple(CommandTargetName.SnapPlayheadToBeginning, ['f']),
    [CommandTargetName.SnapPlayheadToLoopStart]: simple(CommandTargetName.SnapPlayheadToLoopStart, ['shift', 'f']),
    [CommandTargetName.SnapPlayheadToSelected]: simple(CommandTargetName.SnapPlayheadToSelected, ['h']),
    [CommandTargetName.EditLimiter]: simple(CommandTargetName.EditLimiter, ['shift', 'l']),
    [CommandTargetName.EditSongLength]: simple(CommandTargetName.EditSongLength, ['l']),
    [CommandTargetName.MuteChannel]: simple(CommandTargetName.MuteChannel, ['m']),
    [CommandTargetName.MuteAll]: simple(CommandTargetName.MuteAll, ['shift', 'm']),
    [CommandTargetName.NewPattern]: simple(CommandTargetName.NewPattern, ['n']),
    [CommandTargetName.EditNoteFilter]: simple(CommandTargetName.EditNoteFilter, ['shift', 'n']),
    [CommandTargetName.NewPatternFromEmpty]: simple(CommandTargetName.NewPatternFromEmpty, ['control', 'n']),
    [CommandTargetName.EditChannelSettings]: simple(CommandTargetName.EditChannelSettings, ['q']),
    [CommandTargetName.EditCustomSamples]: simple(CommandTargetName.EditCustomSamples, ['shift', 'q']),
    [CommandTargetName.SoloChannel]: simple(CommandTargetName.SoloChannel, ['s']),
    [CommandTargetName.Export]: simple(CommandTargetName.Export, ['control', 's']),
    [CommandTargetName.Import]: simple(CommandTargetName.Import, ['control', 'o']),
    [CommandTargetName.PastePattern]: entry(CommandTargetName.PastePattern, [
        { keys: ['v'] },
        { keys: ['control', 'v'] }]),
    [CommandTargetName.PastePatternNumbers]: simple(CommandTargetName.PastePatternNumbers, ['control', 'shift', 'v']),
    [CommandTargetName.PasteInstrument]: simple(CommandTargetName.PasteInstrument, ['shift', 'v']),
    [CommandTargetName.MoveNotesSideways]: simple(CommandTargetName.MoveNotesSideways, ['w']),
    [CommandTargetName.ExportInstrument]: simple(CommandTargetName.ExportInstrument, ['shift', 'i']),
    [CommandTargetName.RandomInstrumentPreset]: simple(CommandTargetName.RandomInstrumentPreset, ['r']),
    [CommandTargetName.RandomInstrumentGenerated]: simple(CommandTargetName.RandomInstrumentGenerated, ['shift', 'r']),
    [CommandTargetName.NextBar]: simple(CommandTargetName.NextBar, [']'], true),
    [CommandTargetName.PrevBar]: simple(CommandTargetName.PrevBar, ['['], true),
    [CommandTargetName.TransposeDown]: entry(CommandTargetName.TransposeDown, [
        { keys: ['-'], repeat: true, invokeOptions: InvokeOptions.Early },
        { keys: ['s', 'arrowdown'], repeat: true, invokeOptions: InvokeOptions.Early },
        { keys: ['s'], cursor: [CursorButtons.WheelDown], repeat: true, invokeOptions: InvokeOptions.Early }]),
    [CommandTargetName.TransposeUp]: entry(CommandTargetName.TransposeUp, [
        { keys: ['='], repeat: true, invokeOptions: InvokeOptions.Early },
        { keys: ['s', 'arrowup'], repeat: true, invokeOptions: InvokeOptions.Early },
        { keys: ['s'], cursor: [CursorButtons.WheelUp], repeat: true, invokeOptions: InvokeOptions.Early }]),
    [CommandTargetName.TransposeOctaveDown]: simple(CommandTargetName.TransposeOctaveDown, ['shift', '_'], true, true),
    [CommandTargetName.TransposeOctaveUp]: simple(CommandTargetName.TransposeOctaveUp, ['shift', '+'], true, true),
    [CommandTargetName.RemovePattern]: simple(CommandTargetName.RemovePattern, ['delete']),
    [CommandTargetName.PatternUp]: simple(CommandTargetName.PatternUp, ['arrowup'], true, true),
    [CommandTargetName.SelectionUp]: simple(CommandTargetName.SelectionUp, ['shift', 'arrowup'], true, true),
    [CommandTargetName.SetInstrument]: entry(CommandTargetName.SetInstrument, [
        ...nums.map(num => ({ keys: ['control', num], argumentData: [{ value: num }] })),
        ...nums.map(num => ({ keys: ['shift', num], argumentData: [{ value: num }] })) ]),
    [CommandTargetName.SetChannel]: entry(CommandTargetName.SetChannel,
        nums.map(o => ({ keys: [o], argumentData: [{ value: o }], invokeOptions: InvokeOptions.LastKeypress }))),
    [CommandTargetName.SetRhythm]: entry(CommandTargetName.SetRhythm,
        nums.map(o => ({ keys: ['alt', o], argumentData: [{ value: o }] }))),
    [CommandTargetName.MoveChannelUp]: simple(CommandTargetName.MoveChannelUp, ['control', 'arrowup'], true),
    [CommandTargetName.PatternDown]: simple(CommandTargetName.PatternDown, ['arrowdown'], true, true),
    [CommandTargetName.SelectionDown]: simple(CommandTargetName.SelectionDown, ['shift', 'arrowdown'], true, true),
    [CommandTargetName.MoveChannelDown]: simple(CommandTargetName.MoveChannelDown, ['control', 'arrowdown'], true),
    [CommandTargetName.MovePatternLeft]: simple(CommandTargetName.MovePatternLeft, ['arrowleft'], true, true),
    [CommandTargetName.ExtendSelectionLeft]: simple(CommandTargetName.ExtendSelectionLeft, ['shift', 'arrowleft'], true, true),
    [CommandTargetName.MovePatternRight]: simple(CommandTargetName.MovePatternRight, ['arrowright'], true, true),
    [CommandTargetName.ExtendSelectionRight]: simple(CommandTargetName.ExtendSelectionRight, ['shift', 'arrowright'], true, true),
    [CommandTargetName.SetNoteSelection]: entry(CommandTargetName.SetNoteSelection, [
        { keys: ['s', ' ', 'arrowleft'], argumentData: [{ value: "-1", metadata: "add" }, { value: "-1" }], repeat: true },
        { keys: ['s', ' ', 'arrowright'], argumentData: [{ value: "-1" }, { value: "1", metadata: "add" }], repeat: true },
        { keys: ['shift', 's', ' ', 'arrowleft'], argumentData: [{ value: "1", metadata: "add" }, { value: "-1" }], repeat: true },
        { keys: ['shift', 's', ' ', 'arrowright'], argumentData: [{ value: "-1" }, { value: "-1", metadata: "add" }], repeat: true },
        { keys: ['shift', 's', ' '], name: 'set note selection...', argumentData: [{ value: "0" }, { value: "0" }], freeformEntry: true }]),
    [CommandTargetName.InvertSelection]: entry(CommandTargetName.InvertSelection, [
        { keys: ['s', 'i'], argumentData: [argFalse]},
        { keys: ['s', 'i', 'arrowright'], name: 'invert selection right', argumentData: [argFalse]},
        { keys: ['s', 'i', 'arrowleft'], name: 'invert selection left', argumentData: [argTrue]}]),
    [CommandTargetName.SelectByFeature]: entry(CommandTargetName.SelectByFeature, [
        { keys: ['s', 'arrowleft'], name: 'select previous note', argumentData: [ { value: "bxn" }, arg0 ], repeat: true, invokeOptions: InvokeOptions.Early},
        { keys: ['s', 'arrowright'], name: 'select next note', argumentData: [ { value: "xn" }, arg0 ], repeat: true, invokeOptions: InvokeOptions.Early},
        { keys: ['shift', 's', 'arrowleft'], name: 'select previous note (expand)', argumentData: [ { value: "bn" }, arg0 ]},
        { keys: ['shift', 's', 'arrowright'], name: 'select next note (expand)', argumentData: [ { value: "n" }, arg0 ]},
        { keys: ['s', 'p', 'arrowleft'], argumentData: [ { value: "bxp" }, arg0 ]}, // TODO: not working
        { keys: ['s', 'p', 'arrowright'], argumentData: [ { value: "xp" }, arg0 ]}, // TODO: not working
        { keys: ['shift', 's', 'p', 'arrowleft'], argumentData: [ { value: "bp" }, arg0 ]}, // TODO: not working
        { keys: ['shift', 's', 'p', 'arrowright'], argumentData: [ { value: "p" }, arg0 ]}, // TODO: not working
        { keys: ['s', 'f', 'arrowleft'], argumentData: [ { value: "bnge" }, arg0 ]}, // TODO: not working
        { keys: ['s', 'f', 'arrowright'], argumentData: [ { value: "nge" }, arg0 ]},
        { keys: ['shift', 's', 'f'], name: 'select notes...', argumentData: [ { value: "ben" }, arg0 ], freeformEntry: true }]),
    [CommandTargetName.NotesMerge]: entry(CommandTargetName.NotesMerge, [
        { keys: [ 'z', 'm' ], name: 'merge adjacent notes', argumentData: [argFalse, arg0]},
        { keys: [ 'z', 'm', 'a' ], name: 'merge all notes', argumentData: [argTrue, arg0]},
        { keys: [ 'shift', 'z', 'm' ], argumentData: [argFalse, arg0], freeformEntry: true }]),
    [CommandTargetName.NotesBridge]: entry(CommandTargetName.NotesBridge, [
        { keys: ['z', 'b'], name: 'bridge notes', argumentData: [argTrue, argFalse, arg0]},
        { keys: ['shift', 'z', 'b'], name: 'bridge notes...', argumentData: [argTrue, argFalse, arg0], freeformEntry: true }]),
    [CommandTargetName.NotesSpread]: entry(CommandTargetName.NotesSpread, [
        { keys: ['z', ' '], name: 'spread notes', argumentData: [argFalse, argFalse, arg0 ]},
        { keys: ['z', ' ', 'arrowleft'], name: 'stack notes', argumentData: [argTrue, argFalse, arg0 ]},
        { keys: ['z', ' ', 'p'], name: 'sort notes on pitch', argumentData: [argFalse, argTrue, arg0 ]},
        { keys: ['shift', 'z', ' '], name: 'spread/stack/sort notes...', argumentData: [argFalse, argFalse, arg0 ], freeformEntry: true }]),
    [CommandTargetName.NotesMirror]: entry(CommandTargetName.NotesMirror, [
        { keys: ['z', 'h'], name: "mirror horizontal", argumentData: [argFalse, arg0]},
        { keys: ['z', 'v'], name: "mirror vertical", argumentData: [argTrue, arg0]},
        { keys: ['shift', 'z', 'h'], argumentData: [argFalse, arg0], freeformEntry: true }]),
    [CommandTargetName.NotesFlatten]: entry(CommandTargetName.NotesFlatten, [
        { keys: ['z', 'f'], name: 'flatten notes', argumentData: [argFalse, argFalse, arg0 ]},
        { keys: ['z', 'f', 'p'], name: 'flatten note pitch', argumentData: [argTrue, argFalse, arg0 ]},
        { keys: ['z', 'f', 'v'], name: 'flatten note volume', argumentData: [argFalse, argTrue, arg0 ]},
        { keys: ['shift', 'z', 'f'], name: 'flatten notes...', argumentData: [argFalse, argFalse, arg0 ], freeformEntry: true }]),
    [CommandTargetName.NotesSplit]: entry(CommandTargetName.NotesSplit, [
        { keys: ['z', 's'], name: 'split notes once', argumentData: [{ value: "1" }, argFalse, argFalse, arg0]},
        { keys: ['shift', 'z', 's'], name: 'split notes...', argumentData: [{ value: "1" }, argFalse, argFalse, arg0], freeformEntry: true }]),
    [CommandTargetName.NotesVolumeUp]: entry(CommandTargetName.NotesVolumeUp, [
        { keys: ['v', 'arrowup'], name: 'note volume up', argumentData: [arg0], repeat: true },
        { keys: ['v'], cursor: [CursorButtons.WheelUp], argumentData: [arg0] }]),
    [CommandTargetName.NotesVolumeDown]: entry(CommandTargetName.NotesVolumeDown, [
        { keys: ['v', 'arrowdown'], name: 'note volume down', argumentData: [arg0], repeat: true },
        { keys: ['v'], cursor: [CursorButtons.WheelDown], argumentData: [arg0] }]),
    [CommandTargetName.NotesFadeOut]: entry(CommandTargetName.NotesFadeOut, [
        { keys: ['v', 'arrowright', 'arrowdown'], name: 'note fade out', argumentData: [argFalse, arg0]},
        { keys: ['shift', 'v', 'arrowright', 'arrowdown'], name: 'note studio fade out', argumentData: [argTrue, arg0]}]),
    [CommandTargetName.NotesFadeIn]: entry(CommandTargetName.NotesFadeIn, [
        { keys: ['v', 'arrowleft', 'arrowdown'], name: 'note fade in', argumentData: [argFalse, arg0]},
        { keys: ['shift', 'v', 'arrowleft', 'arrowdown'], name: 'note studio fade in', argumentData: [argTrue, arg0]}]),
    [CommandTargetName.NotesGainIn]: entry(CommandTargetName.NotesGainIn, [
        { keys: ['v', 'arrowleft', 'arrowup'], name: 'note gain start', argumentData: [arg0]}]),
    [CommandTargetName.NotesGainOut]: entry(CommandTargetName.NotesGainOut, [
        { keys: ['v', 'arrowleft', 'arrowup'], name: 'note gain end', argumentData: [arg0]}]),
    [CommandTargetName.NotesMaxContrast]: entry(CommandTargetName.NotesMaxContrast, [
        { keys: ['v', 'c', 'arrowup'], name: 'max contrast', argumentData: [arg0] },
        { keys: ['v', 'c'], cursor: [CursorButtons.WheelUp], argumentData: [arg0] }]),
    [CommandTargetName.RunNoteFunction]: entry(CommandTargetName.RunNoteFunction, [
        { keys: ['z', 'r'], name: 'note function...', argumentData: [{ value: "" }, arg0], freeformEntry: true },
        { keys: ['shift', 'v', 'arrowup'], name: 'note volume up 1',  argumentData: [{ value: "Raise by 1" }, arg0], repeat: true },
        { keys: ['shift', 'v'], cursor: [CursorButtons.WheelUp], argumentData: [{ value: "Raise by 1" }, arg0]},
        { keys: ['shift', 'v', 'arrowdown'], name: 'note volume down 1',  argumentData: [{ value: "Lower by 1" }, arg0], repeat: true },
        { keys: ['shift', 'v'], cursor: [CursorButtons.WheelDown], argumentData: [{ value: "Lower by 1" }, arg0]},
        { keys: ['shift', 'v', 'c', 'arrowup'], name: 'double contrast', argumentData: [{ value: "Double contrast" }, arg0]},
        { keys: ['shift', 'v', 'c'], cursor: [CursorButtons.WheelUp], argumentData: [{ value: "Double contrast" }, arg0]},
        { keys: ['shift', 'v', 'c', 'arrowdown'], name: 'halve contrast', argumentData: [{ value: "Halve contrast" }, arg0]},
        { keys: ['shift', 'v', 'c'], cursor: [CursorButtons.WheelDown], argumentData: [{ value: "Halve contrast" }, arg0]},
        { keys: ['z', ' ', 'v'], name: 'volume stagger', argumentData: [{ value: "Stagger volume" }, arg0], repeat: true },
        { keys: ['z', ' ', 'n'], name: 'naturalize note positions', argumentData: [{ value: "Naturalize note positions" }, arg0], repeat: true },
        { keys: ['shift', 'z', ' ', 'n'], name: 'shift notes', argumentData: [{ value: "Shift notes" }, arg0], repeat: true },
        { keys: ['z', ' ', 'b'], name: 'volume random bends', argumentData: [{ value: "Random bends" }, arg0], repeat: true }]),
    [CommandTargetName.RunCommand]: simple(CommandTargetName.RunCommand, ['/']),
    [CommandTargetName.RepeatLastCommand]: simple(CommandTargetName.RepeatLastCommand, ['shift', '?'])
};
//#endregion

//#region Shortcuts
/**
 * Mouse/touch indications. Same as MouseEvent.button except wheel events, which are negative numbers to future-proof
 * against browsers listing more buttons in the future. These are prefixed with "m" like "m3" for shortcuts.
 */
export const enum CursorButtons {
    WheelDown = -2,
    WheelUp = -1,
    LeftButton = 0,
    RightButton = 1,
    MiddleButton = 2,
    BrowserBack = 3,
    BrowserForward = 4
}

/**
 * Affects processing. Early forces early invocation (command is repeat-capable and fires on keypress).
 * Last keypress matches only the most recent key pressed regardless of what's held, which is easier to use
 * for keys the user might overlap with held keys while typing e.g. numbers.
 */
export const enum InvokeOptions {
    Early = 0,
    LastKeypress = 1
}

/**
 * A shortcut represented by any number of keyboard/mouse interactions, where all must be pressed to invoke.
 * Keys are toLowerCase() strings from a keydown event's .key property. Modifier keys (Control, Shift, Alt) are included.
 * Shortcuts can also define the arguments to a command via action data.
*/
export interface IShortcut {
    /** Lowercased keys, or names of nonprintable keys as returned by KeyboardEvent.key, including modifiers. */
    keys: string[]

    /** Cursor buttons, like left/right click as returned by MouseEvent.button. */
    cursor?: CursorButtons[]

    /** Optional action data to pass to the command, specific to this shortcut.  */
    argumentData?: CommandArgument[]

    /**
     * False by default. When true, after this shortcut matches, the user is given an opportunity to freely type data,
     * pressing escape to cancel, enter to confirm, backspace to revert last keypress, and this data becomes the action
     * data, taking precedence over both command and shortcut-specific action data.
     */
    freeformEntry?: boolean

    /** Options to force early invocation or other modes. */
    invokeOptions?: InvokeOptions

    /** False by default. If early-invoked, allows repeat execution while inputs are held. */
    repeat?: boolean

    /** Names for shortcuts are optional, but required to appear in the command palette. */
    name?: string
}

/** For the freeform callback. Preview fires every time the freeform input changes. */
export const enum FreeformEventType { Started, Canceled, NextArg, NextArgBlocked, Submit, SubmitBlocked, Preview }

/** For simplicity, input handling is exposed from here. */
type subscriber = (command: Command, actionData: CommandArgument[] | undefined) => void
export class ShortcutHandler {
    public static readonly defaultEasyPianoEscapes = ["/", "?"]; // lowercase, can be multiple keys 
    public static readonly defaultEasyPianoPerform = ["capslock"]; // lowercase, can be multiple keys
    private readonly _subscribers: subscriber[] = [];
    private readonly _commandContexts: CommandContext[] = []; // List of active contexts, set by SongEditor.
    public readonly heldInputs: { cursor: CursorButtons[], keys: string[] } = { cursor: [], keys: [] }; // All actively-held inputs.
    private _earlyCommands: { [key: string]: [Command, IShortcut][] } = {}; // Commands that can invoke early (key press)
    private _lateCommands: { [key: string]: [Command, IShortcut][] } = {}; // Commands that only invoke late (key release)
    private _onkeyCommands: { [key: string]: [Command, IShortcut][] } = {}; // Commands that fire based on last keypress.
    private _commandHasFired = false; // If a command fires in early invocation, this prevents it from firing again in late invocation (input release).
    private _commandAllowLateFire = true; // After late invocation, prevents commands from firing on every key released
    private _freeform: { cmd: Command, defaultData: CommandArgument[], argInputs: CommandArgument[], numericType?: string } | undefined; // Tracks all relevant data in freeform input mode.

    public easyPianoEscape = ShortcutHandler.defaultEasyPianoEscapes; // hold to fire shortcuts (in easy notes)
    public easyPianoPerform = ShortcutHandler.defaultEasyPianoPerform; // hold to play notes (in easy shortcuts)

    /** Assembles available commands, sets the callback when invoked. It's up to the consumer to handle behavior. */
    constructor(builtInEditsByID: BuiltInLookup, customCommands: Command[], listener: subscriber) {
        this.setCommands(builtInEditsByID, customCommands);
        this._subscribers.push(listener);
    }

    /** Adds a callback for shortcut handling (if new). All callbacks are invoked in order on command invocation. */
    public subscribe(listener: (command: Command, actionData: CommandArgument[] | undefined) => void) {
        if (!this._subscribers.includes(listener)) {
            this._subscribers.push(listener);
        }
    }

    /** Removes a subscribed callback to command invocation if present. */
    public unsubscribe(listener: any) {
        const index = this._subscribers.indexOf(listener);
        if (index !== -1) {
            this._subscribers.splice(index, 1);
        }
    }

    /**
     * Tracks all commands available to be matched by the shortcut editor from a custom list and dictionary of
     * replacements to built-in commands.
    */
    public setCommands(builtInEditsByID: BuiltInLookup, customCommands: Command[]) {
        this.forgetInputStates();

        // Use the edited built-in if it exists, else the unedited one
        // For nulls or if a command target has no entry in built-ins, array will be unassigned at index gaps
        const builtins: Command[] = [];
        Object.entries(builtInCommands).forEach(entry => {
            const key = entry[0] as unknown as keyof typeof builtInCommands;
            if (builtInEditsByID[key] !== null) {
                builtins[key] = builtInEditsByID[key] === undefined
                    ? entry[1] : builtInEditsByID[key] as Command;
            }
        });

        // Sorts all shortcuts of all commands by their hashed set of inputs, i.e. makes them ordered sets.
        const allCommands = builtins.concat(customCommands);
        const allShortcuts: [string, Command, IShortcut, string[]][] = [];
        for (const command of allCommands) {
            if (command === undefined) { continue; } // skip unassigned index gaps
            for (const entry of command.Shortcuts) {
                const set = ShortcutHandler.toOrderedSet(entry);
                allShortcuts.push([set.join(' '), command, entry, set]);
            }
        }
        allShortcuts.sort((a, b) => a[0].localeCompare(b[0]));

        // Separates by early/late invocation into objects for O(1) access.
        this._earlyCommands = {};
        this._lateCommands = {};
        this._onkeyCommands = {};

        // Identify subsets by adding every combination (except the full set) of each shortcut's inputs as keys to an
        // object. Those are all potential subsets. Then, iterate again to sort objects into early/late invocation.
        // We're trading memory for performance here. If this is too slow a UB-tree could have better results.
        const subsets: { [key: string]: true } = {};
        for (let i = 0; i < allShortcuts.length; i++) {
            const combinationTotal = 2 ** allShortcuts[i][3].length;

            // Gets all combinations by moving around an exclusion condition.
            for (let j = 1; j < combinationTotal - 1; j++) { // -1 to skip final combination
                let combination: string[] = [];
                for (let k = 0; k < allShortcuts[i][3].length; k++) {
                    if (j & (1 << k)) {
                        combination.push(allShortcuts[i][3][k]);
                    }
                }

                // combination should match the format of toHash.
                if (combination.length > 0) {
                    subsets[combination.join(' ')] = true;
                }
            }
        }

        // Add to lists indexed by the shortcut's hash. These are buckets since many shortcuts can map to it.
        for (let i = 0; i < allShortcuts.length; i++) {
            const list = (allShortcuts[i][2].invokeOptions !== undefined || !subsets[allShortcuts[i][0]])
                ? allShortcuts[i][2].invokeOptions === InvokeOptions.LastKeypress ? this._onkeyCommands : this._earlyCommands
                : this._lateCommands;

            if (!Object.hasOwn(list, allShortcuts[i][0])) {
                list[allShortcuts[i][0]] = [[allShortcuts[i][1], allShortcuts[i][2]]];
            } else {
                list[allShortcuts[i][0]].push([allShortcuts[i][1], allShortcuts[i][2]]);
            }
        }
    }

    /** Hashes shortcut inputs to an unambiguous string for comparison or direct access. */
    public static toHash(shortcut: IShortcut) { return this.toOrderedSet(shortcut).join(' ') }

    private static toOrderedSet(shortcut: IShortcut) {
        const inputs = [...shortcut.keys];
        if (shortcut.cursor) { inputs.concat(shortcut.cursor.map(o => `m${o}`)); }

        return inputs.toSorted();
    }

    /** Adds the context if add is true, removes if false. Won't add twice. Won't error out if absent during removal. */
    public setContext(context: CommandContext, add: boolean) {
        if (add) {
            if (!this._commandContexts.includes(context)) {
                this._commandContexts.push(context);
            }
        } else {
            const index = this._commandContexts.indexOf(context);
            if (index !== -1) {
                this._commandContexts.splice(index, 1);
            }
        }
    }

    /** Returns true if set, else false. */
    public isContextSet(context: CommandContext): boolean {
        return this._commandContexts.includes(context);
    }

    /** Resetting input on blur/focus avoids stuck states. */
    public forgetInputStates = () => {
        this._commandHasFired = false;
        this._commandAllowLateFire = true;
        this._freeform = undefined;
        this.heldInputs.keys = [];
        this.heldInputs.cursor = [];
    }

    /** Forces freeform input for any command + shortcut combination (ignores shortcut's freeform request status) */
    public invokeFreeformMode = (command: Command, shortcut: IShortcut): void => {
        this.heldInputs.cursor = [];
        this.heldInputs.keys = [];

        this._freeform = {
            cmd: command,
            defaultData: shortcut.argumentData
                ?? command.ArgumentData
                ?? targets[command.Target].params.map(_ => ({ value: "" })),
            argInputs: [{ value: "" }] // always at least one entry
        };
        this.onFreeform?.(FreeformEventType.Started, this._freeform.cmd, this._freeform.argInputs);
    }

    /** On key down, handle early invocations (deferred=true). Compare all keyboard inputs as uppercase. */
    public handleKeyPressed = (event: KeyboardEvent, easyPianoKeys: boolean): void => {
        if (event.isComposing) { return; }

        this._updateModifierKeys(event);

        if (this._freeform === undefined) {
            // Push and handle shortcuts on keypress. Shortcuts also fire for other input types.
            if (!this.heldInputs.keys.includes(event.key.toLowerCase())) {
                this.heldInputs.keys.push(event.key.toLowerCase());
            }

            if (!event.repeat) { this._commandAllowLateFire = true; } // avoid unintended invokes from slow key release
            this._matchCommands(event, true, event.repeat, easyPianoKeys);
            this._commandHasFired = false;
        }

        // Handle freeform input.
        else {
            let args = this._freeform.argInputs;
            const arg = args[args.length - 1];
            let argInfo = targets[this._freeform.cmd.Target].params[args.length - 1];

            // Cancel the freeform mode and forget its command.
            if (event.key === "Escape") {
                this.onFreeform?.(FreeformEventType.Canceled, this._freeform.cmd, args);
                this._freeform = undefined;
            }

            // Delete input towards this argument, or if none, jump to previous argument. Ctrl clears a full one.
            else if (event.key === "Backspace") {
                if (event.ctrlKey || argInfo.type === CommandActionDataType.Bool) {
                    if (args.length > 1) { args.pop(); }
                    else { arg.value = ""; }
                } else if (arg.value.length > 0) {
                    arg.value = arg.value.slice(0, arg.value.length - 1);
                } else if (args.length > 1) { args.pop(); }
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // On enter or space (for non-string data), move to next argument or submit.
            // If submitted empty, tries to use any default data that exists.
            else if (event.key === "Enter" || (event.key === " " && argInfo.type !== CommandActionDataType.String)) {
                const withDefaults = {
                    value: arg.value === "" ? this._freeform.defaultData[args.length - 1].value : arg.value,
                    metadata: arg.metadata ?? this._freeform.defaultData[args.length - 1].metadata
                        ?? ((argInfo.type === CommandActionDataType.Number) ? "set" : undefined)
                };
                // Next argument
                if (args.length !== targets[this._freeform.cmd.Target].params.length) {
                    if (isArgumentValid(argInfo, withDefaults)) {
                        arg.value = withDefaults.value;
                        arg.metadata = withDefaults.metadata;
                        args.push({ value: "" });
                        this.onFreeform?.(FreeformEventType.NextArg, this._freeform.cmd, args);
                    } else {
                        this.onFreeform?.(FreeformEventType.NextArgBlocked, this._freeform.cmd, args);
                        this._freeform = undefined;
                    }
                }
                // Submission
                else if (isArgumentValid(argInfo, withDefaults)
                    && Command.ValidContext(this._freeform.cmd, this._commandContexts))
                {
                    arg.value = withDefaults.value;
                    arg.metadata = withDefaults.metadata;
                    this.onFreeform?.(FreeformEventType.Submit, this._freeform.cmd, args);
                    this._subscribers.forEach(o => o?.(this._freeform!.cmd, args));
                    this._freeform = undefined;
                } else {
                    this.onFreeform?.(FreeformEventType.SubmitBlocked, this._freeform.cmd, args);
                    this._freeform = undefined;
                }
            }

            // For strings, append printable characters (length=1) which I'd claim is a safe way to distinguish.
            else if (argInfo.type === CommandActionDataType.String && event.key.length === 1) {
                arg.value += event.key;
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // For bools, we set input rather than concat, and handle few keys.
            else if (argInfo.type === CommandActionDataType.Bool) {
                if (event.key.toLowerCase() === "t" || event.key === "1") { arg.value = "true"; }
                else if (event.key.toLowerCase() === "f" || event.key === "0") { arg.value = "false"; }
                else if (event.key === "!") { arg.value = "toggle"; }
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // For numbers, handles 0-9.,=+-*/ flips sign for - and changes mode via =+*/ for compatible sets.
            else if (argInfo.type === CommandActionDataType.Number) {
                let numericNewType: string | undefined;
                if (event.key === "-") { arg.value = arg.value.startsWith("-") ? arg.value.slice(1) : `-${arg.value}`; }
                else if (event.key === "+") { numericNewType = "add"; }
                else if (event.key === "=") { numericNewType = "set"; }
                else if (event.key === "*") { numericNewType = "mul"; }
                else if (event.key === "/") { numericNewType = "div"; }
                else if (event.key.length === 1 && event.key.charCodeAt(0) > 47 && event.key.charCodeAt(0) < 58) { arg.value += event.key; } // 0-9
                else if (!(argInfo as ParamNum).isInt && (event.key === '.' || event.key === ',')) { arg.value += "."; }

                if (numericNewType) {
                    arg.metadata ??= "set";
                    arg.metadata = arg.metadata.replace(/(add|set|mul|div)$/, numericNewType)
                        .replace(/random-list-(add|set|mul|div)$/, numericNewType)
                        .replace(/random-(add|set|mul|div)$/, numericNewType);

                    if (numericNewType === "add") {
                        arg.metadata = arg.metadata.replace(/cycle$/, "cycle-add").replace(/cycle\-\-stop$/, "cycle-add-stop");
                    } else if (numericNewType === "set") {
                        arg.metadata = arg.metadata.replace(/cycle\-add$/, "cycle").replace(/cycle\-add\-stop$/, "cycle--stop");
                    }
                }
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }
        }
    }

    /** On key release, first fire late invocation (deferred=false), then remove inputs. */
    public handleKeyReleased = (event: KeyboardEvent, easyPianoKeys: boolean): void => {
        if (event.isComposing) { return; }
        this._updateModifierKeys(event);
        if (this._freeform !== undefined) { return; }
        if (!this._commandHasFired && this._commandAllowLateFire) {
            this._matchCommands(event, false, event.repeat, easyPianoKeys);
        }

        const index = this.heldInputs.keys.indexOf(event.key.toLowerCase());
        if (index !== -1) { this.heldInputs.keys.splice(index, 1); }
        this._commandHasFired = false;
    }

    /** On mouse button press, fire early invocation (deferred=true). */
    public handleCursorDown = (event: MouseEvent, easyPianoKeys: boolean) => {
        if (this._freeform !== undefined) { return; }
        if (!this.heldInputs.cursor.includes(event.button)) {
            this.heldInputs.cursor.push(event.button);

            this._commandAllowLateFire = true;
            this._matchCommands(event, true, false, easyPianoKeys);
            this._commandHasFired = false;
        }
    }

    /** On mouse button release, fire late invocation (deferred=false). */
    public handleCursorUp = (event: MouseEvent, easyPianoKeys: boolean) => {
        if (this._freeform !== undefined) { return; }
        if (!this._commandHasFired && this._commandAllowLateFire) {
            this._matchCommands(event, false, false, easyPianoKeys);
        }

        const index = this.heldInputs.cursor.indexOf(event.button);
        if (index !== -1) { this.heldInputs.cursor.splice(index, 1); }
        this._commandHasFired = false;
    }

    /**
     * On vertical mouse wheel movements, fire as late invocation (deferred=false) since wheel actions can't hold state
     * so they're immediate. Doesn't track amount of motion i.e. delta
     */
    public handleWheel = (event: WheelEvent, easyPianoKeys: boolean) => {
        if (this._freeform !== undefined) { return; }
        if (event.deltaY !== 0) {
            this.heldInputs.cursor.push(event.deltaY > 0 ? CursorButtons.WheelDown : CursorButtons.WheelUp);
            this._matchCommands(event, false, false, easyPianoKeys);
            this.heldInputs.cursor.pop();
        }
    }

    /** If set, this is called on cancelation, submission, or preview (input updates) of freeform input. */
    public onFreeform?: (event: FreeformEventType, command: Command, argInputs: CommandArgument[]) => void;

    /** Modifiers often get stuck due to focus shifting. If a discrepancy to the browser exists, clear all. */
    private _updateModifierKeys(event: KeyboardEvent | WheelEvent | MouseEvent) {
        if ((!event.metaKey && this.heldInputs.keys.indexOf("meta") !== -1) ||
            (!event.ctrlKey && this.heldInputs.keys.indexOf("control") !== -1) ||
            (!event.altKey && this.heldInputs.keys.indexOf("alt") !== -1) ||
            (!event.shiftKey && this.heldInputs.keys.indexOf("shift") !== -1))
        {
            this.heldInputs.keys = [];
            this.heldInputs.cursor = [];
        }

        // Contextmenu is not a key with a held state, it should not persist.
        if ((event as KeyboardEvent).key !== 'ContextMenu') {
            const menuIndex = this.heldInputs.keys.indexOf('contextmenu');
            if (menuIndex !== -1) { this.heldInputs.keys.splice(menuIndex, 1); }
        }

        const index = this.heldInputs.keys.indexOf("capslock");
        if (event.getModifierState("CapsLock") && index === -1) {
            this.heldInputs.keys.push("capslock");
        }
        if (!event.getModifierState("CapsLock") && index !== -1) {
            this.heldInputs.keys.splice(index, 1);
        }
    }

    /**
     * Checks the given commands list to see if it contains the input. Returns true if a command was invoked, or false
     * if none was invoked, or an array of the narrowed command list (for incremental search).
     * 
     * Here is how the full system works:
     * 
     * We want to invoke commands on input down, if possible ("early invocation"), else on input release ("late
     * invocation"). For early invocation, we can only fire a shortcut if there are no candidate commands with an input
     * sequence that's a superset of the held inputs. This is because we don't want to fire a shortcut on pressing "A"
     * if there's a shortcut for pressing "Ctrl + A", since we don't know what the user wants yet. In this case, set
     * deferFiring to true. for late invocation, deferFiring should be false, and we will fire a shortcut based on the
     * current inputs, which should include the input that was just released.
     * 
     * In both early and late invocation, if a command is fired, we clear the recorded inputs list.
     */
    private _matchCommands(event: Event, deferFiring: boolean, isRepeating: boolean, easyPianoKeys: boolean): void
    {
        let requestingFreeform: [Command, IShortcut] | undefined; 
        let shortcutMap = deferFiring ? this._earlyCommands : this._lateCommands;
        let matchedShortcuts = shortcutMap[ShortcutHandler.toHash(this.heldInputs)] ?? [];

        // Late-invoke shortcuts will be eligible to fire if held long enough to repeat.
        if (matchedShortcuts.length === 0 && deferFiring && isRepeating) {
            shortcutMap = this._lateCommands;
            matchedShortcuts = shortcutMap[ShortcutHandler.toHash(this.heldInputs)] ?? [];
        }

        const matchGroups = [matchedShortcuts];

        // When the easy shortcuts key is *always* held, we need to include commands where it's not held down
        if (easyPianoKeys && this._commandContexts.includes(CommandContext.Recording)) {
            matchGroups.push(shortcutMap[ShortcutHandler.toHash({
                keys: this.heldInputs.keys.filter((o => !this.easyPianoEscape.includes(o))),
                cursor: this.heldInputs.cursor }
            )] ?? []);
        }

        // Shortcuts for the very last keypress input from the onkey commands. Only if no other command fires.
        let lastkeysGroup: [Command, IShortcut][] | undefined;
        if (deferFiring && this.heldInputs.keys.length > 0) {
            lastkeysGroup = this._onkeyCommands[this.heldInputs.keys[this.heldInputs.keys.length - 1]];
            if (lastkeysGroup !== undefined) {
                matchGroups.push(lastkeysGroup);
            }
        }

        for (const group of matchGroups) {
            if (group === lastkeysGroup && this._commandHasFired) { continue; }
            for (const entry of group) {
                if (Command.ValidContext(entry[0], this._commandContexts)) {
                    // Set freeform to the first that requests it, dropping others, and invoke the rest.
                    if (entry[1].freeformEntry && targets[entry[0].Target].params.length > 0) {
                        requestingFreeform ??= entry;
                    } else if (!isRepeating || entry[1].repeat) {
                        this._subscribers.forEach(o => o?.(entry[0], entry[1].argumentData ?? entry[0].ArgumentData));
                    }

                    this._commandHasFired = true;
                    this._commandAllowLateFire = false;
                    event.preventDefault();
                }
            }
        }

        // Handle freeform request.
        if (requestingFreeform !== undefined) {
            this.invokeFreeformMode(requestingFreeform[0], requestingFreeform[1]);
        }
    }
}

/**
 * Returns a user-legible string like "Ctrl﹢A﹢Wheel up" for the key sequence of a shortcut.
 * "menu" format optimizes space by shortening the string where possible.
 * "html" format wraps key names in kbd tags and all of it in a span for the sake of CSS.
 */
export function ShowCut(shortcut: IShortcut, formatFor?: 'menu'|'html'): string | HTMLSpanElement
{
    const asHTML = formatFor === 'html';
    const asMenu = formatFor === 'menu';
    const keys = [...shortcut.keys];
    const keysList: string[] = [];

    // Start with modifier keys, then other keyboard keys, then mouse inputs.
    ["meta", "control", "shift", "alt", "compose"].forEach(modifierKey => {
        const index = keys.indexOf(modifierKey);
        if (index !== -1) {
            keysList.push(
                (asMenu && modifierKey === "control") ? "Ctrl" :
                (asMenu && modifierKey === "shift") ? "⇧" :
                modifierKey[0].toUpperCase() + modifierKey.slice(1));
            keys.splice(index, 1);
        }
    });

    for (const key of keys) {
        if (key === " ") { keysList.push("Space"); }
        else if (asMenu && key === "backspace") { keysList.push("⌫"); }
        else if (asMenu && key === "enter") { keysList.push("⏎"); }
        else if (key === "arrowup") { keysList.push(asMenu ? "↑" : "Up"); }
        else if (key === "arrowleft") { keysList.push(asMenu ? "←" : "Left"); }
        else if (key === "arrowdown") { keysList.push(asMenu ? "↓" : "Down"); }
        else if (key === "arrowright") { keysList.push(asMenu ? "→" : "Right"); }
        else if (key.length === 1) { keysList.push(key.toUpperCase()); }
        else if (key.length > 0) { keysList.push(key[0].toUpperCase() + key.slice(1)); }
    }

    if (shortcut.cursor) {
        for (const button of shortcut.cursor) {
            switch (button) {
                case CursorButtons.LeftButton: keysList.push(asMenu ? "Click" : "Left-click"); break;
                case CursorButtons.RightButton: keysList.push(asMenu ? "RMB" : "Right-click"); break;
                case CursorButtons.MiddleButton: keysList.push(asMenu ? "MMB" : "Middle-click"); break;
                case CursorButtons.BrowserBack: keysList.push("Mouse 4"); break;
                case CursorButtons.BrowserForward: keysList.push("Mouse 5"); break;
                case CursorButtons.WheelDown: keysList.push("Wheel down"); break;
                case CursorButtons.WheelUp: keysList.push("Wheel up"); break;
                default: (button satisfies never)
            }
        }
    }

    if (keysList.length === 0) { return asHTML ? span() : ""; }

    return asHTML
        ? span(keysList.flatMap(key => [kbd(key), span(" ")]).slice(0, -1))
        : asMenu
            ? keysList.join("﹢").replaceAll("⇧﹢", "⇧").replaceAll("⇧Alt", "Shift﹢Alt")
            : keysList.join("﹢");
}

/** Displays multiple shortcuts with separators. Menu format uses just the shortest shortcut instead. */
export function ShowCuts(shortcuts: IShortcut[], formatFor?: 'menu'|'html', bound?: boolean): string | HTMLSpanElement {
    let result: string | HTMLSpanElement;
    const asHTML = formatFor === 'html';

    if (shortcuts.length === 0) { return asHTML ? span() : ""; }
    if (formatFor === 'menu') {
        result = ShowCut(shortcuts.toSorted((a, b) => a.keys.length - b.keys.length)[0], formatFor);
    } else {
        result = asHTML
            ? span(shortcuts.flatMap(o => [ShowCut(o, formatFor), "｜"]).slice(0, -1))
            : shortcuts.map(o => ShowCut(o, formatFor)).join("｜")
    }

    return bound
        ? asHTML ? span('(', result, ')') : `(${result})`
        : result;
}

/** Convenience shorthand to display shortcut(s) of a built-in command (with possible edits) if bound. */
export function Cut(doc: SongDocument, targets: (keyof typeof builtInCommands)[], formatFor?: 'menu'|'html', bound: boolean = true) {
    const result = formatFor === 'html'
        ? span(targets.flatMap(
            o => [ShowCuts(doc.prefs.builtInEditsByID[o]?.Shortcuts ?? builtInCommands[o].Shortcuts, formatFor), " or "]).slice(0, -1))
        : targets.map(
            o => ShowCuts(doc.prefs.builtInEditsByID[o]?.Shortcuts ?? builtInCommands[o].Shortcuts, formatFor)).join(" or ");

    return bound && formatFor === 'html' ? span('(', result, ')') : bound ? `(${result})` : result;
}
//#endregion