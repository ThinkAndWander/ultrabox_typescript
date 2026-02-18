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
 * out of a potentially narrowed list (incremental search, for performance) of all commands. As inputs are pressed,
 * commands are evaluated for early invocation and again as inputs are released, for late invocation. These modes are
 * the same except that early invocation will not fire commands when ambiguous, e.g. [A] is held, there is a command
 * matching [A] but also one matching [A + B]. The idea is that a user might be typing [A + B] and it doesn't become
 * clear they only want to invoke [A] until they start releasing inputs. As such, late invocation occurs BEFORE the key
 * is released, or nothing would happen. The order of current held inputs / inputs in shortcut entries are irrelevant.
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
 * - you cannot specify commands based on up or down state or control deferred state, because it was decided that it's
 *     better to abstract this out of the user's hands. Allowing it would complicate scenarios for no special reason.
 * - you cannot hold inputs to repeat-invoke a command that defers (late invocation).
 * - default shortcuts should not rely on Alt or other keybinds that major browsers like to use. The end user can be
 * expected to avoid their own browser's shortcuts when they set custom ones, so this applies only to defaults. Usually
 * we don't use modifier keys, and we need to also avoid `~ because it's treated as an escape to access shortcuts
 * when in keyboard performance mode (using the keyboard like a piano). This used to be control, but then you can't use
 * control for shortcuts which is kind of silly.
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
    Undo = 66
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

interface Param { type: CommandActionDataType }
interface ParamNum extends Param { type: CommandActionDataType.Number, isInt: boolean }

