/**
 * This is the complete command subsystem, which is self-contained except for the custom shortcut editor prompt and
 * command palette, the serialization of those commands in Preferences.ts and event hook bindings of ShortcutHandler in
 * SongEditor.ts on the "mainlayer" div. Documentation should be very complete, find and contact a developer if you have
 * questions.
 * 
 * Commands are argument-driven actions with associated shortcuts to invoke them, along with optional argument data
 * associated per-shortcut or command-wide. The CommandTargetName enum and targets object define the parameters of an
 * action, while the Command class defines actual data. The performance of a command is done by event handling from
 * SongEditor.ts as it has access to all the relevant data.
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

const matchNumber = /^[\+\-]?\d*\.?\d+$/g; // No hex, octal or scientific notation
const clamp = (orig: number, min: number, max: number) => {
    return orig > max ? max : orig < min ? min : orig;
}

//#region Shortcuts
/**
 * Mouse/touch indications. Same as MouseEvent.button except wheel events, which are negative numbers to future-proof
 * against browsers listing more buttons in the future.
 */
export enum CursorButtons {
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

    /** False by default, this allows the shortcut to repeatedly be invoked by holding the most recent input that invoked it. */
    allowRepeats?: boolean

    /** Optional action data to pass to the command, specific to this shortcut.  */
    data?: string
}
//#endregion

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
    OnlyShowChannel = 36, // TODO: duplicate ID
	OpenAllFMDropdowns = 36,
	OpenShowChannel = 37,
	OpenSongPlayer = 38,
	PasteInstrument = 39,
	PastePattern = 40,
	PastePatternNumbers = 41,
	PatternDown = 42,
	PatternUp = 43,
    PlayOrPause = 44,
	PlayAtCursor = 45,
	PrevBar = 46,
	RandomInstrument = 47,
	Redo = 48,
	RemovePattern = 49,
	SelectAll = 50,
	SelectChannel = 51,
	SelectionDown = 52,
	SelectionUp = 53,
	SnapPlayheadToBeginning = 54,
	SnapPlayheadToLoopStart = 55,
	SnapPlayheadToSelected = 56,
	SoloChannel = 57,
	SongRecovery = 58,
	ToggleRecording = 59,
	TransposeDown = 60,
	TransposeOctaveDown = 61,
	TransposeOctaveUp = 62,
	TransposeUp = 63,
	Undo = 64
}

/**
 * Commands can have data passed to them.
 * Note: Ordinal position can change, but assigned number should not as this serializes to user-saved data.
*/
export enum CommandActionDataType {
	Bool = 0,
	Number = 1,
	String = 2,
	Action = 3
}

/**
 * Commands can be limited to function in, or only outside of, contexts that the user enters and exits from.
 * Note: Ordinal position can change, but assigned number should not as this serializes to user-saved data.
 */
export enum CommandContext {
	/** When the user is hovered/interacting with the pattern editor. */
	OnPatternEditor = 0,

	/** When the user is hovered/interacting with the channels editor. */
	OnChannelEditor = 1,

	/** When the user is hovered/interacting with settings in the sidebar. */
	OnSettingsBar = 2,

	/** When playback is actively occurring. */
	LivePlayback = 3,

	/** When a pattern selection exists. */
	PatternSelectionActive = 4,

	/** When a channel selection exists. */
	ChannelSelectionActive = 5,

	/** When the active channel is a modulation channel, since it has so many special rules. */
	ModulationChannelActive = 6,

	/** When there is a MIDI device registered and actively monitored to record. */
	RecordingFromMIDI = 7
}

export interface CommandTargetInfo {
    name: string,
    arguments: CommandArgument[]
}

/**
 * A serializable command argument that defines the argument type (it contains no data of its own). This abstraction
 * allows command targets to associate multiple data types to themselves, which is used for auto input validation and
 * clamping in e.g. commands or scripts.
 */
export class CommandArgument
{
    /** What type of data does this argument deal with? */
    public valueType: CommandActionDataType

    /** For numbers, this is the min and max numeric range. */
    public numberMetadata: { isInt: boolean, min: number, max: number } | undefined

