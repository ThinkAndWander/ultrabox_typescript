// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import { HTML } from "imperative-html/dist/esm/elements-strict";
import { Prompt } from "./Prompt";
import { SongDocument } from "./SongDocument";
import { Config } from "../synth/SynthConfig";

const { button, div, p, span, h2, h3, ul, li } = HTML;

export class TipPrompt implements Prompt {
	private readonly _closeButton: HTMLButtonElement = button({class: "cancelButton"});
	private readonly _prevButton: HTMLButtonElement = button({}, "Back");
	private readonly _nextButton: HTMLButtonElement = button({}, "Next");
	private readonly _footer: HTMLDivElement = div();
	private messages: HTMLDivElement[] = [];
	private page: number = 0;
		
	public readonly container: HTMLDivElement;
		
	constructor(private _doc: SongDocument, type: string) {
		switch (type) {
			case "scale": {
				this.messages = [div(
					h2("Scale"),
					p("This setting limits the available pitches for adding notes. You may think that there's no point in limiting your choices, but the set of pitches you use has a strong influence on the mood and feel of your song, and these scales serve as guides to help you choose appropriate pitches. Don't worry, you can change the scale at any time, so you're not locked into it. Try making little melodies using all the available pitches of a scale to get a sense for how it sounds."),
					p("The most common scales are major and minor. Assuming your song uses all pitches in the scale and especially \"tonic\" pitches (the purple rows in the pattern editor) then major scales tend to sound more playful or optimistic, whereas minor scales sound more serious or sad."),
				)];
			} break;
			case "selectionMerge": {
				this.messages = [div(
					h2("Merge"),
					p("This makes notes that touch turn into one continuous note. If \"All\" is active, it will merge all notes no matter what, and will even shift notes if it helps to connect them."),
					p("Merge affects on-screen notes that fit within your selection. It also works across channel selections.")
				)];
				break;
			}
			case "selectionBridge": {
				this.messages = [div(
					h2("Bridge"),
					p("This creates notes in the empty space to the right of other notes, or extends existing ones if \"Grow\" is active."),
					p("If \"Bend\" is active, the new notes will end at the starting pitch of the next note except in drum channels, which always fade out."),
					p("Bridge affects only notes in the selected range, or all notes on the pattern(s) if none are selected.")
				)];
				break;
			}
			case "selectionSpread": {
				this.messages = [div(
					h2("Spread"),
					p("This spreads notes to be evenly-spaced in the selection. If only one note is selected, it centers it."),
					p("If \"Pitch\" is active, it spreads the notes vertically like a staircase going up (crescendo) or down (decrescendo), whichever is closer."),
					p("If \"Stack\" is active, it removes all spaces between notes, stacking on the left side of the selection, or bottom if \"Pitch\" is also active."),
					p("Spread affects on-screen notes that fit within your selection. It also works across channel selections.")
				)];
			} break;
			case "selectionMirror": {
				this.messages = [div(
					h2("Mirror"),
					p("The mirror operations cause notes to appear at the opposite ends, proportionally, of the range. For vertical mirror, the range is detected as the distance from lowest and highest existing notes."),
					p("Mirror affects on-screen notes that fit within your selection. It also works across channel selections.")
				)];
			} break;
			case "selectionFlatten": {
				this.messages = [div(
					h2("Flatten"),
					p("This removes all pitch bends from notes."),
					p("If \"Pitch\" is active, it also sets the notes to the average of their pitches."),
					p("If \"Vol\" is active, it resets all parts of notes to the default volume and does nothing else."),
					p("Flatten affects on-screen notes that fit within your selection. It also works across channel selections.")
				)];
			} break;
			case "selectionSplit": {
				this.messages = [div(
					h2("Split"),
					p("This makes a number of evenly-spaced cuts in the selected range, which separate notes. Normally it just cuts every note into even pieces."),
					p("If \"Across\" is active, instead of cutting each note X times, it makes X cuts in total across the selection."),
					p("If \"Absolute\" is active, it makes cuts every X parts instead of making X cuts, e.g. '4' would make a cut every four time units instead of making only four cuts."),
					p("Split affects on-screen notes that fit within your selection. It also works across channel selections.")
				)];
			} break;
			case "selectionVolOps": {
				this.messages = [div(
					h2("Volume operations"),
					p("These buttons adjust volume for the whole pattern, or the selection, even selections that include parts of notes."),
					p("These are the operations in order from top-left to bottom-right:"),
					div({ style: "font-style: italic; padding-top: 12px" }, "Volume up/down"),
					div("Doubles or halves the volume"),
					div({ style: "font-style: italic; padding-top: 12px" }, "Volume fade out/in"),
					div("Fade the selection to zero at the end or start"),
					div({ style: "font-style: italic; padding-top: 12px" }, "Volume gain end/start"),
					div("Doubles volume of the selection at the end or start (opposite of fade)"),
					div({ style: "font-style: italic; padding-top: 12px" }, "Volume studio fade out/in"),
					div("Like the volume fade operations, but with a quadratic curve so the fade is strong at the center, gradual at the ends"),
					div({ style: "font-style: italic; padding-top: 12px" }, "Maximize contrast"),
					div("Stretches the loudest notes to max volume, quietest notes to total silence, and everything between accordingly.")
				)];
			} break;
			case "selectionFunction": {
				this.messages = [div(
					h2("Function"),
					p("Select a preset and click the triangle (run) button to perform it. Try out the presets, or click the names of settings for a rundown on how they work."),
					h3("How it works"),
					p("Basically, a function works with note volumes, pitch bends, or overall pitch of a note. See the tip for \"Affect\"."),
					p("How it works is to use any number of values or expressions, separated by commas, like \"1\" or \"1,2,3\". But it also needs to know \*how\* to apply those values. See the tip for \"Behavior\"."),
				), div(
					h2("Expression variables"),
					p("You can mix math into the number arrays, like \"1, 2 * sin(x), 0\" just like the presets. Invalid math is ignored. You can also use these special variables!"),
					p({}, span({ style: "font-style: italic;" }, "x, prev "), "The current or previous volume, bend or pitch, where prev is -1 for the first value"),
					p({}, span({ style: "font-style: italic;" }, "num, len "), "Number and length form a ratio of current/total for the note, pin #, or time value"),
					p({}, span({ style: "font-style: italic;" }, "low, high, avg "), "The smallest, biggest and average volume, bend or pitch in the selection, if any"),
					p({}, span({ style: "font-style: italic;" }, "maxrange, minrange "), "The max or min allowed volume or pitch, where minrange can be negative for modulation"),
				), div(
					h2("Expression advanced"),
					p("Other variables are composed of a few words at a time, like \"pitchesmax\" or \"vol\". These let you work with detailed info."),
					p("Use (pitches or bends or vols) then (max or min or avg) such as volsmin, pitchesmax, bendsavg, etc."),
					p("Use (pitch or bend or vol) then optionally (max or min or avg or prev) such as pitch or bendmax or volprev. Using the base word like pitch gets the current value. The current/previous volume/bend are only available when targeting either of those.")
				), div(
					h2("Expression math"),
					p("Any function in the Javascript \"Math\" object can be used, with parentheses like sin(5):"),
					p({}, span({ style: "font-style: italic;" }, "pi, sin(x), cos(x), tan(x) "), "The constant PI and the sine, cosine and tangent functions. Useful for wobbles"),
					p({}, span({ style: "font-style: italic;" }, "abs(x), sign(x) "), "The absolute value function and sign functions. Useful for forcing or detecting if a value is positive"),
					p({}, span({ style: "font-style: italic;" }, "ceil(x), round(x), floor(x) "), "The rounding functions. Ceiling only rounds up and floor rounds down"),
					p({}, span({ style: "font-style: italic;" }, "pow(x,y) "), "Takes two numbers and raises the first to the power of the second. Equivalent to \"x ** y\""),
					p({}, span({ style: "font-style: italic;" }, "max(x,y), min(x,y) "), "Maximum and minimum, which compare two numbers and returns the greatest or smallest value. Useful to cap values"),
					p({}, span({ style: "font-style: italic;" }, "random() "), "Takes no numbers. Generates a random value between 0 and 1 like 0.3542. Useful for random variation."),
				)];
			} break;
			case "selectionStepAffect": {
				this.messages = [div(
					h2("Affect"),
					p("You can change the volume/pitch and pitch bends of notes, or affect pitch in non-modulation channels. Note: there are limits on how many pitches and volume values exist, which affects output quality."),
					p(`Volume goes up to ${Config.noteSizeMax} except in mod channels where it depends on the target and can be negative.`),
					p(`Pitch goes up to ${Config.maxPitch} in pitch channels, ${Config.drumCount - 1} in drum channels, and is disabled in mod channels. Base pitch affects whole notes at once, while pitch bends can change pins.`)
				)];
			} break;
			case "selectionStepBehavior": {
				this.messages = [div(
					h2("Behavior"),
					p("This decides which number to use in the add/multiply list of values."),
					p("\"Step\" gives an even amount of time to use each number in the array, from left to right. adding \"x, 1\" would add x until halfway when it switches to 1."),
					p("\"Stretch\" is like Step, but it blends the results, e.g. adding \"x, 1\" would add x at first, averaging to 1 at the end."),
					p("\"Cycle\" doesn't give an even amount of time to each number. Instead, it just picks the next number in the list, wrapping around. E.g. \"x, 1\" would pick x,1,x,1,...")
				)];
			} break;
			case "selectionStepArrays": {
				this.messages = [div(
					h2("Add and Multiply by"),
					p("These are the instructions on what to add or multiply by as the function runs."),
					p("Each array can have any number of expressions separated by commas. It can be as simple as a number \"5\" or as complex as \"sin(num)\". "
						+ "Multiple values would look something like \"5, 7, sin(x) + 1, 6\"."),
					p("First, multiplication is performed, and then addition.")
				)];
			} break;
			case "selectionModTarget": {
				this.messages = [div(
					h2("Modulation track to affect"),
					p("Which modulation channel to affect, #1 is the top track, #2 is the track below it, and so on.")
				)]
			} break;
			case "key": {
				this.messages = [div(
					h2("Song Key"),
					p("This setting can shift the frequency of every note in your entire song up or down, keeping the \"tonic\" pitches (the brown rows in the pattern editor) aligned with the selected \"key\" pitch."),
					p("If you've already placed some notes but they don't emphasize \"tonic\" pitches then the selected key isn't very meaningful. You can select the \"Detect Key\" option in the key menu to automatically align the most emphasized notes with \"tonic\" pitches."),
				)];
			} break;
			case "key_octave": {
				this.messages = [div(
					h2("Octave"),
					p("This setting can shift the \"key\" by an octave, allowing you to use a B- or C+ key."),
					p(`This goes from ${Config.octaveMin} to ${Config.octaveMax}.`),
				)];
			} break;
			case "tempo": {
				this.messages = [div(
					h2("Song Tempo"),
					p("This setting controls the speed of your song, measured in beats-per-minute. A \"beat\" is the duration of the little gray rectangles in the pattern editor. (In conventional music notation, a \"quarter note\" is usually equivalent to \"beat\".)"),
				)];
			} break;
			case "reverb": {
				this.messages = [div(
					h2("Reverb"),
					p("Reverb is like a continuous echo effect. A little bit helps instruments sound more natural. Adding a lot of reverb can add sense of depth or mystery, but too much reverb can kinda \"smear\" sounds so that it's harder to distinguish notes or instruments, especially for lower \"bass\" notes."),
				)];
			} break;
			case "rhythm": {
				this.messages = [div(
					h2("Rhythm"),
					p("This setting determines how beats are divided. The pattern editor helps you align notes to fractions of a beat based on this setting."),
					p("If you've already placed some notes but they don't align with the selected rhythm, you can select the \"Snap Notes To Rhythm\" option in the rhythm menu to force the notes in the currently selected pattern(s) to align with the selected rhythm."),
				)];
			} break;
			case "instrumentIndex": {
				this.messages = [div(
					h2("Instrument Number"),
					p("In the \"Channel Settings\" option from UltraBox's \"Edit\" menu, there are a few ways to enable multiple instruments per channel."),
					p("First, you could enable multiple simultaneous instruments per channel. All of the channel's instruments will play all of the notes in the channel at the same time, and you can click an instrument number to view and edit its settings."),
					p("Second, you could enable different instruments per pattern. Only one of the instruments will play at any given time, but you can click the instrument number to change which instrument is used for the currently selected pattern(s)."),
					p("Finally, you can enable them both, in which case you can click an instrument number once to view it, and again to toggle whether the instrument is used for the currently selected pattern(s)."),
					p("Either way, you can click the + button to add more instruments to a channel, and you can press shift and a number key on your keyboard to select an instrument as if you had clicked the corresponding button here."),
				)];
			} break;
			case "instrumentVolume": {
				this.messages = [div(
					h2("Instrument Volume"),
					p("This setting controls the volume of the selected instrument without affecting the volume of the other instruments. This allows you to balance the loudness of each instrument relative to each other."),
					p("Please be careful when using volume settings above 0. This indicates amplification and too much of that can trip the audio limiter built into this tool. This can lead to your song sounding muffled if overused. But when used carefully, amplification can be a powerful tool!"),
				)];
			} break;
			case "pan": {
				this.messages = [div(
					h2("Instrument Panning"),
					p("If you're listening through headphones or some other stereo sound system, this controls the position of the instrument and where the sound is coming from, ranging from left to right."),
					p("As a suggestion, composers often put lead melodies, drums, and basses in the center, and spread other instruments toward either side. If too many instruments seem like they're coming from the same place, it can feel crowded and harder to distinguish individual sounds, especially if they cover a similar pitch range."),
				)];
			} break;
			case "panDelay":
				{
					this.messages = [div(
						h2("Stereo Delay"),
						p("When panning, a slight delay is often added between the left and right ear to help make a sound feel more 'directional'. For example, in the real world your left ear will hear a sound coming from the left just slightly before the right ear."),
						p("This setting controls how much delay is added. When this is set to minimum, panning only affects the volume of the left/right ear without changing the delay. This can help to get a more 'uniform' feeling sound, which can be desirable for making 8-bit music.")
					)];
				}
				break;
			case "arpeggioSpeed":
				{
					this.messages = [div(
						h2("Arpeggio Speed"),
						p("This setting affects how fast your chord will 'arpeggiate', or cycle between notes. With a fast arpeggio speed it will sound rapid-fire, with a slow speed you can hear each note one after another.")
					)];
				}
				break;
			case "twoNoteArpeggio":
				{
					this.messages = [div(
						h2("Faster Two-Note Arpeggio"),
						p("This setting makes arpeggios with only two notes in them happen twice as fast. Arpeggios with more notes in them are unaffected.")
					)];
				}
				break;
			case "detune": {
				this.messages = [div(
					h2("Detune"),
					p("This setting can be used to finely control the pitch of your instrument. It is in units of 'cents', 100 of which equal a pitch shift of one semitone."),
					p("Careful - you can quickly get very dissonant sounding songs by using this setting."),
				)];
			} break;
			case "instrumentType": {
				this.messages = [div(
					h2("Instrument Type"),
					p("UltraBox comes with many instrument presets, try them out! You can also create your own custom instruments!"),
					p("There are also buttons for copying and pasting instruments at the bottom of the instrument settings tab, and for generating random instruments in the \"Randomize\" category in the instrument type menu."),
				)];
			} break;
			case "eqFilter": {
				this.messages = [div(
					h2("EQ Filter"),
					p("Filters are a way of emphasizing or diminishing different parts of a sound. Musical notes have a fundamental (base) frequency, but the sound of a musical note also has parts at higher frequencies and filters can adjust the volume of each of these parts based on their frequency."),
					p("Click in the filter editor to insert, delete, or drag a filter control point. The horizontal position of the point determines which frequencies it affects, and the vertical position determines how the volume is affected at that frequency."),
					p("Insert a new point on the left side of the filter editor to add a \"high-pass\" filter point, which additionally reduces the volume of lower frequencies, or insert a new point on the right side to add a \"low-pass\" filter point which reduces the volume of higher frequencies."),
					p("You can also enable a \"Note Filter\" as an effect. EQ and note filters are mostly the same, but have different purposes. EQ filters are for overall adjustments, whereas note filters are for dynamic control and can be moved with envelopes. Note filters also change how the distortion effect sounds."),
				)];
			} break;
			case "noteFilter": {
				this.messages = [div(
					h2("Note Filter"),
					p("Note filters are mostly the same as EQ filters, but have a different purpose. EQ filters are for overall adjustments, whereas note filters are for dynamic control and can be moved with envelopes. Note filters also change how the distortion effect sounds."),
					p("Filters are a way of emphasizing or diminishing different parts of a sound. Musical notes have a fundamental (base) frequency, but the sound of a musical note also has parts at higher frequencies and filters can adjust the volume of each of these parts based on their frequency."),
					p("Click in the filter editor to insert, delete, or drag a filter control point. The horizontal position of the point determines which frequencies it affects, and the vertical position determines how the volume is affected at that frequency."),
					p("Insert a new point on the left side of the filter editor to add a \"high-pass\" filter point, which additionally reduces the volume of lower frequencies, or insert a new point on the right side to add a \"low-pass\" filter point which reduces the volume of higher frequencies."),
				)];
			} break;
			case "fadeInOut": {
				this.messages = [div(
					h2("Fade In/Out"),
					p("This setting controls how long it takes for notes to reach full volume at the beginning or decay to silence at the end."),
					p("An instant fade-in sounds like instruments that are played by hitting or plucking, whereas slower fade-ins sound like instruments that are played by blowing air."),
					p("You can also make the fade-out start before the note ends to leave a gap before the next note starts, or after the note ends to allow the sound of the end of the note to overlap with the start of the next note."),
				)];
			} break;
			case "transition": {
				this.messages = [div(
					h2("Transition"),
					p("Usually, when one note ends at the same time another begins, the old note will fade out and the new note will fade in based on the fade in/out settings, but this setting can override that, connecting the end of one note to the beginning of the next."),
					p("The \"interrupt\" transition makes the wave suddenly change from the old note's frequency to the new note's frequency without any fading, but still restarts envelopes at the beginning of the new note. The \"continue\" transition is similar but it doesn't even restart envelopes, and can be used to make each of the notes in a chord start or stop at different times!"),
					p("The \"slide\" transition makes the pitch shift quickly but not instantaneously from the old note's frequency to the new note's frequency, and softly restarts envelopes. The \"slide in pattern\" transition is the same except it doesn't connect the last note in a pattern to the first note in the next pattern."),
				)];
			} break;
			case "chipWave": {
				this.messages = [div(
					h2("Chip Wave"),
					p("UltraBox comes with some sound waves based on classic electronic sound chips, as well as several unique waves. This is the basic source of the sound of the instrument, which is modified by the other instrument settings."),
				)];
			} break;
			case "chipNoise": {
				this.messages = [div(
					h2("Noise"),
					p("UltraBox comes with several basic noise sounds. These do not have any distinct musical pitch, and can be used like drums to create beats and emphasize your song's rhythm."),
				)];
			} break;
			case "supersawDynamism": {
				this.messages = [div(
					h2("Supersaw Dynamism"),
					p("A supersaw is a combination of many sawtooth waves, and this setting controls the contribution of extra sawtooth waves."),
					p("At the low end of the slider, only the first wave is contributing to the sound, which sounds like an ordinary static sawtooth wave. At the maximum setting, all of the waves are contributing equally and the resulting tone can randomly shift depending on how the waves line up with each other, similar to the \"unison\" and \"chorus\" settings."),
				)];
			} break;
			case "supersawSpread": {
				this.messages = [div(
					h2("Supersaw Spread"),
					p("A supersaw is a combination of many sawtooth waves, and this setting controls the distance between their frequencies. The dynamism setting must be used for the extra waves to have any effect."),
					p("At the low end of the spread slider, all of the voices have the same frequency but random phase, resulting in a different sound every time a note starts. In the middle, the waves all have slightly different frequencies that shift in and out of phase over time similar to the \"unison\" and \"chorus\" settings, creating a classic supersaw sound. At the extreme end, the frequencies are so far apart they sound dissonant."),
				)];
			} break;
			case "supersawShape": {
				this.messages = [div(
					h2("Supersaw Shape"),
					p("This supersaw instrument includes an option to change the shape of the waves from sawtooth waves to pulse waves. Use this setting to morph between the two shapes."),
					p("When a pulse wave shape is used, you can also control the pulse width with a separate setting."),
				)];
			} break;
			case "pulseWidth": {
				this.messages = [div(
					h2("Pulse Wave Width"),
					p("This setting controls the shape and sound of a pulse wave. At the minimum width, it sounds light and buzzy. At the maximum width, it is shaped like a classic square wave."),
				)];
			} break;
			case "unison": {
				this.messages = [div(
					h2("Unison"),
					p("This instrument can play two identical waves at different frequencies. When two waves play at slightly different frequencies, they move in and out of phase with each other over time as different parts of the waves line up. This creates a dynamic, shifting sound. Pianos are a common example of this kind of sound, because each piano key strikes multiple strings that are tuned to slightly different frequencies."),
					p("The distance between two frequencies is called an \"interval\", and this setting controls how large it is. If the interval is too wide, then the waves may sound out-of-tune and \"dissonant\". However, if the interval is even larger, then the two frequencies can even be distinct pitches."),
				)];
			} break;
			case "chords": {
				this.messages = [div(
					h2("Chords"),
					p("When multiple different notes occur at the same time, this is called a chord. Chords can be created in UltraBox's pattern editor by adding notes above or below another note."),
					p("This setting determines how chords are played. The standard option is \"simultaneous\" which starts playing all of the pitches in a chord at the same instant. The \"strum\" option is similar, but plays the notes starting at slightly different times. The \"arpeggio\" option is used in \"chiptune\" style music and plays a single tone that rapidly alternates between all of the pitches in the chord."),
					p("Some UltraBox instruments have an option called \"custom interval\" which uses the chord notes to control the interval between the waves of a single tone. This can create strange sound effects when combined with FM modulators."),
				)];
			} break;
			case "vibrato": {
				this.messages = [div(
					h2("Vibrato"),
					p("This setting causes the frequency of a note to wobble slightly. Singers and violinists often use vibrato."),
				)];
			} break;
			case "vibratoDepth":
				{
					this.messages = [div(
						h2("Vibrato Depth"),
						p("This setting affects the depth of your instrument's vibrato, making the wobbling effect sound stronger or weaker.")
					)];
				} break;
			case "vibratoDelay":
				{
					this.messages = [div(
						h2("Vibrato Delay"),
						p("This setting changes when vibrato starts to kick in after a note is played. Vibrato is most common for long held notes and less common in short notes, so this can help you achieve that effect.")
					)];
				} break;
			case "vibratoSpeed":
				{
					this.messages = [div(
						h2("Vibrato Speed"),
						p("This setting determines how fast the vibrato's up-and-down wobble effect will happen for your instrument.")
					)];
				}
				break;
			case "vibratoType":
				{
					this.messages = [div(
						h2("Vibrato Type"),
						p("This determines the way vibrato causes your instrument's pitch to wobble. The normal type is smooth up and down, the shaky type is chaotic.")
					)];
				}
				break;
			case "algorithm": {
				this.messages = [div(
					h2("FM Algorithm"),
					p('FM Synthesis is a mysterious but powerful technique for crafting sounds, popularized by Yamaha keyboards and the Sega Genesis/Mega Drive. It may seem confusing, but try playing around with the options until you get a feel for it, or check out some of the preset examples!'),
					p('This FM synthesizer uses up to four waves, numbered 1, 2, 3, and 4. Each wave may have its own frequency and volume.'),
					p('There are two kinds of waves: "carrier" waves play a tone out loud, but "modulator" waves distort other waves instead. Wave 1 is always a carrier and plays a tone, but other waves may distort it. The "Algorithm" setting determines which waves are modulators, and which other waves those modulators distort. For example, "1←2" means that wave 2 modulates wave 1, and wave 1 plays out loud.'),
				)];
			} break;
			case "feedbackType": {
				this.messages = [div(
					h2("Feedback Type"),
					p('Modulators distort in one direction (like 1←2), but you can also use the feedback setting to make any wave distort in the opposite direction (1→2), or even itself (1⟲).'),
				)];
			} break;
			case "feedbackVolume": {
				this.messages = [div(
					h2("Feedback Distortion"),
					p("This setting controls the amount of feedback distortion based on the feedback type setting."),
				)];
			} break;
			case "operatorFrequency": {
				this.messages = [div(
					h2("Operator Frequency"),
					p('This setting controls the frequency of an individual FM wave, relative to the fundamental frequency of the note. The multiplier 1× is the same as the fundamental frequency, whereas 2x would be an octave (12 semitones) above it. The frequencies with a "~" are slightly detuned and shift in and out of phase over time compared to the other frequencies.'),
					p('Try different combinations of a "carrier" wave and a "modulator" wave with different frequencies to get a feel for how they sound together.'),
				)];
			} break;
			case "operatorVolume": {
				this.messages = [div(
					h2("Operator Volume"),
					p("This setting controls the volume of \"carrier\" waves, or the amount of distortion that \"modulator\" waves apply to other waves."),
				)];
			} break;
			case "spectrum": {
				this.messages = [div(
					h2("Spectrum"),
					p("This setting allows you to draw your own noise spectrum! This is good for making drum sounds."),
					p("If you only use certain frequencies and a soft fade in/out, it's also possible to make howling wind sounds or even musical wind instruments."),
					p("The left side of the spectrum editor controls the noise energy at lower frequencies, and the right side controls higher frequencies."),
				)];
			} break;
			case "harmonics": {
				this.messages = [div(
					h2("Harmonics"),
					p("This setting allows you to design your own sound wave! Most musical waves are actually a combination of sine waves at certain frequencies, and this lets you control the volume of each sine wave individually."),
					p("The left side of the harmonics editor controls the sine wave volumes at lower frequencies, and the right side controls higher frequencies."),
				)];
			} break;
			case "effects": {
				this.messages = [div(
					h2("Effects"),
					p("UltraBox has many different kinds of special effects you can add to instruments. You can turn on multiple effects at once, and they can be configured individually. Try them all out!"),
				)];
			} break;
			case "drumsetEnvelope": {
				this.messages = [div(
					h2("Drumset Envelope"),
					p("This drumset comes with a low-pass filter, and this setting can dynamically change the low-pass filter frequency over time. Each row in the pattern editor can have a different envelope shape."),
				)];
			} break;
			case "drumsetSpectrum": {
				this.messages = [div(
					h2("Drumset Spectrum"),
					p("This setting allows you to draw your own noise spectrum! This is good for making drumsets. Each row in the pattern editor gets its own spectrum."),
					p("The left side of the spectrum editor controls the noise energy at lower frequencies, and the right side controls higher frequencies."),
				)];
			} break;
			case "chorus": {
				this.messages = [div(
					h2("Chorus"),
					p("The chorus effect combines multiple copies of the instrument's sound and adds a bit of vibrato to simulate an ensemble of instruments or voices. Drag the slider to control how much chorus is added."),
				)];
			} break;
			case "echoSustain": {
				this.messages = [div(
					h2("Echo Volume"),
					p("The echo effect repeats the instrument's sound after a delay. Each echo is a little bit quieter than the last, and this setting controls how much quieter."),
				)];
			} break;
			case "echoDelay": {
				this.messages = [div(
					h2("Echo Delay"),
					p("The echo effect repeats the instrument's sound after a delay, and this setting controls how long the delay is."),
				)];
			} break;
			case "pitchShift": {
				this.messages = [div(
					h2("Pitch Shift"),
					p("This setting makes instruments play higher or lower pitches than the ones displayed in the pattern editor. Be careful that you don't confuse yourself!"),
					p("You can combine this with envelopes to bend pitch over time, or play multiple simultaneous instruments with different pitch shifts for interesting layered sounds."),
					p("The intervals created by this setting are in \"just intonation\" which means they stay in phase with the original pitch instead of shifting in and out of phase over time. If you want the shifting, add the detune effect!"),
				)];
			} break;
			case "detune": {
				this.messages = [div(
					h2("Detune"),
					p("This setting slightly adjusts the frequency of notes played by the instrument. You can use a little bit to add a pleasing shifting sound similar to the \"unison\" feature when combined with other instruments. If you use too much, then the instrument may sound unpleasantly out-of-tune."),
				)];
			} break;
			case "distortion": {
				this.messages = [div(
					h2("Distortion"),
					p("This is the famous electric guitar effect! However, there are some things to be aware of."),
					p("First, most chords don't sound right when combined with heavy distortion. The only chords commonly used with distorted electric guitars are \"power chords\" which consist of a root note, a \"fifth\" note above that, and/or any octaves of those two notes."),
					p("Second, the distortion sound depends a lot on filtering. In particular, I recommend enabling the note filter effect, and adding both high-pass and low-pass points to the note filter. (Note filters are applied first, then distortion which transforms the sound based on that filtering, then the EQ filter is applied last.)"),
					p("Finally, I recommend adjusting the fade-out setting to allow the end of each note to overlap a little bit with the beginning of the next, but not too much!"),
				)];
			} break;
			case "bitcrusherQuantization": {
				this.messages = [div(
					h2("Bitcrusher Quantization"),
					p("This effect makes stuff sounds harsher, artificial, and \"low quality\", which is great if that's what you're going for!"),
				)];
			} break;
			case "bitcrusherFreq": {
				this.messages = [div(
					h2("Frequency Quantization"),
					p("The bitcrusher effect comes with an additional frequency quantization effect! This is a fun one to play with, especially when combined with the note filter effect."),
					p("Every other notch on this slider is aligned with the currently selected key of the song, and the in-between notches are aligned with the tritones of the key."),
				)];
			} break;
			case "envelopes": {
				this.messages = [div(
					h2("Envelopes"),
					p("Envelopes are a way to dynamically adjust various other settings over time, usually based on how long the note lasts. Press the + button to add an envelope, then use the menus below to select which setting to control and the curve of the envelope. Try different combinations to see how they sound!"),
					p("Most envelope curves restart from the beginning every time a new note plays. The \"note size\" option is based on the note width as drawn in the pattern editor."),
					p("Envelope curves move in the range from 0 to 1 (or vice versa), where 0 means as quiet as possible and 1 is the same as the corresponding position selected in the instrument settings above. If multiple envelopes are targetting the same setting, they are multiplied before applying to the setting."),
				)];
			} break;
			case "discreteEnvelope": {
				this.messages = [div(
					h2("Use Discrete Envelopes?"),
					p("Envelopes are usually interpolated, meaning they change continuously and smoothly. This setting, when ticked, makes envelopes not interpolate. It's a small difference, but can be helpful for some chip noises, and it's most noticeable with the 'blip' transitions."),
				)];
			} break;
			case "envelopeSpeed": {
				this.messages = [div(
					h2("Envelope Speed"),
					p("This setting controls the speed of ALL envelopes for the instrument. Each envelope 'plays' at a certain speed, and this slider can scale it to play faster or slower. Use this to fine-tune your tremolo or how fast something decays to get just the right effect."),
					p("Note that, while this setting is limited in the sense that it controls all envelopes at once, you can still achieve a variety of outcomes by trying combinations of modes of each envelope type, which typically differ only in speed."),
				)];
			} break;
			case "usedInstrument": {
				this.messages = [div(
					h3("'Is this instrument used somewhere else?'"),
					p("This indicator will light up when the instrument you're currently looking at is used in another place in your song (outside the selection)."),
					p("This can be useful when you're not sure if you've used the instrument before and making edits carelessly could change other parts of the song."),
				)];
			} break;
			case "usedPattern": {
				this.messages = [div(
					h3("'Is this pattern used somewhere else?'"),
					p("This indicator will light up when the pattern you're currently looking at is used in another place in your song (outside the selection)."),
					p("This can be useful when you're not sure if you've used the pattern before and making edits carelessly could change other parts of the song."),
				)];
			} break;
			case "modChannel": {
				this.messages = [div(
					h2("Modulator Channel"),
					p("Modulators can be used to change settings in your song automatically over time. This technique is also known as automation."),
					p("This setting controls which channel the modulators will take effect for. If you choose 'Song', you can change song-wide settings too!"),
				)];
			} break;
			case "modInstrument": {
				this.messages = [div(
					h2("Modulator Instrument"),
					p("Modulators can be used to change settings in your song automatically over time. This technique is also known as automation."),
					p("This setting controls which instrument your modulator will apply to within the given channel you've chosen."),
					p("If you choose 'all', every instrument in the channel will be affected. If you choose 'active', just the current ones used in this pattern will be instead."),
					p("Note that with 'all' or 'active', effects will only be applied to instruments that the effect is applicable on. For example if an instrument does not have panning effects, modulating panning will not affect it.")
				)];
			} break;
			case "modSet": {
				this.messages = [div(
					h2("Modulator Setting"),
					p("This is the parameter that you want to change with this modulator. For example, if you set this to 'Tempo', you can speed up or slow down your song by laying notes in the pattern editor."),
					p("Note that you'll see different options if your channel is set to 'Song' versus a channel number. With 'Song', you'll see song-wide settings such as tempo. With a channel, you'll see specific instrument settings. Adding more effects to the instrument causes modulators for them to be available, so be sure to experiment!"),
					p("Most modulators behave as you'd expect and work just as if you were moving their associated slider. Click the '?' when you have a setting selected to get more info about it!"),
				)];
			} break;
			case "modFilter": {
				this.messages = [div(
					h2("Filter Target"),
					p("This setting specifies which parameter of your targeted filter you would like to change."),
					p("With the 'morph' setting, the note value for your modulator represents the number of a subfilter to 'morph' into over time. For example, dragging a note from 0 to 7 will morph from your main filter to the 7th subfilter. To change how your subfilters are set up, click the '+' button on the target filter."),
					p("With a Dot setting, you can fine-tune the exact location of every dot on your filter graph. Note that this is extremely intensive if you want to modulate all dots - a morph is better in that case - but this can come in handy for small adjustments."),
				)];
			} break;
			case "transitionBar": {
				this.messages = [div(
					h2("Tie Notes Over Bars"),
					p("With this option ticked, notes won't transition across bars if you put notes with the same pitches at the start of the next bar. Instead they will 'tie over' and sound like one long note."),
				)];
			} break;
			case "clicklessTransition": {
				this.messages = [div(
					h2("Clickless Transition"),
					p("Sometimes, seamless and other transition types can make audible 'clicks' when changing between notes. Ticking this option will cause those clicks to be silenced as much as possible."),
				)];
            } break;
			case "aliases": {
				this.messages = [div(
					h2("Aliasing"),
					p("UltraBox applies a technique called 'anti-aliasing' to instruments normally to help them sound cleaner even at high frequencies and low sample rates."),
					p("When this setting is ticked that technique is disabled, so you may hear strange audio artifacts especially at high pitches and when bending notes. However, this can lend a grungy sound to an instrument that could be desirable."),
				)];
			} break;
            case "operatorWaveform": {
                this.messages = [div(
                    h2("Operator Waveform"),
                    p('This setting controls the what kind of sound wave an individual FM wave uses.'),
                    p('By defualt the FM synth uses sinewaves.'),
                )];
            } break;
			case "filterType": {
				this.messages = [div(
					h2("Filter Type"),
					p('Toggling these buttons lets you choose between a simple filter interface with two sliders, or the more advanced filter graph.'),
					p('The two-slider version controls a single low-pass filter and was used in legacy versions. It is not as powerful, but if you feel overwhelmed you can start with this.'),
					p('Note that switching from the simple interface to the advanced interface will convert your current settings, so you can also use it as a basis for later tweaking.'),
				)];
			} break;
			case "filterCutoff": {
				this.messages = [div(
					h2("Low-Pass Filter Cutoff Frequency"),
					p("The lowest setting feels \"muffled\" or \"dark\", and the highest setting feels \"harsh\" or \"bright\"."),
					p("Most sounds include a range of frequencies from low to high. UltraBox instruments have a filter that allows the lowest frequencies to pass through at full volume, but can reduce the volume of the higher frequencies that are above a cutoff frequency. This setting controls the cutoff frequency and thus the range of higher frequencies that are reduced."),
					p("This cutoff setting also determines which frequency resonates when the resonance peak setting is used."),
				)];
			} break;
			case "filterResonance": {
				this.messages = [div(
					h2("Low-Pass Filter Resonance Peak"),
					p("Increasing this setting emphasizes a narrow range of frequencies, based on the position of the filter cutoff setting. This can be used to imitate the resonant bodies of acoustic instruments and other interesting effects."),
					p("The filter preserves the volume of frequencies that are below the cutoff frequency, and reduces the volume of frequencies that are above the cutoff. If this setting is used, the filter also increases the volume of frequencies that are near the cutoff."),
				)];
			} break;
			case "loopControls":
			{
				this.messages = [div(h2("Loop Controls"), p("This enables the use of parameters that control how a chip wave should repeat."))];
			}
			break;
				case "loopMode":
			{
				this.messages = [div(h2("Loop Mode"), p("This sets the way the chip wave loops when its ends are reached."), p("The \"Loop\" mode is the default: when the end of the loop is reached, it will jump back to the starting point of the loop."), p("The \"Ping-Pong\" mode starts playing the chip wave backwards when the end of the loop is reached. Once it reaches the start of the loop, it will start playing forwards again, endlessly going back and forth."), p("The \"Play Once\" mode stops the chip wave once the end is reached (or the start of the loop, if it's playing backwards)."), p("The \"Play Loop Once\" mode stops the chip wave once the end of the loop is reached (or the start of the loop, if it's playing backwards)."))];
			}
			break;
			case "loopStart":
			{
				this.messages = [div(h2("Loop Start Point"), p("This specifies where the loop region of the chip wave starts. It's measured in \"samples\", or rather, it refers to a point on a waveform."), p("Be careful with tiny loop sizes (especially combined with high pitches), they may re-introduce aliasing even if the \"Aliasing\" checkbox is unchecked."))];
			}
			break;
			case "loopEnd":
			{
				this.messages = [div(h2("Loop End Point"), p("This specifies where the loop region of the chip wave ends. It's measured in \"samples\", or rather, it refers to a point on a waveform."), p("The button next to the input box sets this to end of the chip wave."), p("Be careful with tiny loop sizes (especially combined with high pitches), they may re-introduce aliasing even if the \"Aliasing\" checkbox is unchecked."))];
			}
			break;
				case "offset":
			{
				this.messages = [div(h2("Offset"), p("This specifies where the chip wave should start playing from. You can use this to chop up a large sample, to say, turn a drum loop into a drum kit! It's measured in \"samples\", or rather, it refers to a point on a waveform."))];
			}
			break;
				case "backwards":
			{
				this.messages = [div(h2("Backwards"), p("When set, the chip wave will start playing backwards. After checking this, you may want to adjust the offset to start from a different point that makes sense for this mode."))];
			}
			break;
			case "decimalOffset": {
				this.messages = [div(
					h2("Decimal Offset"),
					p("The decimal offset is subtracted from the pulse width value, enabling the use of numbers such as 12.5 or 6.25. This could be useful if you're trying to recreate the sound of old soundchips."),
				)];
			} break;
			case "unisonVoices": {
				this.messages = [div(
					h2("Unison Voices"),
					p("This setting controls how many voices there are in a unison. Unisons such as \"none\" or \"detune\" use 1 voice, while most other unisons use 2 voices."),
				)];
			} break;
			case "unisonSpread": {
				this.messages = [div(
					h2("Unison Spread"),
					p("This setting controls the distance between the two voices, in semitones. A small amount of spread causes the voice's waves to shift in and out from each other, causing a shimmering effect. Larger spread will cause the voices to act like separate notes."),
				)];
			} break;
			case "unisonOffset": {
				this.messages = [div(
					h2("Unison Offset"),
					p("This setting controls the detune applied to BOTH voices, in semitones."),
				)];
			} break;
			case "unisonExpression": {
				this.messages = [div(
					h2("Unison Volume"),
					p("This setting controls the unison volume. Use this if the unison makes your instrument too loud in comparison to other instruments."),
					p("If this is set to a negative value, it will invert the wave!"),
				)];
			} break;
			case "unisonSign": {
				this.messages = [div(
					h2("Unison Sign"),
					p("This setting is a volume multiplier applied to the second voice. This setting will only work correctly with two voices."),
				)];
			} break;

			default:
				// Check for modSetinfo#
				if (type.indexOf("modSetInfo") >= 0) {
					let modNum: number = +type[type.length - 1];
					let modulator: number = _doc.song.channels[_doc.channel].instruments[_doc.getCurrentInstrument()].modulators[modNum];
					let pList: HTMLParagraphElement[] = [];
					for (let s: number = 0; s < Config.modulators[modulator].promptDesc.length; s++) {
						pList.push(p(
							Config.modulators[modulator].promptDesc[s]
								.replace("$LO", "" + Config.modulators[modulator].convertRealFactor)
								.replace("$MID", "" + (Config.modulators[modulator].convertRealFactor + Config.modulators[modulator].maxRawVol / 2))
								.replace("$HI", "" + (Config.modulators[modulator].convertRealFactor + Config.modulators[modulator].maxRawVol))

						));
					}
					// Last element for mod settings is just some miscellaneous data for nerds like me.
					pList[pList.length-1].style.setProperty("color", "var(--secondary-text)");
					this.messages = [div(
						h2(Config.modulators[modulator].promptName),
						pList,
					)];
					break;
				}
				else {
					throw new Error("Unhandled TipPrompt type: " + type);
				}
		}

		this._prevButton.addEventListener("click", this._prevPage);
		this._nextButton.addEventListener("click", this._nextPage);
		this._closeButton.addEventListener("click", this._close);
		this.container = div({class: "prompt", style: "width: 300px;"});
		this._changePage(0);
	}

	private _changePage = (page: number) => {
		this.page = page;

		if (this.messages.length > 1 && page > 0) {
			this._footer.appendChild(this._prevButton);
		} else if (this._footer.contains(this._prevButton)) {
			this._footer.removeChild(this._prevButton);
		}

		if (this.messages.length > 1 && page !== this.messages.length - 1) {
			this._footer.appendChild(this._nextButton);
		} else if (this._footer.contains(this._nextButton)) {
			this._footer.removeChild(this._nextButton);
		}

		const contents: HTMLElement[] = [ this.messages[this.page] ];

		contents.push(this._footer);
		contents.push(this._closeButton);
		
		this.container.replaceChildren(...contents);
		setTimeout(()=>this._closeButton.focus());
	}

	private _prevPage = () => this._changePage(this.page - 1)
	private _nextPage = () => this._changePage(this.page + 1)
	private _close = () => this._doc.undo()
	
	public cleanUp = (): void => { 
		this._prevButton.removeEventListener("click", this._prevPage);
		this._nextButton.removeEventListener("click", this._nextPage);
		this._closeButton.removeEventListener("click", this._close);
		this.messages = [];
		this.page = 0;
	}
}