function isArgumentValid(param: Param, data: CommandArgument): boolean {
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
export function actionDataAsNumber(actiondata: CommandArgument, origValue: number, minValue: number, maxValue: number): number {
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
                numbers.push(clamp(num, minValue, maxValue));
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
        if (metadata === "random-list-set") { return clamp(pickedNumber, minValue, maxValue); }
        if (metadata === "random-list-add") { return clamp(origValue + pickedNumber, minValue, maxValue); }
        if (metadata === "random-list-sub") { return clamp(origValue - pickedNumber, minValue, maxValue); }
        if (metadata === "random-list-mul") { return clamp(origValue * pickedNumber, minValue, maxValue); }
        if (metadata === "random-list-div") { return clamp(origValue / pickedNumber, minValue, maxValue); }
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
        if (metadata === "random-set") { return clamp(randomNumber, minValue, maxValue); }
        if (metadata === "random-add") { return clamp(origValue + randomNumber, minValue, maxValue); }
        if (metadata === "random-sub") { return clamp(origValue - randomNumber, minValue, maxValue); }
        if (metadata === "random-mul") { return clamp(origValue * randomNumber, minValue, maxValue); }
        if (metadata === "random-div") { return clamp(randomNumber === 0 ? maxValue : origValue / randomNumber, minValue, maxValue); }
        return origValue;
    }

    /**
     * Valid syntaxes: set, add, sub, mul, div, add-wrap, sub-wrap. Performs simple arithmetic on one value,
     * where add-wrap and sub-wrap are add/sub that wraps around the range.
    */
    let value = +data;
    if (!Number.isFinite(value) || Number.isNaN(value)) { return origValue; }
    if (metadata === "set") { return clamp(value, minValue, maxValue); }
    if (metadata === "add") { return clamp(origValue + value, minValue, maxValue); }
    if (metadata === "sub") { return clamp(origValue - value, minValue, maxValue); }
    if (metadata === "mul") { return clamp(origValue * value, minValue, maxValue); }
    if (metadata === "div") { return clamp(value === 0 ? maxValue : origValue / value, minValue, maxValue); }
    if (metadata === "add-wrap" || metadata === "sub-wrap") {
        let val = metadata === "add-wrap" ? origValue + value : origValue - value;
        while (val < minValue) { val += maxValue + (1 - minValue); }
        while (val > maxValue) { val -= maxValue + (1 - minValue); }
        return clamp(val, minValue, maxValue);
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
    /**
     * Only built-in commands can set this value. When set, this is a positive unique integer per-command. This is
     * used to identify which built-in commands a user has disabled.
     */
    public BuiltInId: number | undefined

    /** Only built-in commands can set this value. When true, the command palette will omit this command. */
    public HideInPalette: boolean | undefined

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
     * Custom commands are versioned for backwards compatibility. The current version is set a constant maintained
     * by the custom shortcut editor.
     */
    public Version?: number

    public constructor(
        name: string,
        target: CommandTargetName,
        context: string,
        shortcuts: IShortcut[],
        argumentData?: CommandArgument[],
        version?: number,
        builtInId?: number)
    {
        this.Name = name;
        this.Target = target;
        this.Context = context;
        this.Shortcuts = shortcuts;
        this.ArgumentData = argumentData;
        this.Version = version;
        this.BuiltInId = builtInId;
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

        return (allShortcutsHaveArgsOrFreeform || this.ArgumentData !== undefined);
    }

    /** Returns a user-legible string like "Ctrl + A + Wheel up" describing the key sequence for a shortcut. */
    public static DisplayShortcut(shortcut: IShortcut): string
    {
        const keysList: string[] = [];

        // Start with modifier keys, then other keyboard keys, then mouse inputs.
        ["meta", "control", "shift", "alt", "compose"].forEach(modifierKey => {
            const index = shortcut.keys.indexOf(modifierKey);
            if (index !== -1) {
                keysList.push(modifierKey);
                shortcut.keys.splice(index, 1);
            }
        });

        for (const key of shortcut.keys) {
            if (key === " ") { keysList.push("Space"); }
            else if (key === "ArrowUp") { keysList.push("Up"); }
            else if (key === "ArrowLeft") { keysList.push("Left"); }
            else if (key === "ArrowDown") { keysList.push("Down"); }
            else if (key === "ArrowRight") { keysList.push("Right"); }
            else if (key.length === 1) { keysList.push(key.toUpperCase()); }
            else if (key.length > 0) { keysList.push(key); }
        }

        for (const button of shortcut.cursor) {
            switch (button) {
                case CursorButtons.LeftButton: keysList.push("Left-click"); break;
                case CursorButtons.RightButton: keysList.push("Right-click"); break;
                case CursorButtons.MiddleButton: keysList.push("Middle-click"); break;
                case CursorButtons.BrowserBack: keysList.push("Mouse 4"); break;
                case CursorButtons.BrowserForward: keysList.push("Mouse 5"); break;
                case CursorButtons.WheelDown: keysList.push("Wheel down"); break;
                case CursorButtons.WheelUp: keysList.push("Wheel up"); break;
                default: (button satisfies never)
            }
        }

        return keysList.join(" ＋ ");
    }

    /**
     * Returns true for empty contexts or if every number sequence in the command's context matches an enum value in
     * active contexts, or is absent if the number sequence starts with a ! symbol. Example: "4 !3 1 42 !5"
     */
    public static ValidContext(command: Command, activeContexts: CommandContext[]): boolean {
        return (command.Context === "") || (command.Context.match(/!?[0-9]*/g)?.some(
            str => (str[0] === '!') !== activeContexts.includes(+str)) ?? false);
    }

    public static ToJSON(cmd: Command): string {
        return JSON.stringify({
            N: cmd.Name,
            T: cmd.Target,
            ...(cmd.Context !== "" && { C: cmd.Context }),
            S: cmd.Shortcuts.map(o => ({ ...o, keys: o.keys.map(k => k.toLowerCase()) })),
            ...(cmd.ArgumentData && cmd.ArgumentData.length > 0 && { D: cmd.ArgumentData }),
            V: cmd.Version ?? commandSyntaxVersion // Version cleared during load.
        } satisfies CommandJSON);
    }

    public static FromJSON(json: string): Command[] {
        const entries = (JSON.parse(json) as CommandJSON[]).map(entry => new Command(
            entry.N ?? "",
            entry.T ?? CommandTargetName.None,
            entry.C ?? "",
            entry.S ?? [],
            entry.D ?? [],
            entry.V))
            .filter(o => o.ValidArguments()); // Don't rehydrate bad arguments
        entries.forEach(o => /* Migrate old versions here */ o.Version = undefined);
        return entries;
    }
}

/** The metadata of all possible targets. Names here are for actions, but argument-less commands often reuse them. */
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
    [CommandTargetName.SetInstrument]: { name: 'Set instrument #', params: [{ type: CommandActionDataType.Number, isInt: true }] },
    [CommandTargetName.SetChannel]: { name: 'Set channel', params: [{ type: CommandActionDataType.Number, isInt: true }] },
    [CommandTargetName.SetRhythm]: { name: 'Set rhythm', params: [{ type: CommandActionDataType.Number, isInt: true }] },
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
    [CommandTargetName.Undo]: { name: 'Undo', params: [] }
};

