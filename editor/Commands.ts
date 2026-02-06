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
 * Arguments accept a special syntax designed to be stateless, meaning that provided the current value and a
 * min/max range, it can do things like add 1 to it, set it to a new value, or even cycle through a list without
 * referencing the variable that the value comes from and without tracking its position in the list.
 * 
 * Shortcuts support chords of mixed inputs, like Ctrl + left-click. Invalid inputs are not detected or prevented as
 * there is no future-proof way to do so. Shortcuts should match KeyboardEvent.key or MouseEvent.button, using the
 * CursorButtons enum for the latter, which is a superset that includes vertical mouse wheel up/down. Relying on
 * KeyboardEvent.key is bad, but it's the best browsers allow right now; see "shortcomings" list at end of this comment.
 * 
 * Shortcut handling tracks the currently-held inputs and contexts for the sake of identifying which commands to invoke
 * out of a potentially narrowed list (incremental search, for performance) of all commands. As inputs are pressed,
 * commands are evaluated for early invocation and again as inputs are released, for late invocation. These modes are
 * the same except that early invocation will not fire commands when ambiguous, e.g. [A] is held, there is a command
 * matching [A] but also one matching [A + B]. The idea is that a user might be typing [A + B] and it doesn't become
 * clear they only want to invoke [A] until they start releasing inputs. As such, late invocation occurs BEFORE the key
 * is released, or nothing would happen.
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
 * we don't use modifier keys, and we need to also avoid Control because it's treated as an escape to access shortcuts
 * when in keyboard performance mode (using the keyboard like a piano).
 */

const matchNumber = /^[\+\-]?\d*\.?\d+$/; // No hex, octal or scientific notation
const clamp = (orig: number, min: number, max: number) => {
    return orig > max ? max : orig < min ? min : orig;
}

//#region Commands
/**
 * Identifies an action like undo or redo, with no associated data, or a setting that can have its value modified.
 * Note: Ordinal position can change, but assigned number should not as this serializes to user-saved data.
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
    EditSongEQ = 10,
    EditSongLength = 11,
    Export = 12,
    ExportInstrument = 13,
    ExtendSelectionLeft = 14,
    ExtendSelectionRight = 15,
    GenerateEuclideanRhythm = 16,
    HideChannel = 17,
    Import = 18,
    InsertBarNext = 19,
    InsertBarPrev = 20,
    InsertChannelNext = 21,
    InsertChannelPrev = 22,
    Jummbify = 23,
    LoopPattern = 24,
    MoveChannelDown = 25,
    MoveChannelUp = 26,
    MoveNotesSideways = 27,
    MovePatternLeft = 28,
    MovePatternRight = 29,
    MuteAll = 30,
    MuteChannel = 31,
    NewPattern = 32,
    NewPatternFromEmpty = 33,
    NewSong = 34,
    NextBar = 35,
    OnlyShowChannel = 37,
    OpenAllFMDropdowns = 38,
    OpenShowChannel = 39,
    OpenSongPlayer = 40,
    PasteInstrument = 41,
    PastePattern = 42,
    PastePatternNumbers = 43,
    PatternDown = 44,
    PatternUp = 45,
    PlayOrPause = 46,
    PlayAtCursor = 47,
    PrevBar = 48,
    RandomInstrument = 49,
    Redo = 50,
    RemovePattern = 51,
    SelectAll = 52,
    SelectChannel = 53,
    SelectionDown = 54,
    SelectionUp = 55,
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
    TEST = -344 // TODO DELETE THIS TEST AND REMOVE
}

/**
 * Commands can have data passed to them.
 * Note: Ordinal position can change, but assigned number should not as this serializes to user-saved data.
*/
export enum CommandActionDataType {
    Bool = 0,
    Number = 1,
    String = 2
}

/**
 * Commands can be limited to function in, or only outside of, contexts that the user enters and exits from.
 * Note: Ordinal position can change, but assigned number should not as this serializes to user-saved data.
 */
export enum CommandContext {
    /** When any prompt is shown above all other input. */
    ModalShown = 0,

    /** When playback is actively occurring. */
    LivePlayback = 1,

    /** When a pattern selection exists. */
    PatternSelection = 2,

    /** When a channel selection exists. */
    ChannelSelection = 3,

    /** When the active channel is a modulation channel, since it has so many special rules. */
    ModulationChannelActive = 4,

    /** When there is a MIDI device registered and actively monitored to record. */
    Recording = 5,

    /** When the user is hovered/interacting with the pattern editor. */
    OnPatternEditor = 6,

    /** When the user is hovered/interacting with the channels editor. */
    OnChannelEditor = 7,

    /** When the user is hovered/interacting with the loop editor. */
    OnLoopEditor = 8
}

export interface CommandTargetInfo {
    name: string,
    parameters: CommandParameter[]
}

/**
 * A serializable command parameter that defines the type of data an argument would provide. This allows command
 * targets to associate multiple data types to themselves.
 */