    /** Instantiation is controlled, exposed from functions below. */
	public constructor(type: CommandActionDataType, numberMetadata?: CommandArgument['numberMetadata']) {
        this.valueType = type;
        this.numberMetadata = numberMetadata;
    }

    /** True if non-numeric or if it fits expected integer and min/max range expectations. */
	public validateNumber(input: number, expectInt: boolean): boolean {
		return this.valueType !== CommandActionDataType.Number ||
            (this.numberMetadata !== undefined
            && (expectInt ? Math.trunc(input) === input : true)
            && input >= this.numberMetadata.min && input <= this.numberMetadata.max);
	}

    /** Interprets data as a pos/neg int, assuming validly formatted (check via IsActionValid). Returns the number, or a string error. */
    public GetDataAsInt(actiondata: string, origValue: number, minValue: number, maxValue: number): number | string
    {
        const result = this.GetDataAsNumber(actiondata, origValue, minValue, maxValue);
        return typeof result === 'number' ? Math.trunc(result) : result;
    }

    /** Interprets data as a pos/neg number, assuming validly formatted (check via IsActionValid). */
    public GetDataAsNumber(actiondata: string, origValue: number, minValue: number, maxValue: number): number | string
    {
        let chunks = actiondata.split('|');

        // Interpret a number by itself as setting to that number, e.g. "5" becomes "5|set".
        if (chunks.length !== 2)
        {
            if (!matchNumber.test(actiondata)) {
                return `Expected a strict number, received: ${actiondata}`;
            }
            actiondata = `${actiondata}|set`;
            chunks = actiondata.split('|');
        }

        if (this.valueType !== CommandActionDataType.Number) {
            return "Was expecting command to be a numeric data type.";
        }

        /** Cycles the list of numbers based on the current value. Valid syntaxes:
         * cycle: selects next item, or first item if current value isn't in list.
         * cycle--stop: same as cycle, but does nothing if at end of list.
         * cycle-add: selects next item, or nearest greater number if current value isn't in list.
         * cycle-add-stop: same as cycle-add, but does nothing if at end of list.
         * cycle-sub: selects prev item, or nearest smaller number if current value isn't in list.
         * cycle-sub-stop: same as cycle-sub, but does nothing if at start of list.
         */
        if (chunks[1].startsWith("cycle"))
        {
            const numbers: number[] = [];
            const numberStrings = chunks[0].split(",");
            for (let i = 0; i < numberStrings.length; i++)
            {
                if (!matchNumber.test(actiondata)) {
                    return "Was expecting command to contain purely numeric data with comma delimiters.";
                }

                numbers.push(Math.min(Math.max(+numberStrings[i], minValue), maxValue));
            }

            if (numbers.length === 0)
            {
                 return "Was expecting command to contain at least one number for cycle.";
            }

            const actionDataOptions = chunks[1].split("-");
            const doAdd = actionDataOptions.length > 1 && actionDataOptions[1] === "add";
            const doSub = actionDataOptions.length > 1 && actionDataOptions[1] === "sub";
            const doStop = actionDataOptions.length > 2 && actionDataOptions[2] === "stop";

            // Jump to the exact number.
            let nearestValueIndex = -1;
            let nearestValueDiff = Number.MAX_SAFE_INTEGER;
            for (let i = 0; i < numbers.length; i++)
            {
                // If a number in the cycle is matched, shift to the next/prev.
                if (origValue === numbers[i])
                {
                    if (doSub)
                    {
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
                    (doSub && origValue - numbers[i] > 0 && origValue - numbers[i] < nearestValueDiff))
                {
                    nearestValueIndex = i;
                    nearestValueDiff = origValue - numbers[i];
                }
            }

            // snaps to nearest if set, else jumps to start.
            return (nearestValueIndex !== -1)
                ? numbers[nearestValueIndex]
                : numbers[0];
        }

        let value = origValue;

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
        if (chunks[1].startsWith("random-list"))
        {
            const numbers: number[] = [];
            const numberStrings: string[] = chunks[0].split(",");
            if (numberStrings.length < 1)
            {
                return "Was expecting at least one number to pick from for randomization.";
            }

            for (let i = 0; i < numberStrings.length; i++)
            {
                if (!matchNumber.test(actiondata)) {
                    return "Was expecting random number list to contain purely numeric data with comma delimiters.";
                }

                numbers.push(+numberStrings[i]);
            }

            const pickedNumber = numbers[Math.round(Math.random() * numbers.length)];

            if (chunks[1] === "random-list-set")
            {
                value = clamp(pickedNumber, minValue, maxValue);
            }
            else if (chunks[1] === "random-list-add")
            {
                value = clamp(origValue + pickedNumber, minValue, maxValue);
            }
            else if (chunks[1] === "random-list-sub")
            {
                value = clamp(origValue - pickedNumber, minValue, maxValue);
            }
            else if (chunks[1] === "random-list-mul")
            {
                value = clamp(origValue * pickedNumber, minValue, maxValue);
            }
            else if (chunks[1] === "random-list-div")
            {
                value = clamp(origValue / pickedNumber, minValue, maxValue);
            }

            return value;
        }
        else if (chunks[1].startsWith("random"))
        {
            const numbers: number[] = [];
            const rangeStrings = chunks[0].split(",");
            if (rangeStrings.length !== 2)
            {
                return "Was expecting random range to have two numbers.";
            }

            for (let i = 0; i < rangeStrings.length; i++)
            {
                if (!matchNumber.test(actiondata)) {
                    return "Was expecting random range to contain purely numeric data with comma delimiters.";
                }

                numbers.push(+rangeStrings[i]);
            }

            if (chunks[1] === "random-set")
            {
                value = clamp(numbers[0] + Math.random() * (numbers[1] - numbers[0]), minValue, maxValue);
            }
            else if (chunks[1] === "random-add")
            {
                value = clamp(origValue + (numbers[0] + Math.random()
                    * Math.abs(numbers[1] - numbers[0])), minValue, maxValue);
            }
            else if (chunks[1] === "random-sub")
            {
                value = clamp(origValue - (numbers[0] + Math.random()
                    * Math.abs(numbers[1] - numbers[0])), minValue, maxValue);
            }
            else if (chunks[1] === "random-mul")
            {
                value = clamp(origValue * (numbers[0] + Math.random()
                    * Math.abs(numbers[1] - numbers[0])), minValue, maxValue);
            }
            else if (chunks[1] === "random-div")
            {
                const newVal = numbers[0] + Math.random() * (numbers[1] - numbers[0]);
                value = clamp(newVal === 0 ? maxValue : origValue / newVal, minValue, maxValue);
            }

            return value;
        }

        value = +chunks[0];

        if (chunks[1] === "set")
        {
            value = clamp(value, minValue, maxValue);
        }
        else if (chunks[1] === "add")
        {
            value = clamp(origValue + value, minValue, maxValue);
        }
        else if (chunks[1] === "sub")
        {
            value = clamp(origValue - value, minValue, maxValue);
        }
        else if (chunks[1] === "mul")
        {
            value = clamp(origValue * value, minValue, maxValue);
        }
        else if (chunks[1] === "div")
        {
            value = clamp(value === 0 ? maxValue : origValue / value, minValue, maxValue);
        }
        else if (chunks[1] === "add-wrap")
        {
            let val = origValue + value;
            while (val < minValue) { val += maxValue + (1 - minValue); }
            while (val > maxValue) { val -= maxValue + (1 - minValue); }

            value = clamp(val, minValue, maxValue);
        }
        else if (chunks[1] === "sub-wrap")
        {
            let val = origValue - value;
            while (val < minValue) { val += maxValue + (1 - minValue); }
            while (val > maxValue) { val -= maxValue + (1 - minValue); }

            value = clamp(val, minValue, maxValue);
        }

        return value;
    }

    /**
     * Interprets data as a bool, where t or true is true, f or false is false, and toggle flips the value,
     * assuming validly formatted (check via IsActionValid).
     */
    public GetDataAsBool(actiondata: string, origValue: boolean): boolean | string
    {
        if (this.valueType !== CommandActionDataType.Bool) {
            return "Was expecting command to be of the bool data type.";
        }

        const lower = actiondata.toLowerCase();
        return lower === "toggle"
            ? !origValue
            : lower === "t" || lower === "true";
    }

    /** Verifies the given data is valid for this command argument. */
    public IsActionValid(actionData: string): boolean
    {
        // Numbers must follow the allowed value|type syntaxes and have valid numeric values.
        if (this.valueType === CommandActionDataType.Number)
        {
            // expects format: values|type
            let chunks = actionData.split('|');
            if (chunks.length !== 2) {
                return false;
            }

            const isListType =
                chunks[1] === "cycle" ||
                chunks[1] === "cycle-stop" ||
                chunks[1] === "cycle-add" ||
                chunks[1] === "cycle-add-stop" ||
                chunks[1] === "cycle-sub" ||
                chunks[1] === "cycle-sub-stop" ||
                chunks[1] === "random-list-set" ||
                chunks[1] === "random-list-add" ||
                chunks[1] === "random-list-sub" ||
                chunks[1] === "random-list-mul" ||
                chunks[1] === "random-list-div";

            const isRangeType =
                chunks[1] === "random-add" ||
                chunks[1] === "random-set" ||
                chunks[1] === "random-sub" ||
                chunks[1] === "random-mul" ||
                chunks[1] === "random-div";

            // Type must be recognized.
            if (!isListType && !isRangeType &&
                chunks[1] !== "add" &&
                chunks[1] !== "set" &&
                chunks[1] !== "sub" &&
                chunks[1] !== "mul" &&
                chunks[1] !== "div" &&
                chunks[1] !== "add-wrap" &&
                chunks[1] !== "sub-wrap")
            {
                return false;
            }

            // There must be at least 1 value, and all values must be valid numbers (this is intentional for
            // int types, since float math can still be useful).
            if (isListType || isRangeType)
            {
                const numberStrings = chunks[0].split(",");

                if (numberStrings.length === 0 ||
                    (isRangeType && numberStrings.length !== 2)) {
                    return false;
                }

                for (const numberString in numberStrings)
                {
                    if (!matchNumber.test(numberString)) {
                        return false;
                    }
                }

                return true;
            }

            return matchNumber.test(chunks[0]);
        }

        // Bools must be t or true for true, f or false for false, or toggle to switch when fired.
        if (this.valueType === CommandActionDataType.Bool)
        {
            const actionDataLower = actionData.toLowerCase();
            return actionDataLower === "t" || actionDataLower === "true" ||
                actionDataLower === "f" || actionDataLower === "false" ||
                actionDataLower === "toggle";
        }

        if (this.valueType === CommandActionDataType.String) {
            return true;
        }

        throw new Error("Unhandled shortcut target data type: " + this.valueType);
    }
}

/**
 * Commands are invocable actions with optional arguments and shortcuts, based on a target concept such as Undo or
 * Left selection edge, for which the arguments (if any) are interpreted by HandleCommand().
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

    /**
     * Optionally, a command can have default action data associated for when a command is invoked without a shortcut.
     * This is used by the shortcut-firing implementation if the firing shortcut provides no data itself.
    */
    public DefaultActionData?: string