// Just to keep below neat
const nums = ['0','1','2','3','4','5','6','7','8','9'];
const one = (target: CommandTargetName, keys: string[]) => {
    return new Command(targets[target].name, target, "", [{ keys, cursor: [] }], undefined, undefined, target);
}
const many = (target: CommandTargetName, context: string, shortcuts: IShortcut[], args?: CommandArgument[]) => {
    return new Command(targets[target].name, target, context, shortcuts, args, undefined, target);
}

/**
 * The built-in commands list, most borrow the display name of their target as most aren't parameterized, so this is
 * mainly for the default shortcuts. Note that Control is used by keyboard performance (playing it as a piano) which
 * uses either caps lock state or control to activate keys. Meaning no keybind should by default require Control. The
 * danger here is that two keybinds that only differ by whether Control is held or not will, when control is required
 * to activate, both be triggered by the same keybind which is surprising and unhelpful to users. However, it's familiar
 * to users as well. So ideally there should be a legacy default that does that and a brand new redesign of keyboard
 * functionality which is the actual default.
 * 
 * Shift is the only modifier key recommended for bindings. Control is used in key piano mode and sometimes intercepted
 * by the browser, like meta/alt. The shortcut handler prevents binding modifiers by themself.
*/
export const builtInCommands: Command[] = [
    one(CommandTargetName.PlayOrPause, [' ']),
    one(CommandTargetName.PlayAtCursor, ['shift', ' ']),
    many(CommandTargetName.ToggleRecording, "", [
        { keys: ['control', ' '], cursor: [] },
        { keys: ['control', 'p'], cursor: [] }]),
    one(CommandTargetName.OpenSongPlayer, ['shift', 'p']),
    one(CommandTargetName.NewSong, ['shift', '~']),
    one(CommandTargetName.SongRecovery, ['shift', '~']), // Intentionally same as NewSong
    many(CommandTargetName.Undo, "", [
        { keys: ['z'], cursor: [] },
        { keys: ['control', 'z'], cursor: [] }]),
    many(CommandTargetName.Redo, "", [
        { keys: ['y'], cursor: [] },
        { keys: ['shift', 'z'], cursor: [] }]),
    one(CommandTargetName.ResetBoxSelection, ['escape']),
    one(CommandTargetName.CutPattern, ['x']),
    one(CommandTargetName.EditBeatsPerBar, ['shift', 'b']),
    one(CommandTargetName.LoopPattern, ['b']),
    one(CommandTargetName.CopyInstrument, ['shift', 'c']),
    one(CommandTargetName.CopyPattern, ['c']),
    one(CommandTargetName.InsertBarNext, ['enter']),
    one(CommandTargetName.InsertBarPrev, ['shift', 'enter']),
    one(CommandTargetName.InsertChannel, ['control', 'enter']),
    one(CommandTargetName.DeleteBar, ['backspace']),
    one(CommandTargetName.DeleteChannel, ['control', 'backspace']),
    one(CommandTargetName.SelectAllPatterns, ['a']),
    one(CommandTargetName.SelectChannel, ['shift', 'a']),
    one(CommandTargetName.DuplicatePattern, ['d']),
    one(CommandTargetName.EditSongEQ, ['e']),
    one(CommandTargetName.GenerateEuclideanRhythm, ['shift', 'e']),
    one(CommandTargetName.SnapPlayheadToBeginning, ['f']),
    one(CommandTargetName.SnapPlayheadToLoopStart, ['shift', 'f']),
    one(CommandTargetName.SnapPlayheadToSelected, ['h']),
    one(CommandTargetName.EditLimiter, ['shift', 'l']),
    one(CommandTargetName.EditSongLength, ['l']),
    one(CommandTargetName.MuteChannel, ['m']),
    one(CommandTargetName.MuteAll, ['shift', 'm']),
    one(CommandTargetName.NewPattern, ['n']),
    one(CommandTargetName.EditNoteFilter, ['shift', 'n']),
    one(CommandTargetName.NewPatternFromEmpty, ['control', 'n']),
    one(CommandTargetName.EditChannelSettings, ['q']),
    one(CommandTargetName.EditCustomSamples, ['shift', 'q']),
    one(CommandTargetName.SoloChannel, ['s']),
    one(CommandTargetName.Export, ['shift', 's']),
    one(CommandTargetName.Import, ['shift', 'o']),
    one(CommandTargetName.PastePattern, ['v']),
    one(CommandTargetName.PasteInstrument, ['shift', 'v']),
    one(CommandTargetName.MoveNotesSideways, ['w']),
    one(CommandTargetName.ExportInstrument, ['shift', 'i']),
    one(CommandTargetName.RandomInstrumentPreset, ['r']),
    one(CommandTargetName.RandomInstrumentGenerated, ['shift', 'r']),
    one(CommandTargetName.NextBar, [']']),
    one(CommandTargetName.PrevBar, ['[']),
    one(CommandTargetName.TransposeDown, ['-']),
    one(CommandTargetName.TransposeUp, ['=']),
    one(CommandTargetName.TransposeOctaveDown, ['shift', '_']),
    one(CommandTargetName.TransposeOctaveUp, ['shift', '+']),
    one(CommandTargetName.RemovePattern, ['delete']),
    one(CommandTargetName.PatternUp, ['arrowup']),
    one(CommandTargetName.SelectionUp, ['shift', 'arrowup']),
    many(CommandTargetName.SetInstrument, "", [
        ...nums.map(num => ({ keys: ['control', num], cursor: [], argumentData: [{ value: num }] })),
        ...nums.map(num => ({ keys: ['shift', num], cursor: [], argumentData: [{ value: num }] })) ]),
    many(CommandTargetName.SetChannel, "", nums.map(o => ({ keys: [o], cursor: [], argumentData: [{ value: o }] }))),
    many(CommandTargetName.SetRhythm, "", nums.map(o => ({ keys: ['alt', o], cursor: [], argumentData: [{ value: o }] }))),
    one(CommandTargetName.MoveChannelUp, ['control', 'arrowup']),
    one(CommandTargetName.PatternDown, ['arrowdown']),
    one(CommandTargetName.SelectionDown, ['shift', 'arrowdown']),
    one(CommandTargetName.MoveChannelDown, ['control', 'arrowdown']),
    one(CommandTargetName.MovePatternLeft, ['arrowleft']),
    one(CommandTargetName.ExtendSelectionLeft, ['shift', 'arrowleft']),
    one(CommandTargetName.MovePatternRight, ['arrowright']),
    one(CommandTargetName.ExtendSelectionRight, ['shift', 'arrowright'])
];
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
 * A shortcut represented by any number of keyboard/mouse interactions, where all must be pressed to invoke.
 * Keys are toLowerCase() strings from a keydown event's .key property. Modifier keys (Control, Shift, Alt) are included.
 * Shortcuts can also define the arguments to a command via action data.