export class CommandParameter
{
    /** What type of data does this parameter deal with? */
    public valueType: CommandActionDataType

    /** For numbers, this is the min and max numeric range. */
    public numberMetadata: { isInt: boolean, min: number, max: number } | undefined

    /** Instantiation is controlled, exposed from functions below. */
    public constructor(type: CommandActionDataType, numberMetadata?: CommandParameter['numberMetadata']) {
        this.valueType = type;
        this.numberMetadata = numberMetadata;
    }

    /** True if non-numeric or if it fits expected integer and min/max range expectations. */
    public validateNumber(input: number, expectInt: boolean): boolean {
        return this.valueType !== CommandActionDataType.Number ||
            (this.numberMetadata !== undefined
            && (!expectInt || Math.trunc(input) === input)
            && input >= this.numberMetadata.min && input <= this.numberMetadata.max);
    }

    /** Interprets data as a number, returning origValue if anything is wrong. */
    public GetDataAsNumber(actiondata: CommandArgument, origValue: number, minValue: number, maxValue: number): number
    {
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
    public GetDataAsBool(actiondata: CommandArgument, origValue: boolean): boolean
    {
        const lower = actiondata.value.toLowerCase();
        return lower === "toggle" ? !origValue : lower === "t" || lower === "true";
    }

    /** Verifies the given data is valid for this parameter. */
    public IsArgumentValid(data: CommandArgument): boolean
    {
        if (this.valueType !== CommandActionDataType.Number && data.metadata !== undefined) {
            return false;
        }

        switch (this.valueType) {
            case CommandActionDataType.String:
                return true;
            case CommandActionDataType.Bool:
                const actionDataLower = data.value.toLowerCase();
                return actionDataLower === "t" || actionDataLower === "true" ||
                    actionDataLower === "f" || actionDataLower === "false" ||
                    actionDataLower === "toggle";
            case CommandActionDataType.Number:
                if (data.metadata === undefined) {
                    return matchNumber.test(data.value);
                }

                const isListType =
                    data.metadata === "cycle" ||
                    data.metadata === "cycle-stop" ||
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
                        (isRangeType && numberStrings.length !== 2)) {
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
            default: (this.valueType satisfies never) // Catch missing TS cases
                return false;
        }
    }
}

/** Where argument data is required, it's treated as a string. For some types (e.g. numbers), it has metadata. */
export type CommandArgument = { value: string; metadata?: string; }

/** A serialized format; don't rename keys. It'll break import. */
interface CommandJSON {
    N: Command['Name']
    T: Command['Target']
    C: Command['Context'],
    S: Command['Shortcuts'],
    D: Command['ArgumentData']
    V: Command['Version']
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
     * A string like "4" or "0 & 1 | (2 & 3)" where the numbers correspond to the serialized form of CommandContext
     * enum. The values of those contexts are bools substituted during evaluation. Allowed symbols are 0-9&|! where
     * & means and, | means or, ! means not. When the context is true, the command is considered valid. Invalid
     * numbers are substituted with true. The command will not be fired via shortcut handling if context === false.
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
        const numParams = targets[this.Target].parameters.length;

        if (this.ArgumentData !== undefined && (this.ArgumentData.length !== numParams ||
            targets[this.Target].parameters.some((o, index) => !o.IsArgumentValid(this.ArgumentData![index])))) {
            return false;
        }

        let allShortcutsHaveArgsOrFreeform = true;
        for (const shortcut of this.Shortcuts) {
            if (!shortcut.freeformEntry && !shortcut.argumentData) { allShortcutsHaveArgsOrFreeform = false; }
            if (shortcut.argumentData !== undefined && (shortcut.argumentData.length !== numParams ||
                targets[this.Target].parameters.some((o, index) => !o.IsArgumentValid(shortcut.argumentData![index])))) {
                return false;
            }
        }

        return (allShortcutsHaveArgsOrFreeform || this.ArgumentData !== undefined);
    }