    /** A list of input sequences that invoke the command (per the default implementation). */
    public Shortcuts: IShortcut[]

    public constructor(name: string, target: CommandTargetName, context: string, shortcuts: IShortcut[], defaultActionData?: string)
    {
        this.Name = name;
        this.Target = target;
        this.Context = context;
        this.Shortcuts = shortcuts;
        this.DefaultActionData = defaultActionData;
    }

    /** Verifies that every shortcut provides valid values for expected arguments. */
    public AreActionsValid(): boolean {
        const numArgs = targets[this.Target].arguments.length;

        if (numArgs === 0 && this.DefaultActionData && this.DefaultActionData !== "") {
            return false;
        }

        for (let i = 0; i < this.Shortcuts.length; i++) {
            if (numArgs === 0 && this.Shortcuts[i].data && this.Shortcuts[i].data !== "") {
                return false;
            }

            if (numArgs > 0 &&
                ((!this.Shortcuts[i].data || this.Shortcuts[i].data === "") &&
                    (!this.DefaultActionData || this.DefaultActionData === "")) ) {
                return false;
            }

            if (this.Shortcuts[i].data) {
                const args = this.Shortcuts[i].data!.split(';');
                if (args.length !== numArgs) {
                    return false;
                }

                for (let i = 0; i < numArgs; i++) {
                    if (!targets[this.Target].arguments[i].IsActionValid(args[i])) {
                        return false;
                    }
                }
            }
        }

        return true;
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
     * Converts and evals a context string like "1 & (2 | 3)" to "true && (false || true)". Numbers are indices in the
     * CommandContexts enum that are true if present in active contexts.
     */
    public static IsContextValid(command: Command, activeContexts: CommandContext[]): boolean {
        if (command.Context === "") { return true; }
        return (new Function(command.Context
            .replaceAll(/[^0-9&\|!\(\) ]/g, "") // keeps only 0-9, space, and: & ! |
            .replaceAll("/&+/g", "&&") // any number of & to &&
            .replaceAll("/|+/g", "||") // any number of | to ||
            .replaceAll(/\d+/g, (str) => { // digits are interpreted as enum values in CommandContext and replaced with "true" or "false"
                return activeContexts.includes(+str) ? "true" : "false";
            })))();
    }

    public static ToJSON(cmd: Command): string {
        return JSON.stringify({
            Name: cmd.Name,
            Target: cmd.Target,
            Context: cmd.Context,
            Shortcuts: cmd.Shortcuts,
            DefaultActionData: cmd.DefaultActionData
        });
    }

    public static FromJSON(json: string): Command[] {
        return (JSON.parse(json) as Command[]).map(entry => new Command(
            entry.Name ?? "",
            entry.Target ?? CommandTargetName.None,
            entry.Context ?? "",
            entry.Shortcuts ?? [],
            entry.DefaultActionData));
    }
}
//#endregion

/** The metadata of all possible targets. Names here are for actions, but argument-less commands often reuse them. */
export const targets: { [key in CommandTargetName]: CommandTargetInfo } = {
    [CommandTargetName.None]: { name: '', arguments: [] },
	[CommandTargetName.CopyInstrument]: { name: 'Copy instrument', arguments: [] },
	[CommandTargetName.CopyPattern]: { name: 'Copy pattern', arguments: [] },
	[CommandTargetName.CutPattern]: { name: 'Cut pattern', arguments: [] },
	[CommandTargetName.DeleteBar]: { name: 'Delete bar', arguments: [] },
	[CommandTargetName.DeleteChannel]: { name: 'Delete channel', arguments: [] },
	[CommandTargetName.DuplicatePattern]: { name: 'Duplicate pattern', arguments: [] },
	[CommandTargetName.EditBeatsPerBar]: { name: 'Edit beats per bar', arguments: [] },
	[CommandTargetName.EditChannelSettings]: { name: 'Edit channel settings', arguments: [] },
	[CommandTargetName.EditCustomSamples]: { name: 'Edit custom samples', arguments: [] },
	[CommandTargetName.EditLimiter]: { name: 'Edit limiter', arguments: [] },
	[CommandTargetName.EditSongEQ]: { name: 'Edit song EQ', arguments: [] },
	[CommandTargetName.EditSongLength]: { name: 'Edit song length', arguments: [] },
	[CommandTargetName.Export]: { name: 'Export song', arguments: [] },
	[CommandTargetName.ExportInstrument]: { name: 'Export instrument', arguments: [] },
	[CommandTargetName.ExtendSelectionLeft]: { name: 'Extend selection left', arguments: [] },
	[CommandTargetName.ExtendSelectionRight]: { name: 'Extend selection right', arguments: [] },
	[CommandTargetName.GenerateEuclideanRhythm]: { name: 'Generate Euclidean Rhythm', arguments: [] },
	[CommandTargetName.HideChannel]: { name: 'Hide channel', arguments: [] },
	[CommandTargetName.Import]: { name: 'Import samples', arguments: [] },
	[CommandTargetName.InsertBarNext]: { name: 'Insert bar in front', arguments: [] },
	[CommandTargetName.InsertBarPrev]: { name: 'Insert bar behind', arguments: [] },
	[CommandTargetName.InsertChannelNext]: { name: 'Insert channel in front', arguments: [] },
	[CommandTargetName.InsertChannelPrev]: { name: 'Insert channel behind', arguments: [] },
	[CommandTargetName.Jummbify]: { name: 'Jummbify', arguments: [] },
	[CommandTargetName.LoopPattern]: { name: 'Loop pattern', arguments: [] },
	[CommandTargetName.MoveChannelDown]: { name: 'Move channel down', arguments: [] },
	[CommandTargetName.MoveChannelUp]: { name: 'Move channel up', arguments: [] },
	[CommandTargetName.MoveNotesSideways]: { name: 'Move notes sideways', arguments: [] },
	[CommandTargetName.MovePatternLeft]: { name: 'Move pattern left', arguments: [] },
	[CommandTargetName.MovePatternRight]: { name: 'Move pattern right', arguments: [] },
	[CommandTargetName.MuteAll]: { name: 'Mute all channels', arguments: [] },
	[CommandTargetName.MuteChannel]: { name: 'Mute channel', arguments: [] },
	[CommandTargetName.NewPattern]: { name: 'New pattern', arguments: [] },
	[CommandTargetName.NewPatternFromEmpty]: { name: 'New pattern from empty', arguments: [] },
	[CommandTargetName.NewSong]: { name: 'New song', arguments: [] },
	[CommandTargetName.NextBar]: { name: 'Next bar', arguments: [] },
	[CommandTargetName.OpenAllFMDropdowns]: { name: 'Open all FM Dropdowns', arguments: [] }, // TODO: what is this...?
	[CommandTargetName.OpenShowChannel]: { name: 'Open show channel', arguments: [] },
	[CommandTargetName.OpenSongPlayer]: { name: 'Open song player', arguments: [] },
	[CommandTargetName.PasteInstrument]: { name: 'Paste instrument', arguments: [] },
	[CommandTargetName.PastePattern]: { name: 'Paste pattern', arguments: [] },
	[CommandTargetName.PastePatternNumbers]: { name: 'Paste pattern numbers', arguments: [] },
	[CommandTargetName.PatternDown]: { name: 'Pattern down', arguments: [] },
	[CommandTargetName.PatternUp]: { name: 'Pattern up', arguments: [] },
	[CommandTargetName.PlayOrPause]: { name: 'Play or pause', arguments: [] },
	[CommandTargetName.PlayAtCursor]: { name: 'Play at cursor', arguments: [] },
	[CommandTargetName.PrevBar]: { name: 'Previous bar', arguments: [] },
	[CommandTargetName.RandomInstrument]: { name: 'Random instrument', arguments: [] },
	[CommandTargetName.Redo]: { name: 'Redo', arguments: [] },
	[CommandTargetName.RemovePattern]: { name: 'Remove pattern', arguments: [] },
	[CommandTargetName.SelectAll]: { name: 'Select all', arguments: [] },
	[CommandTargetName.SelectChannel]: { name: 'Select channel', arguments: [] },
	[CommandTargetName.SelectionDown]: { name: 'Selection down', arguments: [] },
	[CommandTargetName.SelectionUp]: { name: 'Selection up', arguments: [] },
	[CommandTargetName.SnapPlayheadToBeginning]: { name: 'Snap playhead to start', arguments: [] },
	[CommandTargetName.SnapPlayheadToLoopStart]: { name: 'Snap playhead to loop start', arguments: [] },
	[CommandTargetName.SnapPlayheadToSelected]: { name: 'Snap playhead to selected', arguments: [] },
	[CommandTargetName.SoloChannel]: { name: 'Solo channel', arguments: [] },
	[CommandTargetName.SongRecovery]: { name: 'Open song recovery', arguments: [] },
	[CommandTargetName.ToggleRecording]: { name: 'Toggle recording', arguments: [] },
	[CommandTargetName.TransposeDown]: { name: 'Move notes down a step', arguments: [] },
	[CommandTargetName.TransposeOctaveDown]: { name: 'Move notes down an octave', arguments: [] },
	[CommandTargetName.TransposeOctaveUp]: { name: 'Move notes up an octave', arguments: [] },
	[CommandTargetName.TransposeUp]: { name: 'Move notes up a step', arguments: [] },
	[CommandTargetName.Undo]: { name: 'Undo', arguments: [] },
};

// Just to keep below neat
const fromTarget = (target: CommandTargetName, keysPassed: string[], cursorPassed?: CursorButtons[], context?: string) => {
    const cmd = new Command(targets[target].name, target, context ?? "", [ { keys: keysPassed, cursor: cursorPassed ?? [] } ])
    cmd.BuiltInId = target;
    return cmd;
};

/**
 * The built-in commands list, most borrow the display name of their action as most are argument-free, so this is just
 * for the default shortcuts mainly. Note that Control is used by keyboard performance (playing it as a piano) which
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
    fromTarget(CommandTargetName.PlayOrPause, [' ']),
    fromTarget(CommandTargetName.PlayAtCursor, ['SHIFT', ' ']),
    new Command(targets[CommandTargetName.ToggleRecording].name, CommandTargetName.ToggleRecording,
        "", [{ keys: ['CONTROL', ' '], cursor: [] }, { keys: ['CONTROL', 'P'], cursor: [], allowRepeats: true }]),
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

/** For simplicity, input handling is exposed from here. */
export class ShortcutHandler {
    private readonly _recordedInputs: IShortcut = { cursor: [], keys: [] }; // All actively-held inputs.
    private readonly _commandContexts: CommandContext[] = []; // List of active contexts, set by SongEditor.
    private readonly _commandsAvailable: Command[] = []; // List of ALL commands loaded.
    private _commandsNarrowed: Command[] | undefined; // Sub-list of the available commands, for performance in lookups. Undefined = no narrowing.
    private _commandHasFired = false; // If a command fires in early invocation, this prevents it from firing again in late invocation (input release).
    private _onInvoke: (command: Command, actionData?: string | undefined) => void;