*/
export interface IShortcut {
    /** (uppercased) keys, or names of nonprintable keys as returned by KeyboardEvent.key, including modifiers. */
    keys: string[]

    /** Cursor buttons, like left/right click as returned by MouseEvent.button. */
    cursor: CursorButtons[]

    /**
     * False by default. When true, after this shortcut matches, the user is given an opportunity to freely type data,
     * pressing escape to cancel, enter to confirm, backspace to revert last keypress, and this data becomes the action
     * data, taking precedence over both command and shortcut-specific action data.
     */
    freeformEntry?: boolean

    /** False by default. Allows repeat execution while inputs are held. Late-invoked commands naturally can't. */
    allowRepeats?: boolean

    /** Optional action data to pass to the command, specific to this shortcut.  */
    argumentData?: CommandArgument[]
}

/** For the freeform callback. Preview fires every time the freeform input changes. */
export const enum FreeformEventType { Started, Canceled, NextArg, NextArgBlocked, Submit, SubmitBlocked, Preview }

/** For simplicity, input handling is exposed from here. */
export class ShortcutHandler {
    public static readonly defaultEasyPianoEscapes = ["backspace"]; // lowercase, can be multiple keys to handle e.g. `/~
    public static readonly defaultEasyPianoPerform = ["capslock"]; // lowercase, can be multiple keys to handle e.g. '/"
    private readonly _commandContexts: CommandContext[] = []; // List of active contexts, set by SongEditor.
    public readonly recordedInputs: { cursor: CursorButtons[], keys: string[] } = { cursor: [], keys: [] }; // All actively-held inputs.
    private _earlyCommands: { [key: string]: [Command, IShortcut][] }; // Commands that can invoke early (key press)
    private _lateCommands: { [key: string]: [Command, IShortcut][] }; // Commands that only invoke late (key release)
    private _commandHasFired = false; // If a command fires in early invocation, this prevents it from firing again in late invocation (input release).
    private _freeform: { cmd: Command, defaultData: CommandArgument[], argInputs: CommandArgument[], numericType?: string } | undefined; // Tracks all relevant data in freeform input mode.
    private _onInvoke: (command: Command, actionData: CommandArgument[] | undefined) => void;