    /** Returns a user-legible string like "Ctrl + A + Wheel up" describing the key sequence for a shortcut. */
    public static GetShortcutDisplay(shortcut: IShortcut): string
    {
        const keysList: string[] = [];

        // Start with modifier keys, then other keyboard keys, then mouse inputs.
        ["Meta", "Control", "Shift", "Alt", "Compose"].forEach(modifierKey => {
            const index = shortcut.keys.indexOf(modifierKey);
            if (index !== -1) {
                keysList.push(modifierKey);
                shortcut.keys.splice(index, 1);
            }
        });

        for (const key of shortcut.keys) {
            const keyLower = key.toLowerCase();
            if (keyLower === " ") { keysList.push("Space"); }
            else if (keyLower === "arrowup") { keysList.push("Up"); }
            else if (keyLower === "arrowleft") { keysList.push("Left"); }
            else if (keyLower === "arrowdown") { keysList.push("Down"); }
            else if (keyLower === "arrowright") { keysList.push("Right"); }
            else if (keyLower.length > 0) {
                keysList.push(keyLower[0].toUpperCase() + keyLower.slice(1));
            }
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
     * Performs a guaranteed-safe eval to convert a context string like "1 & (2 | 3)" to a bool where true means the
     * context is valid and false means it's not. Numbers are indices in the CommandContexts enum that are true if
     * present in active contexts.
     */
    public static ValidContext(command: Command, activeContexts: CommandContext[]): boolean {
        if (command.Context === "") { return true; }
        try {
            return (new Function("return " + command.Context
                .replaceAll(/[^0-9&\|!\(\)]/g, "") // keeps only 0-9&|!()
                .replaceAll(/&+/g, "&&") // any number of & to &&
                .replaceAll(/\|+/g, "||") // any number of | to ||
                .replaceAll(/(\(+\)+)/g, "") // remove empty parenthesis groups to block invocations
                .replaceAll(/\d+/g, (str) => { // digits are interpreted as enum values in CommandContext
                    return activeContexts.includes(+str) ? "!0" : "!1";
                })))();
        } catch {
            return false;
        }
    }

    public static ToJSON(cmd: Command): string {
        return JSON.stringify({
            N: cmd.Name,
            T: cmd.Target,
            C: cmd.Context,
            S: cmd.Shortcuts,
            D: cmd.ArgumentData,
            V: cmd.Version
        } satisfies CommandJSON);
    }

    public static FromJSON(json: string): Command[] {
        return (JSON.parse(json) as CommandJSON[]).map(entry => new Command(
            entry.N ?? "",
            entry.T ?? CommandTargetName.None,
            entry.C ?? "",
            entry.S ?? [],
            entry.D,
            entry.V ?? 0))
            .filter(o => o.ValidArguments()); // Don't rehydrate bad commands
    }
}

/** The metadata of all possible targets. Names here are for actions, but argument-less commands often reuse them. */
export const targets: { [key in CommandTargetName]: CommandTargetInfo } = {
    [CommandTargetName.TEST]: { name: 'TEST', parameters: [new CommandParameter(CommandActionDataType.Number, { isInt: true, min: 0, max: 100 })] }, // TODO TEST REMOVE DELETE THIS DO NOT COMMIT
    [CommandTargetName.None]: { name: '', parameters: [] },
    [CommandTargetName.CopyInstrument]: { name: 'Copy instrument', parameters: [] },
    [CommandTargetName.CopyPattern]: { name: 'Copy pattern', parameters: [] },
    [CommandTargetName.CutPattern]: { name: 'Cut pattern', parameters: [] },
    [CommandTargetName.DeleteBar]: { name: 'Delete bar', parameters: [] },
    [CommandTargetName.DeleteChannel]: { name: 'Delete channel', parameters: [] },
    [CommandTargetName.DuplicatePattern]: { name: 'Duplicate pattern', parameters: [] },
    [CommandTargetName.EditBeatsPerBar]: { name: 'Edit beats per bar', parameters: [] },
    [CommandTargetName.EditChannelSettings]: { name: 'Edit channel settings', parameters: [] },
    [CommandTargetName.EditCustomSamples]: { name: 'Edit custom samples', parameters: [] },
    [CommandTargetName.OnlyShowChannel]: { name: 'Only show channel', parameters: [] },
    [CommandTargetName.EditLimiter]: { name: 'Edit limiter', parameters: [] },
    [CommandTargetName.EditSongEQ]: { name: 'Edit song EQ', parameters: [] },
    [CommandTargetName.EditSongLength]: { name: 'Edit song length', parameters: [] },
    [CommandTargetName.Export]: { name: 'Export song', parameters: [] },
    [CommandTargetName.ExportInstrument]: { name: 'Export instrument', parameters: [] },
    [CommandTargetName.ExtendSelectionLeft]: { name: 'Extend selection left', parameters: [] },
    [CommandTargetName.ExtendSelectionRight]: { name: 'Extend selection right', parameters: [] },
    [CommandTargetName.GenerateEuclideanRhythm]: { name: 'Generate Euclidean Rhythm', parameters: [] },
    [CommandTargetName.HideChannel]: { name: 'Hide channel', parameters: [] },
    [CommandTargetName.Import]: { name: 'Import samples', parameters: [] },
    [CommandTargetName.InsertBarNext]: { name: 'Insert bar in front', parameters: [] },
    [CommandTargetName.InsertBarPrev]: { name: 'Insert bar behind', parameters: [] },
    [CommandTargetName.InsertChannelNext]: { name: 'Insert channel in front', parameters: [] },
    [CommandTargetName.InsertChannelPrev]: { name: 'Insert channel behind', parameters: [] },
    [CommandTargetName.Jummbify]: { name: 'Jummbify', parameters: [] },
    [CommandTargetName.LoopPattern]: { name: 'Loop pattern', parameters: [] },
    [CommandTargetName.MoveChannelDown]: { name: 'Move channel down', parameters: [] },
    [CommandTargetName.MoveChannelUp]: { name: 'Move channel up', parameters: [] },
    [CommandTargetName.MoveNotesSideways]: { name: 'Move notes sideways', parameters: [] },
    [CommandTargetName.MovePatternLeft]: { name: 'Move pattern left', parameters: [] },
    [CommandTargetName.MovePatternRight]: { name: 'Move pattern right', parameters: [] },
    [CommandTargetName.MuteAll]: { name: 'Mute all channels', parameters: [] },
    [CommandTargetName.MuteChannel]: { name: 'Mute channel', parameters: [] },
    [CommandTargetName.NewPattern]: { name: 'New pattern', parameters: [] },
    [CommandTargetName.NewPatternFromEmpty]: { name: 'New pattern from empty', parameters: [] },
    [CommandTargetName.NewSong]: { name: 'New song', parameters: [] },
    [CommandTargetName.NextBar]: { name: 'Next bar', parameters: [] },
    [CommandTargetName.OpenAllFMDropdowns]: { name: 'Open all FM Dropdowns', parameters: [] },
    [CommandTargetName.OpenShowChannel]: { name: 'Open show channel', parameters: [] },
    [CommandTargetName.OpenSongPlayer]: { name: 'Open song player', parameters: [] },
    [CommandTargetName.PasteInstrument]: { name: 'Paste instrument', parameters: [] },
    [CommandTargetName.PastePattern]: { name: 'Paste pattern', parameters: [] },
    [CommandTargetName.PastePatternNumbers]: { name: 'Paste pattern numbers', parameters: [] },
    [CommandTargetName.PatternDown]: { name: 'Pattern down', parameters: [] },
    [CommandTargetName.PatternUp]: { name: 'Pattern up', parameters: [] },
    [CommandTargetName.PlayOrPause]: { name: 'Play or pause', parameters: [] },
    [CommandTargetName.PlayAtCursor]: { name: 'Play at cursor', parameters: [] },
    [CommandTargetName.PrevBar]: { name: 'Previous bar', parameters: [] },
    [CommandTargetName.RandomInstrument]: { name: 'Random instrument', parameters: [] },
    [CommandTargetName.Redo]: { name: 'Redo', parameters: [] },
    [CommandTargetName.RemovePattern]: { name: 'Remove pattern', parameters: [] },
    [CommandTargetName.SelectAll]: { name: 'Select all', parameters: [] },
    [CommandTargetName.SelectChannel]: { name: 'Select channel', parameters: [] },
    [CommandTargetName.SelectionDown]: { name: 'Selection down', parameters: [] },
    [CommandTargetName.SelectionUp]: { name: 'Selection up', parameters: [] },
    [CommandTargetName.SnapPlayheadToBeginning]: { name: 'Snap playhead to start', parameters: [] },
    [CommandTargetName.SnapPlayheadToLoopStart]: { name: 'Snap playhead to loop start', parameters: [] },
    [CommandTargetName.SnapPlayheadToSelected]: { name: 'Snap playhead to selected', parameters: [] },
    [CommandTargetName.SoloChannel]: { name: 'Solo channel', parameters: [] },
    [CommandTargetName.SongRecovery]: { name: 'Open song recovery', parameters: [] },
    [CommandTargetName.ToggleRecording]: { name: 'Toggle recording', parameters: [] },
    [CommandTargetName.TransposeDown]: { name: 'Move notes down a step', parameters: [] },
    [CommandTargetName.TransposeOctaveDown]: { name: 'Move notes down an octave', parameters: [] },
    [CommandTargetName.TransposeOctaveUp]: { name: 'Move notes up an octave', parameters: [] },
    [CommandTargetName.TransposeUp]: { name: 'Move notes up a step', parameters: [] },
    [CommandTargetName.Undo]: { name: 'Undo', parameters: [] },
};

// Just to keep below neat
const fromTarget = (target: CommandTargetName, keysPassed: string[], cursorPassed?: CursorButtons[], context?: string) => {
    const cmd = new Command(targets[target].name, target, context ?? "", [ { keys: keysPassed, cursor: cursorPassed ?? [] } ])
    cmd.BuiltInId = target;
    return cmd;
};

/**
 * The built-in commands list, most borrow the display name of their target as most aren't parameterized, so this is
 * mainly for the default shortcuts. Note that Control is used by keyboard performance (playing it as a piano) which
 * uses either caps lock state or control to activate keys. Meaning no keybind should by default require Control. The
 * danger here is that two keybinds that only differ by whether Control is held or not will, when control is required
 * to activate, both be triggered by the same keybind which is surprising and unhelpful to users. However, it's familiar
 * to users as well. So ideally there should be a legacy default that does that and a brand new redesign of keyboard
 * functionality which is the actual default.
 * 
 * No default keybinds for: InsertChannelPrev, OpenAllFMDropdowns, PastePatternNumbers, Jummbify
 * 
 * There are no restrictions on binding Alt, Meta, Control or Compose. It's not recommendable. The custom shortcut
 * manager prevents binding a modifier key by itself. And the firing mechanism also ignores that, for speed.
*/
export const builtInCommands: Command[] = [
    new Command("TEST", CommandTargetName.TEST, "", [{ keys: [' '], cursor: [], freeformEntry: true }], [ { value: "0" } ]), // TODO TEST DELETE
    fromTarget(CommandTargetName.PlayOrPause, [' ']),
    fromTarget(CommandTargetName.PlayAtCursor, ['SHIFT', ' ']),
    new Command(targets[CommandTargetName.ToggleRecording].name, CommandTargetName.ToggleRecording,
        "", [{ keys: ['CONTROL', ' '], cursor: [] }, { keys: ['CONTROL', 'P'], cursor: [] }]),
    fromTarget(CommandTargetName.OpenSongPlayer, ['SHIFT', 'P']),
    fromTarget(CommandTargetName.NewSong, ['SHIFT', '~']),
    fromTarget(CommandTargetName.SongRecovery, ['SHIFT', '~']), // Intentionally same as NewSong
    fromTarget(CommandTargetName.Undo, ['Z']),
    new Command(targets[CommandTargetName.Redo].name, CommandTargetName.Redo, "", [{ keys: ['Y'], cursor: [] }, { keys: ['SHIFT', 'Z'], cursor: [] }]),
    fromTarget(CommandTargetName.CutPattern, ['X']),
    fromTarget(CommandTargetName.EditBeatsPerBar, ['SHIFT', 'B']),
    fromTarget(CommandTargetName.LoopPattern, ['B']),
    fromTarget(CommandTargetName.CopyInstrument, ['SHIFT', 'C']),
    fromTarget(CommandTargetName.CopyPattern, ['C']),
    fromTarget(CommandTargetName.InsertBarNext, ['ENTER']),
    fromTarget(CommandTargetName.InsertBarPrev, ['SHIFT', 'ENTER']),
    fromTarget(CommandTargetName.InsertChannelNext, ['CONTROL', 'ENTER']),
    fromTarget(CommandTargetName.DeleteBar, ['BACKSPACE']),
    fromTarget(CommandTargetName.DeleteChannel, ['CONTROL', 'BACKSPACE']),
    fromTarget(CommandTargetName.SelectAll, ['A']),
    fromTarget(CommandTargetName.SelectChannel, ['SHIFT', 'A']),
    fromTarget(CommandTargetName.DuplicatePattern, ['D']),
    fromTarget(CommandTargetName.EditSongEQ, ['E']),
    fromTarget(CommandTargetName.GenerateEuclideanRhythm, ['SHIFT', 'E']),
    fromTarget(CommandTargetName.SnapPlayheadToBeginning, ['F']),
    fromTarget(CommandTargetName.SnapPlayheadToLoopStart, ['SHIFT', 'F']),
    fromTarget(CommandTargetName.SnapPlayheadToSelected, ['H']),
    fromTarget(CommandTargetName.HideChannel, ['K']),
    fromTarget(CommandTargetName.OnlyShowChannel, ['J']),
    fromTarget(CommandTargetName.EditLimiter, ['SHIFT', 'L']),
    fromTarget(CommandTargetName.EditSongLength, ['L']),
    fromTarget(CommandTargetName.MuteChannel, ['M']),
    fromTarget(CommandTargetName.MuteAll, ['SHIFT', 'M']),
    fromTarget(CommandTargetName.NewPattern, ['N']),
    fromTarget(CommandTargetName.NewPatternFromEmpty, ['SHIFT', 'N']),
    fromTarget(CommandTargetName.EditChannelSettings, ['Q']),
    fromTarget(CommandTargetName.EditCustomSamples, ['SHIFT', 'Q']),
    fromTarget(CommandTargetName.SoloChannel, ['S']),
    fromTarget(CommandTargetName.Export, ['SHIFT', 'S']),
    fromTarget(CommandTargetName.Import, ['SHIFT', 'O']),
    fromTarget(CommandTargetName.PastePattern, ['V']),
    fromTarget(CommandTargetName.PasteInstrument, ['SHIFT', 'V']),
    fromTarget(CommandTargetName.MoveNotesSideways, ['W']),
    fromTarget(CommandTargetName.ExportInstrument, ['SHIFT', 'I']),
    fromTarget(CommandTargetName.RandomInstrument, ['R']),
    fromTarget(CommandTargetName.NextBar, [']']),
    fromTarget(CommandTargetName.PrevBar, ['[']),
    fromTarget(CommandTargetName.TransposeDown, ['-']),
    fromTarget(CommandTargetName.TransposeUp, ['=']),
    fromTarget(CommandTargetName.TransposeOctaveDown, ['SHIFT', '_']),
    fromTarget(CommandTargetName.TransposeOctaveUp, ['SHIFT', '+']),
    fromTarget(CommandTargetName.RemovePattern, ['DELETE']),
    fromTarget(CommandTargetName.PatternUp, ['ARROWUP']),
    fromTarget(CommandTargetName.SelectionUp, ['SHIFT', 'ARROWUP']),
    fromTarget(CommandTargetName.MoveChannelUp, ['CONTROL', 'ARROWUP']),
    fromTarget(CommandTargetName.PatternDown, ['ARROWDOWN']),
    fromTarget(CommandTargetName.SelectionDown, ['SHIFT', 'ARROWDOWN']),
    fromTarget(CommandTargetName.MoveChannelDown, ['CONTROL', 'ARROWDOWN']),
    fromTarget(CommandTargetName.MovePatternLeft, ['ARROWLEFT']),
    fromTarget(CommandTargetName.ExtendSelectionLeft, ['SHIFT', 'ARROWLEFT']),
    fromTarget(CommandTargetName.MovePatternRight, ['ARROWRIGHT']),
    fromTarget(CommandTargetName.ExtendSelectionRight, ['SHIFT', 'ARROWRIGHT']),
];
//#endregion

//#region Shortcuts
/**
 * Mouse/touch indications. Same as MouseEvent.button except wheel events, which are negative numbers to future-proof
 * against browsers listing more buttons in the future.
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
 * Keys are toUpperCase() strings from a keydown event's .key property. Modifier keys (Control, Shift, Alt) are included.
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
    private readonly _recordedInputs: { cursor: CursorButtons[], keys: string[] } = { cursor: [], keys: [] }; // All actively-held inputs.
    private readonly _commandsAvailable: Command[] = []; // List of ALL commands loaded.
    private _commandsNarrowed: Command[] | undefined; // Sub-list of the available commands, for performance in lookups. Undefined = no narrowing.
    private _commandHasFired = false; // If a command fires in early invocation, this prevents it from firing again in late invocation (input release).
    private _commandContexts: CommandContext[] = []; // List of active contexts, set by SongEditor.
    private _freeform: { cmd: Command, defaultData: CommandArgument[], argInputs: CommandArgument[], numericType?: string } | undefined; // Tracks all relevant data in freeform input mode.
    private _onInvoke: (command: Command, actionData: CommandArgument[] | undefined) => void;

    /** Loads the shortcut handler, assembling the available commands list from the built-ins that aren't disabled and a custom list. */
    constructor(disabledBuiltInIDs: number[], customCommands: Command[], onInvoke: (command: Command, actionData: CommandArgument[] | undefined) => void) {
        this._commandsAvailable = builtInCommands.filter(cmd => disabledBuiltInIDs.indexOf(cmd.BuiltInId!) === -1)
            .concat(customCommands);
        this._onInvoke = onInvoke;
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

    /**
     * Due to focus shifting, key states can be stuck. The browser knows what's held much better than we do, so if a
     * discrepancy exists, assume the key state is invalid and clear it immediately. Clear both on press and release
     * because both early AND late invocation can fire commands.
     */
    private _clearStuckKeys = (event: KeyboardEvent): void => {
        if ((!event.metaKey && this._recordedInputs.keys.indexOf("Meta") !== -1) ||
            (!event.ctrlKey && this._recordedInputs.keys.indexOf("Control") !== -1) ||
            (!event.altKey && this._recordedInputs.keys.indexOf("Alt") !== -1) ||
            (!event.shiftKey && this._recordedInputs.keys.indexOf("Shift") !== -1)) {
            this._recordedInputs.keys = [];
            this._recordedInputs.cursor = [];
            this._commandsNarrowed = undefined;
        }
    }

    /** When focus is broken or entered, clear the held inputs. For performance, we can handle it only for focusin. */
    public handleFocusIn = (): void => {
        this._recordedInputs.cursor = [];
        this._recordedInputs.keys = [];
        this._commandHasFired = false;
        this._commandsNarrowed = undefined;
    }

    /** On key down, handle early invocations (deferred=true). Compare all keyboard inputs as uppercase. */
    public handleKeyPressed = (event: KeyboardEvent): void => {
        if (event.isComposing) { return; }
        this._clearStuckKeys(event);
        if (this._freeform === undefined) {
            // Push and handle shortcuts on keypress. Shortcuts also fire for other input types.
            if (!this._recordedInputs.keys.includes(event.key.toUpperCase())) {
                this._recordedInputs.keys.push(event.key.toUpperCase());
            }

            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, true, event.repeat);
        }

        // Handle freeform input. Skip repeat keypresses, we only care about new keypresses.
        else if (!event.repeat) {
            let args = this._freeform.argInputs;
            const arg = args[args.length - 1];
            let argInfo = targets[this._freeform.cmd.Target].parameters[args.length - 1];

            // Cancel the freeform mode and forget its command.
            if (event.key === "Escape") {
                this.onFreeform?.(FreeformEventType.Canceled, this._freeform.cmd, args);
                this._freeform = undefined;
            }

            // Delete input towards this argument, or if none, jump to previous argument.
            else if (event.key === "Backspace") {
                if (argInfo.valueType !== CommandActionDataType.Bool && arg.value.length > 0) {
                    arg.value = arg.value.slice(0, arg.value.length - 1);
                } else if (args.length > 1) { args.pop(); }
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // On enter or space (for non-string data), move to next argument or submit.
            // If submitted empty, tries to use any default data that exists.
            else if (event.key === "Enter" || (event.key === " " && argInfo.valueType !== CommandActionDataType.String)) {
                const inputOrDefault = arg.value === ""
                    ? this._freeform.defaultData[args.length - 1].value
                    : arg.value;

                // Next argument
                if (args.length !== targets[this._freeform.cmd.Target].parameters.length) {
                    if (argInfo.IsArgumentValid({ value: inputOrDefault, metadata: arg.metadata })) {
                        arg.value = inputOrDefault;
                        this.onFreeform?.(FreeformEventType.NextArg, this._freeform.cmd, args);
                        args.push({ value: "" });
                    } else {
                        this.onFreeform?.(FreeformEventType.NextArgBlocked, this._freeform.cmd, args);
                        this._freeform = undefined;
                    }
                }
                // Submission
                else if (argInfo.IsArgumentValid({ value: inputOrDefault, metadata: arg.metadata }) &&
                    Command.ValidContext(this._freeform.cmd, this._commandContexts))
                {
                    arg.value = inputOrDefault;
                    this.onFreeform?.(FreeformEventType.Submit, this._freeform.cmd, args);
                    this._onInvoke(this._freeform.cmd, args);
                    this._freeform = undefined;
                } else {
                    this.onFreeform?.(FreeformEventType.SubmitBlocked, this._freeform.cmd, args);
                    this._freeform = undefined;
                }
            }

            // For strings, append printable characters (length=1) which I'd claim is a safe way to distinguish
            else if (argInfo.valueType === CommandActionDataType.String && event.key.length === 1) {
                arg.value += event.key;
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // For bools, we set input rather than concat, and handle few keys.
            else if (argInfo.valueType === CommandActionDataType.Bool) {
                if (event.key === "t" || event.key === "1") { arg.value = "t"; }
                else if (event.key === "f" || event.key === "0") { arg.value = "f"; }
                else if (event.key === "!") { arg.value = "toggle"; }
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }

            // For numbers, handles 0-9.,=+-*/ flips sign for - and changes mode via =+*/ for compatible sets.
            else if (argInfo.valueType === CommandActionDataType.Number) {
                let numericNewType: string | undefined;
                if (event.key === "-") { arg.value = arg.value.startsWith("-") ? arg.value.slice(1) : `-${arg.value}`; }
                else if (event.key === "+") { numericNewType = "add"; }
                else if (event.key === "=") { numericNewType = "set"; }
                else if (event.key === "*") { numericNewType = "mul"; }
                else if (event.key === "/") { numericNewType = "div"; }
                else if (event.key.length === 1 && event.key.charCodeAt(0) > 47 && event.key.charCodeAt(0) < 58) { arg.value += event.key; } // 0-9
                else if (!argInfo.numberMetadata?.isInt && (event.key === '.' || event.key === ',')) { arg.value += "."; }

                if (numericNewType) {
                    arg.metadata ??= "set";
                    arg.metadata = arg.metadata.replace(/\|(add|set|mul|div)$/, numericNewType)
                        .replace(/\|random-list-(add|set|mul|div)$/, numericNewType)
                        .replace(/\|random-(add|set|mul|div)$/, numericNewType);

                    if (numericNewType === "add") {
                        arg.metadata = arg.metadata.replace(/\|cycle$/, "cycle-add").replace(/\|cycle\-stop$/, "cycle-add-stop");
                    } else if (numericNewType === "set") {
                        arg.metadata = arg.metadata.replace(/\|cycle\-add$/, "cycle").replace(/\|cycle\-add\-stop$/, "cycle-stop");
                    }
                }
                this.onFreeform?.(FreeformEventType.Preview, this._freeform.cmd, args);
            }
        }
    }

    /** On key release, first fire late invocation (deferred=false), then remove inputs (compared as uppercase). */
    public handleKeyReleased = (event: KeyboardEvent): void => {
        if (event.isComposing) { return; }
        this._clearStuckKeys(event);
        if (this._freeform !== undefined) { return; }
        if (!this._commandHasFired) {
            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, false, event.repeat);
        }

        const index = this._recordedInputs.keys.indexOf(event.key.toUpperCase());
        if (index !== -1) { this._recordedInputs.keys.splice(index, 1); }
        this._commandHasFired = false;
        this._commandsNarrowed = undefined;
    }

    /** On mouse button press, fire early invocation (deferred=true). */
    public handleCursorDown = (event: MouseEvent) => {
        if (this._freeform !== undefined) { return; }
        if (!this._recordedInputs.cursor.includes(event.button)) {
            this._recordedInputs.cursor.push(event.button);

            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, true, false);
        }
    }

    /** On mouse button release, fire late invocation (deferred=false). */
    public handleCursorUp = (event: MouseEvent) => {
        if (this._freeform !== undefined) { return; }
        if (!this._commandHasFired) {
            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, false, false);
        }

        const index = this._recordedInputs.cursor.indexOf(event.button);
        if (index !== -1) { this._recordedInputs.cursor.splice(index, 1); }
        this._commandHasFired = false;
        this._commandsNarrowed = undefined;
    }