    /** Loads the shortcut handler, assembling the available commands list from the built-ins that aren't disabled and a custom list. */
    constructor(disabledBuiltInIDs: number[], customCommands: Command[], onInvoke: (command: Command, actionData?: string | undefined) => void) {
        this._commandsAvailable = builtInCommands.filter(cmd => disabledBuiltInIDs.indexOf(cmd.BuiltInId!) === -1)
            .concat(customCommands);
        this._onInvoke = onInvoke;
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
        // Push and handle shortcuts on keypress. Shortcuts also fire for other input types.
        if (!this._recordedInputs.keys.includes(event.key.toUpperCase())) {
            this._recordedInputs.keys.push(event.key.toUpperCase());
        }

        this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, true, event.repeat);
    }

    /** On key release, first fire late invocation (deferred=false), then remove inputs (compared as uppercase). */
    public handleKeyReleased = (event: KeyboardEvent): void => {
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
        if (!this._recordedInputs.cursor.includes(event.button)) {
            this._recordedInputs.cursor.push(event.button);

            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, true, false);
        }
    }

    /** On mouse button release, fire late invocation (deferred=false). */
    public handleCursorUp = (event: MouseEvent) => {
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
        if (event.deltaY !== 0) {
            this._recordedInputs.cursor.push(event.deltaY > 0 ? CursorButtons.WheelDown : CursorButtons.WheelUp);
            this.matchCommands(this._commandsNarrowed ?? this._commandsAvailable, false, false);
        }

        this._recordedInputs.cursor = this._recordedInputs.cursor.filter(o => o !== CursorButtons.WheelDown && o !== CursorButtons.WheelUp);
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
        const candidates: { cmd: Command, data?: string }[] = [];
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
                    else if (Command.IsContextValid(command, this._commandContexts)) {
                        if ((!isRepeating || command.Shortcuts[i].allowRepeats)) {
                            candidates.push({ cmd: command, data: command.Shortcuts[i].data ?? command.DefaultActionData });
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

        candidates.forEach(o => this._onInvoke(o.cmd, o.data));
        if (candidates.length > 0) {
            this._commandHasFired = true;
        }
    }
}