    /** While recording if easy notes is enabled, hold this lower/uppercase key (usually `/~) to fire shortcuts. */
    public easyPianoEscape = ShortcutHandler.defaultEasyPianoEscapes;
    /** While recording if easy shortcuts is enabled, hold this key (usually capslock) to play notes. */
    public easyPianoPerform = ShortcutHandler.defaultEasyPianoPerform;

    /** Assembles available commands, sets the callback when invoked. It's up to the consumer to handle behavior. */
    constructor(disabledBuiltInIDs: number[], customCommands: Command[], onInvoke: (command: Command, actionData: CommandArgument[] | undefined) => void) {
        this.setCommands(disabledBuiltInIDs, customCommands);
        this._onInvoke = onInvoke;
    }

    public setCommands(disabledBuiltInIDs: number[], customCommands: Command[]) {
        const commandsAvailable = builtInCommands.filter(cmd => disabledBuiltInIDs.indexOf(cmd.BuiltInId!) === -1)
            .concat(customCommands);

        // Sorts all shortcuts of all commands by their hashed set of inputs.
        const allShortcuts: [string, Command, IShortcut][] = [];
        for (const command of commandsAvailable) {
            for (const entry of command.Shortcuts) {
                allShortcuts.push([this.toHash(entry), command, entry]);
            }
        }
        allShortcuts.sort();

        // Separates by early/late invocation into objects for O(1) access.
        this._earlyCommands = {};
        this._lateCommands = {};
        for (let i = 1; i < allShortcuts.length; i++) {
            const list = allShortcuts[i][0].startsWith(allShortcuts[i - 1][0]) ? this._lateCommands : this._earlyCommands;
            if (!Object.hasOwn(list, allShortcuts[i][0])) {
                list[allShortcuts[i][0]] = [[allShortcuts[i][1], allShortcuts[i][2]]];
            } else {
                list[allShortcuts[i][0]].push([allShortcuts[i][1], allShortcuts[i][2]]);
            }
        }
    }