    /**
     * On vertical mouse wheel movements, fire as late invocation (deferred=false) since wheel actions can't hold state
     * so they're immediate. Doesn't track amount of motion i.e. delta
     */
    public handleWheel = (event: WheelEvent) => {
        if (this._freeform !== undefined) { return; }
        if (event.deltaY !== 0) {
            this._recordedInputs.cursor.push(event.deltaY > 0 ? CursorButtons.WheelDown : CursorButtons.WheelUp);
            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, false, false);
        }

        this._recordedInputs.cursor = this._recordedInputs.cursor.filter(o => o !== CursorButtons.WheelDown && o !== CursorButtons.WheelUp);
    }

    /** If set, this is called on cancelation, submission, or preview (input updates) of freeform input. */
    public onFreeform?: (event: FreeformEventType, command: Command, argInputs: CommandArgument[]) => void;

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
     * 
     * @param commands The list of all commands to go through. Pass a subset based on returned values for incr. search.
     * @param activeContexts The list of all active contexts.
     * @param inputs All held inputs.
     * @param handler The function to invoke for each command that fires, with its shortcut data or default data.
     * @param deferFiring If true and there could be a command the user can strike only by adding inputs, do nothing.
     * @param isRepeating If true, the last input is held and repeating, so only commands that allow that fire.
     */
    public matchCommands(commands: Command[], deferFiring: boolean, isRepeating: boolean): void
    {
        const narrowedList: Command[] = [];
        const candidates: { cmd: Command, from: IShortcut }[] = [];
        let exitEarlyInvocation = false;
        for (const command of commands) {
            for (let i = 0; i < command.Shortcuts.length; i++) {
                // If all current inputs are part of this shortcut,
                if (this._recordedInputs.keys.every(o => command.Shortcuts[i].keys.includes(o)) &&
                    this._recordedInputs.cursor.every(o => command.Shortcuts[i].cursor.includes(o)))
                {
                    // If the shortcut requires even more inputs than held, it's a superset. It can't be fired.
                    if (command.Shortcuts[i].keys.some(o => !this._recordedInputs.keys.includes(o)) ||
                        command.Shortcuts[i].cursor.some(o => !this._recordedInputs.cursor.includes(o))) {
                        narrowedList.push(command);
                        if (deferFiring) { exitEarlyInvocation = true; break; }
                    }
                    // Match, but context must be valid too and if we're repeating, it has to allow that to count.
                    else if (Command.ValidContext(command, this._commandContexts)) {
                        if ((!isRepeating || command.Shortcuts[i].allowRepeats)) {
                            candidates.push({ cmd: command, from: command.Shortcuts[i] });
                            break;
                        } else if (deferFiring) {
                            narrowedList.push(command);
                        }
                    // Context not matched, but might in future (unlike repeat) so narrow the list.
                    } else {
                        narrowedList.push(command);
                        break;
                    }

                    // Continue in case other shortcuts of the same command might match.
                }
            }
        }

        // For matching "A" when a command for "A + B" exists, if deferring (key press), narrow the list & skip firing.
        if (exitEarlyInvocation) {
            this._commandsNarrowed = [...narrowedList, ...candidates.map(o => o.cmd)];
        }

        let requestingFreeform: number | undefined;
        candidates.forEach((o, index) => {
            if (o.from.freeformEntry && targets[o.cmd.Target].parameters.length > 0) {
                if (!requestingFreeform) {
                    requestingFreeform = index;
                }
                // Don't process *other* matching candidates also requesting freeform. To do so is considered an error
                // because there is no well-defined order for commands to execute in, and proceeding through multiple
                // arguments across commands becomes cumbersome and confusing.
            } else {
                this._onInvoke(o.cmd, o.from.argumentData ?? o.cmd.ArgumentData);
            }
        });

        // If a candidate with arguments requests freeform input, we set freeform input mode after invoking the rest of
        // the commands. If multiple requested it, we dropped the others.
        if (requestingFreeform !== undefined) {
            this._recordedInputs.cursor = [];
            this._recordedInputs.keys = [];
            this._commandsNarrowed = undefined;

            this._freeform = {
                cmd: candidates[requestingFreeform].cmd,
                defaultData: candidates[requestingFreeform].from.argumentData
                    ?? candidates[requestingFreeform].cmd.ArgumentData
                    ?? targets[candidates[requestingFreeform].cmd.Target].parameters.map(_ => ({ value: "" })),
                argInputs: [{ value: "" }] // always at least one entry
            };
            this.onFreeform?.(FreeformEventType.Started, this._freeform.cmd, this._freeform.argInputs);
        }

        if (candidates.length > 0) {
            this._commandHasFired = true;
        }
    }
}
//#endregion