    private toHash(shortcut: IShortcut): string {
        return [...shortcut.keys.toSorted(), ...shortcut.cursor.toSorted().map(o => `m${o}`)].join('\n')
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

    /** On key down, handle early invocations (deferred=true). Compare all keyboard inputs as uppercase. */
    public handleKeyPressed = (event: KeyboardEvent, easyPianoKeys: boolean): void => {
        if (event.isComposing) { return; }
        this._updateModifierKeys(event);
        if (this._freeform === undefined) {
            // Push and handle shortcuts on keypress. Shortcuts also fire for other input types.
            if (!this.recordedInputs.keys.includes(event.key.toLowerCase())) {
                this.recordedInputs.keys.push(event.key.toLowerCase());
            }

            this._matchCommands(event, true, event.repeat, easyPianoKeys);
        }

        // Handle freeform input. Skip repeat keypresses, we only care about new keypresses.
        else if (!event.repeat) {
            let args = this._freeform.argInputs;
            const arg = args[args.length - 1];
            let argInfo = targets[this._freeform.cmd.Target].params[args.length - 1];

            // Cancel the freeform mode and forget its command.
            if (event.key === "Escape") {
                this.onFreeform?.(FreeformEventType.Canceled, this._freeform.cmd, args);
                this._freeform = undefined;
            }

            // Delete input towards this argument, or if none, jump to previous argument.
            else if (event.key === "Backspace") {
                if (argInfo.type !== CommandActionDataType.Bool && arg.value.length > 0) {
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
                        this.onFreeform?.(FreeformEventType.NextArg, this._freeform.cmd, args);
                        args.push({ value: "" });
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
                    this._onInvoke(this._freeform.cmd, args);
                    this._freeform = undefined;
                } else {
                    this.onFreeform?.(FreeformEventType.SubmitBlocked, this._freeform.cmd, args);
                    this._freeform = undefined;
                }
            }

            // For strings, append printable characters (length=1) which I'd claim is a safe way to distinguish
            else if (argInfo.type === CommandActionDataType.String && event.key.length === 1) {
                arg.value += event.key;
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // For bools, we set input rather than concat, and handle few keys.
            else if (argInfo.type === CommandActionDataType.Bool) {
                if (event.key.toLowerCase() === "t" || event.key === "1") { arg.value = "t"; }
                else if (event.key.toLowerCase() === "f" || event.key === "0") { arg.value = "f"; }
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

    /** On key release, first fire late invocation (deferred=false), then remove inputs (compared as uppercase). */
    public handleKeyReleased = (event: KeyboardEvent, easyPianoKeys: boolean): void => {
        if (event.isComposing) { return; }
        this._updateModifierKeys(event);
        if (this._freeform !== undefined) { return; }
        if (!this._commandHasFired) {
            this._matchCommands(event, false, event.repeat, easyPianoKeys);
        }

        const index = this.recordedInputs.keys.indexOf(event.key.toLowerCase());
        if (index !== -1) { this.recordedInputs.keys.splice(index, 1); }
        this._commandHasFired = false;
    }

    /** On mouse button press, fire early invocation (deferred=true). */
    public handleCursorDown = (event: MouseEvent, easyPianoKeys: boolean) => {
        if (this._freeform !== undefined) { return; }
        if (!this.recordedInputs.cursor.includes(event.button)) {
            this.recordedInputs.cursor.push(event.button);

            this._matchCommands(event, true, false, easyPianoKeys);
        }
    }

    /** On mouse button release, fire late invocation (deferred=false). */
    public handleCursorUp = (event: MouseEvent, easyPianoKeys: boolean) => {
        if (this._freeform !== undefined) { return; }
        if (!this._commandHasFired) {
            this._matchCommands(event, false, false, easyPianoKeys);
        }

        const index = this.recordedInputs.cursor.indexOf(event.button);
        if (index !== -1) { this.recordedInputs.cursor.splice(index, 1); }
        this._commandHasFired = false;
    }

    /**
     * On vertical mouse wheel movements, fire as late invocation (deferred=false) since wheel actions can't hold state
     * so they're immediate. Doesn't track amount of motion i.e. delta
     */
    public handleWheel = (event: WheelEvent, easyPianoKeys: boolean) => {
        if (this._freeform !== undefined) { return; }
        if (event.deltaY !== 0) {
            this.recordedInputs.cursor.push(event.deltaY > 0 ? CursorButtons.WheelDown : CursorButtons.WheelUp);
            this._matchCommands(event, false, false, easyPianoKeys);
        }

        this.recordedInputs.cursor = this.recordedInputs.cursor.filter(o => o !== CursorButtons.WheelDown && o !== CursorButtons.WheelUp);
    }

    /** If set, this is called on cancelation, submission, or preview (input updates) of freeform input. */
    public onFreeform?: (event: FreeformEventType, command: Command, argInputs: CommandArgument[]) => void;

    /** Modifiers often get stuck due to focus shifting. If a discrepancy to the browser exists, clear all. */
    private _updateModifierKeys(event: KeyboardEvent | WheelEvent | MouseEvent) {
        if ((!event.metaKey && this.recordedInputs.keys.indexOf("meta") !== -1) ||
            (!event.ctrlKey && this.recordedInputs.keys.indexOf("control") !== -1) ||
            (!event.altKey && this.recordedInputs.keys.indexOf("alt") !== -1) ||
            (!event.shiftKey && this.recordedInputs.keys.indexOf("shift") !== -1))
        {
            this.recordedInputs.keys = [];
            this.recordedInputs.cursor = [];
        }

        const index = this.recordedInputs.keys.indexOf("capslock");
        if (event.getModifierState("CapsLock") && index === -1) {
            this.recordedInputs.keys.push("capslock");
        }
        if (!event.getModifierState("CapsLock") && index !== -1) {
            this.recordedInputs.keys.splice(index, 1);
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
        const shortcutMap = deferFiring ? this._earlyCommands : this._lateCommands;
        let matchedShortcuts = shortcutMap[this.toHash(this.recordedInputs)] ?? [];

        // When the easy shortcuts key is *always* held, we need to include commands where it's not held down
        if (easyPianoKeys && this._commandContexts.includes(CommandContext.Recording)) {
            matchedShortcuts = matchedShortcuts.concat(shortcutMap[this.toHash({
                keys: this.recordedInputs.keys.filter((o => !this.easyPianoEscape.includes(o))),
                cursor: this.recordedInputs.cursor })] ?? []);
        }

        for (const entry of matchedShortcuts) {
            if (Command.ValidContext(entry[0], this._commandContexts)) {
                // Set freeform to the first that requests it, dropping others, and invoke the rest.
                if (entry[1].freeformEntry && targets[entry[0].Target].params.length > 0) {
                    requestingFreeform ??= entry;
                } else if (!isRepeating || entry[1].allowRepeats) {
                    this._onInvoke(entry[0], entry[1].argumentData ?? entry[0].ArgumentData);
                }

                this._commandHasFired = true;
                event.preventDefault();
            }
        }

        // Handle freeform request.
        if (requestingFreeform !== undefined) {
            this.recordedInputs.cursor = [];
            this.recordedInputs.keys = [];

            this._freeform = {
                cmd: requestingFreeform[0],
                defaultData: requestingFreeform[1].argumentData
                    ?? requestingFreeform[0].ArgumentData
                    ?? targets[requestingFreeform[0].Target].params.map(_ => ({ value: "" })),
                argInputs: [{ value: "" }] // always at least one entry
            };
            this.onFreeform?.(FreeformEventType.Started, this._freeform.cmd, this._freeform.argInputs);
        }
    }
}
//#endregion