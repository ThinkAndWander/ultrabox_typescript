type amplitude = 'args.a'
type absoluteOffset = 'args.abso'
type absoluteValue = 'args.abs'
type absoluteSkipNormalize = 'args.abssn'
type amplitudeOffset = 'args.ao'
type bend = 'args.b'
type bendAccel = 'args.ba'
type dampStrength = 'args.ds'
type dampQuietAt = 'args.dq'
type clampMin = 'args.cmin'
type clampMax = 'args.cmax'
type clampSkipNormalize = 'args.csn'
type frequency = 'args.f'
type frequencyAccel = 'args.fa'
type flipX = 'args.fx'
type flipY = 'args.fy'
type lerpPercent = 'args.lp'
type lerpTransTo = 'args.ltt'
type lerpTransPeriodic = 'args.ltp'
type lerpFrom = 'args.lw1'
type lerpTo = 'args.lw2'
type phase = 'args.p'
type steps = 'args.s'
type wrapY = 'args.wy'
type mirrorHorizontal = 'args.xmir'
type mirrorVertical = 'args.ymir'
const INPUT = 'input'

export type waveFunction = (input: number, args: IWaveArgument) => void

/**
 * This represents one wave based on natural periodic functions sine(x) and modulo, which makes saw waves. The range of
 * both is normalized to [0, 1] and they share a period of 1 to promote easy composition. All arguments except waveform
 * take a string substitution that lets you change the supplied value as an argument.
 * 
 * Common waveforms:
 * - cosine waves are sine waves with +0.25 to phase
 * - square waves are mod waves with steps = 2 and match cosine phase, or sine for phase -0.25
 * - triangle waves are mod waves with absoluteValue = true, absoluteOffset = 0.5 and frequency halved
 * - trapezoid waves are triangle waves where clamp min/max are set
 * - exponential ramps are ramps with bending set
 * - odd harmonics are a sum of sine waves that all have odd frequencies
 * - even harmonics are a sum of sine waves that all have even frequencies
 * - pulse widths are triangle waves with bending and steps = 2
 * 
 * Several modifications are available and applied in this order:
 * - Clamp: caps the min and/or max value, which partially squares the wave. Formula: (max(min(F, clampMax), clampMin) / (ClampMax - clampMin)
 * - Absolute value: shifts under zero, then reflects it with absolute value. Formula: abs(F - absoluteOffset)
 * - Steps: rounds to multiples of N. Formula: round(F * steps) / steps
 * - Damping: decreases amplitude to zero with a linear/exp function. Formula: linear (input > quietAt ? 0 : 1 - input/quietAt), exponential (2^(-damping * input)).
 * - Flip X: flips X by substituing 1-X instead of X for input.
 * - Wrap Y: wraps Y (without flipping the shape) by returning (result + wrapY) % 1 or if wrapY is 1 then returns 1 - result.
 * - Mirror Horz: creates dashes in which are a horizontally mirrored version of the next period. Formula: F(sign(round(mod_wave) * x - 0.5))
 * - Mirror Vert: creates dashes in which are a vertically mirrored version of the next period. Formula: sign(round(mod_wave) - 0.5) * 0.5 * F + 0.5
 * - Amplitude shift: shrinks amplitude and anchors it vertically. Formula: amplitude * F + amplitudeOffset * (1 - amplitude)
 */
export interface IWave {
	/**
	 * The waveform basis. If true, uses % operator to make sawtooth ramps, else sin(x).
	 * - Sine formula: (0.5*sin(frequency * X ^ frequencyAccel + phase) + 0.5) ^ (bend + X*bendAccel)
	 * - Mod formula: ((frequency * X ^ frequencyAccel + phase) % 1) ^ (bend + X*bendAccel)
	 */
	isModuloWave?: true

	/** Frequency. A finite value in range (-inf, +inf). Frequency is how many periods fit into 1 unit of time. */
	frequency?: number | frequency,

	/** Acceleration of frequency. A finite value in range [0, +inf) which slows down if 0-1 and increases if >1. */
	frequencyAccel?: number | frequencyAccel,

	/**
	 * A value in range [0, 1]. 0 = no change, 0.5 = starts at 50% into the period, 1 = 100% shift (effectively same as zero).
	 * For sine waveforms, cosine is a phase shift of 0.25.
	*/
	phase?: number | phase,

	/**
	 * Bending. A finite value in range [0, +inf). For sine waves, it widens peaks and narrows troughs to spikes, or
	 * vice versa, for the two ranges; for mod waves, it ramps towards zero or one for the two ranges. The ranges are
	 * [0, 1) and (1, +inf). The asymptotic upper bound can be rectified by using flipY to use the non-asymptotic 0-1
	 * bounds instead for bending in that direction.
	 */
	bend?: number | bend,

	/** Bend acceleration. A finite value in range [0, +inf). Causes bending to accelerate as input increases. */
	bendAccel?: number | bendAccel,

	/**
	 * Adds a damping modifier (changing amplitude over time), which produces numbers in range [0, 1] that fall towards
	 * zero as input increases. It's multiplied with a wave to change its amplitude. The equation to use is determined
	 * by which mutually exclusive property is provided, either quietAt (linear) or strength (exponential).
	 * 
	 * Linear equation: input > quietAt ? 0 : 1 - input/quietAt where quietAt > 0
	 * Exponential equation: 2^(-strength * x) where strength is >= 0
	 */
	dampingMod?: {
		/**
		 * Setting this will use a linear damping equation. This is a value > 0 that adjusts the slope such that when
		 * input=quietAt, y=0. For speed it can be assumed as long as amplitude is not increased after this that if
		 * x > quietAt, the result is 0 without computing the equation at all.
		*/
		quietAt?: number | dampQuietAt,

		/**
		 * Setting this will use an exponential damping equation. This is a value >= 0 that adjusts the strength; zero
		 * has no effect, and higher values increasingly dampen. Keep strength within low values like 0-20 to avoid
		 * floating precision loss.
		 * 
		 * For reference:
		 * - output ~ 0.001 at strength=1, input=10
		 * - output ~ 0.001 at strength=2, input=5
		 * - output ~ 0.001 at strength=4, input=2.5
		 */
		strength?: number | dampStrength
	},

	/** Adds a simple amplification modifier (constant amplitude over time) */
	amplifyMod?: {
		/** A value in range [0, 1]. This only reduces amplitude. 0 = no amplitude, 0.5 = half, 1 = full. */
		amplitude: number | amplitude,

		/**
		 * A value in range [0, 1]. Offsets where the waveform "anchors" to with shrunken amplitude,
		 * with 0 = bottom (default), 1 = top, 0.5 = center.
		 */
		amplitudeOffset?: number | amplitudeOffset
	},

	/** Adds a flip X or wrap Y modifier */
	flipWrapMod?: {
		/** If true, performs a flip by passing 1-X instead of X to the function. */
		flipX?: true | flipX,

		/** If true, performs a flip by returning 1 - result instead of the result. */
		flipY?: true | flipY,

		/** A value in range [0, 1]. Wraps Y without mirroring it by performing (result + wrapY) % 1. */
		wrapY?: number | wrapY,
	},

	/** Adds a periodic mirroring modifier. */
	periodicMirrorMod?: {
		/** 
		 * Performs a horizontal mirroring from left if provided. This means that the 2nd period is effectively spliced
		 * into the  dashes of the first one, mirrored horizontally. All properties have identical ranges and purpose as
		 * normal in a mod wave. Formula: F(sign(round(mod_wave) * x - 0.5))
		 */
		mirrorHorizontal?: IWave | mirrorHorizontal

		/** 
		 * Performs a vertical mirroring from center if provided. This means that the 2nd period is effectively spliced
		 * into the  dashes of the first one, as a vertical mirror. All properties have identical ranges and purpose as
		 * normal in a mod wave. This works by modifying the result of the function. Formula: sign(round(mod_wave) - 0.5) * 0.5 * F + 0.5
		 */
		mirrorVertical?: IWave | mirrorVertical
	}

	/** Adds a min-max clamping modifier */
	clampMod?: {
		/**
		 * A value in range [0, Cmax]. This clamps the minimum value, creating a stretch of audio in the signal with
		 * the value zero (because it normalizes amplitude to [0, 1] afterwards). Occurs before absolute value or steps.
		 */
		clampMin?: number | clampMin,

		/**
		 * A value in range [0, 1]. This clamps the maximum value, creating a stretch of audio in the signal with the
		 * value one (because it normalizes amplitude to [0, 1] afterwards).
		 */
		clampMax?: number | clampMax,

		/**
		 * Default false. If false and any clamp occurs, the resulting amplitude is renormalized to the range [0, 1] by
		 * subtracting the min clamp and dividing by (max - min).
		 */
		clampSkipNormalize?: true | clampSkipNormalize,
	},

	/** Adds an absolute value and offset modifier */
	absMod?: {
		/**
		 * Uses absolute value, halving the period, so the frequency is halved to compensate. Formula:
		 * - with absolute offset: abs(result - offset) * min(1/offset, 1)
		 * - without: abs(result)
		 */
		absoluteValue?: true | absoluteValue,

		/**
		 * A value in range [0, 1] which is subtracted, causing part of the function to vertically
		 * mirror, where 0 is no change, 1 is the same as flip Y. Only used if absolute value is used. A modulo waveform
		 * with absolute value and an offset of 0.5 produces a triangle wave. Formula: abs(result - offset) * min(1/offset, 1)
		 */
		absoluteOffset?: number | absoluteOffset,

		/**
		 * Default false. If false and an offset is used, the resulting amplitude is renormalized to the range [0, 1]
		 * by multiplying by min(1/offset, 1).
		 */
		absoluteSkipNormalize?: true | absoluteSkipNormalize,
	},

	/** Adds a rounding to N steps modifier */
	stepsMod?: {
		/**
		 * A value in range [0, +inf) that determines how many parts the result is divided into. A modulo waveform with
		 * steps=2 gives a square wave.
		 */
		steps?: number | steps
	}
}

/**
 * A condensed set of arguments provided to the function created by a wave signal function generator. This is used
 * exclusively to fill in the placeholders that you might optionally provide to the function. By using placeholders
 * and providing them in a wave argument, especially by mutating this object instead of recreating it per-call, you can
 * achieve better performance. Only arguments that were placeholders need to be provided here, and they'll be called
 * without first checking they exist (for performance), so be sure to include them.
 */
export interface IWaveArgument {
	// Core formula
	f?: number,
	fa?: number,
	p?: number,
	b?: number,
	ba?: number,

	// Damping modifier
	ds?: number,
	dq?: number,

	// Amplitude modifier
	a?: number,
	ao?: number,

	// Flip-wrap modifier
	fx?: boolean,
	fy?: boolean,
	wy?: number,

	// Clamp modifier
	cmin?: number,
	cmax?: number,
	csn?: boolean,

	// Absolute modifier
	abs?: boolean,
	abso?: number,
	abssn?: boolean,

	// Periodic mirror modifier
	xMir?: IWave,
	yMir?: IWave

	// Steps modifier
	s?: number
}

/** Common summations to perform. */
enum SumType {
	/** Starts at n=0, n++ and multiplies frequency by n. */
	AllHarmonics,

	/** Starts at n=0, n+=2 and multiplies frequency by n. Effect is to wobble fast along low-frequency waves. */
	EvenHarmonics,

	/** Starts at n=1, n+=2 and multiplies frequency by n. Effect is wobbling that increasingly approxes square waves. */
	OddHarmonics,

	/** Starts at n=0, n++ and divides n by frequency. */
	AllSubHarmonics,

	/** Starts at n=0, n+=2 and divides n by frequency. */
	EvenSubHarmonics,

	/** Starts at n=1, n+=2 and divides n by frequency. */
	OddSubHarmonics,

	/** Starts at n=0, n++ and raises frequency to power of n. Causes a spike effect. */
	AllPowers,

	/** Starts at n=0, n+=2 and raises frequency to power of n. */
	EvenPowers,

	/** Starts at n=1, n+=2 and raises frequency to power of n. */
	OddPowers
}

/** Utility to keep math precomputations legible in the generateSignal function. */
const combine = (n1: number | string | undefined, op: '+' | '-' | '/' | '*' | '^', n2: number | string | undefined) => {
	if (typeof(n1) === 'number' && typeof(n2) === 'number') {
		if (op === '+') return n1 + n2;
		if (op === '-') return n1 - n2;
		if (op === '/') return n1 / n2;
		if (op === '*') return n1 * n2;
		if (op === '^') return n1 ** n2;
	}
	if (typeof(n1) === 'undefined') return n2;
	if (typeof(n2) === 'undefined') return n1;
	return `(${n1} ${op} ${n2})`;
}

/**
 * Reads the options specified by IWave to return a function generated from a string formula, which takes input as its
 * first argument and optionally an IWaveArgument as its second argument. If string placeholders are used for any value
 * in the options object, they are expected to be given values in the IWaveArgument. This allows any precomputations to
 * be performed ahead-of-time when the formula string is generated so that using the formula is as fast as possible. For
 * speed with repetitive use and placeholders, it's recommended to mutate the args object instead of recreating it
 * repeatedly.
 */
export const createWaveFormula = (wave: IWave, returnString?: boolean): string | waveFunction => {
		const TWOPI = Math.PI * 2;
		const isSine = !wave.isModuloWave;
		const isAbsoluteModUsed = wave.absMod && wave.absMod.absoluteValue;

		let modifiedInput = INPUT;

		// First, apply modifiers that change input: flip-wrap and periodic mirror.
		if (wave.flipWrapMod && wave.flipWrapMod.flipX !== undefined) {
			if (wave.flipWrapMod.flipX === true) {
				modifiedInput = `(1 - ${modifiedInput})`;
			} else {
				modifiedInput = `(${wave.flipWrapMod.flipX} ? 1 - ${modifiedInput} : ${modifiedInput})`
			}
		}

		if (wave.periodicMirrorMod && wave.periodicMirrorMod.mirrorHorizontal) {
			const wave2 = typeof(wave.periodicMirrorMod.mirrorHorizontal) === 'object'
				? createWaveFormula(wave.periodicMirrorMod.mirrorHorizontal, true) as string
				: wave.periodicMirrorMod.mirrorHorizontal;

			modifiedInput = `Math.sign(Math.round(${wave2}) * ${modifiedInput} - 0.5})`;
		}

		// Sine frequency is multiplied by 2pi to normalize period, but if absolute, then it's halved to preserve period.
		const freqModifier = isAbsoluteModUsed
			? wave.isModuloWave ? 0.5 : Math.PI
			: wave.isModuloWave ? undefined : TWOPI 

		// Frequency * input ^ freq_accel + phase
		let freqAndInput;
		if (wave.frequency !== undefined && wave.frequencyAccel !== undefined) {
			freqAndInput = `${combine(freqModifier, '*', wave.frequency)} * ${modifiedInput} ** ${wave.frequencyAccel}`;
		} else if (wave.frequency !== undefined) {
			freqAndInput = `${combine(freqModifier, '*', wave.frequency)} * ${modifiedInput}`;
		} else if (wave.frequencyAccel !== undefined) {
			freqAndInput = `${combine(freqModifier, '*', modifiedInput)} ** ${wave.frequencyAccel}`;
		} else {
			freqAndInput = isAbsoluteModUsed ? `0.5 * ${modifiedInput}` : modifiedInput;
		}

		if (wave.phase !== undefined) {
			freqAndInput += ` + ${combine(isSine ? TWOPI : undefined, '*', wave.phase)}`;
		}

		// Optionally, above portion can be raised to the power of (bend + bendAccel * input)
		let bendStr;
 		if (wave.bend !== undefined && wave.bendAccel !== undefined) {
			bendStr = ` ** (${wave.bend} + ${wave.bendAccel} * ${modifiedInput})`;
		} else if (wave.bend !== undefined) {
			bendStr = ` ** ${wave.bend}`;
		} else if (wave.bendAccel !== undefined) {
			bendStr = ` ** (${wave.bendAccel} * ${modifiedInput})`;
		} else {
			bendStr = "";
		}

		// Both the frequency expression and bend can be plugged into the main formula
		let formula = '';
		if (wave.isModuloWave) {
			formula = `((0.5 * Math.sin(${freqAndInput}) + 0.5) ${bendStr})`;
		} else {
			formula = `(((${freqAndInput}) % 1) ${bendStr})`;	
		}

		// Apply damping modifier if used.
		if (wave.dampingMod) {
			if (wave.dampingMod.quietAt) { // if-statement to *keep* quiet after quietAt is applied after all mods.
				formula = `((1 - Math.max((${modifiedInput}) / ${wave.dampingMod.quietAt}, 0)) * ${formula})`;
			} else if (wave.dampingMod.strength) {
				formula = `(2 ** (-${wave.dampingMod.strength} * ${modifiedInput}) * ${formula})`;
			}
		}

		// Apply clamping modifier to input if used.
		if (wave.clampMod) {
			const inputWithMin = wave.clampMod.clampMin
				? `Math.max(${INPUT}, ${wave.clampMod.clampMin})`
				: INPUT;

			const inputWithMax = wave.clampMod.clampMax
				? `Math.min(${inputWithMin}, ${wave.clampMod.clampMax})`
				: inputWithMin;

			modifiedInput = wave.clampMod.clampSkipNormalize
				? inputWithMax
				: `/ ${combine(wave.clampMod.clampMax, '-', wave.clampMod.clampMin)}`
		}

		// Apply absolute value modifier if used.
		if (wave.absMod && wave.absMod.absoluteValue) {
			if (wave.absMod.absoluteOffset) {
				formula = `Math.abs((${formula}) - ${wave.absMod.absoluteOffset})`;

				if (!wave.absMod.absoluteSkipNormalize) {
					formula += ` * Math.min(${combine(1, '/', wave.absMod.absoluteOffset)}, 1)`
				}
			} else {
				formula = `Math.abs(${formula})`;
			}
		}

		// Apply steps modifier if used.
		if (wave.stepsMod && wave.stepsMod.steps) {
			formula = `Math.round(${formula} * ${wave.stepsMod.steps}) / ${wave.stepsMod.steps}`;
		}

		// Apply the flip-wrap modifiers on result if used.
		if (wave.flipWrapMod) {
			if (wave.flipWrapMod.flipY !== undefined) {
				if (wave.flipWrapMod.flipY === true) {
					formula = `1 - ${formula}`;
				} else {
					formula = `(${wave.flipWrapMod.flipY} ? 1 - ${formula} : ${formula})`
				}
			}

			if (wave.flipWrapMod.wrapY !== undefined) {
				if (wave.flipWrapMod.wrapY === 1) {
					formula = `1 - ${formula}`;
				} else {
					formula = `(${formula} + ${wave.flipWrapMod.wrapY}) % 1`
				}
			}
		}

		// Apply the periodic mirror on result if used.
		if (wave.periodicMirrorMod && wave.periodicMirrorMod.mirrorVertical) {
			const wave2 = typeof(wave.periodicMirrorMod.mirrorVertical) === 'object'
				? createWaveFormula(wave.periodicMirrorMod.mirrorVertical, true) as string
				: wave.periodicMirrorMod.mirrorVertical;

			formula = `Math.sign(Math.round(${wave2}) - 0.5}) * 0.5 * (${formula}) + 0.5`;
		}

		// Apply the amplify modifier on result if used.
		if (wave.amplifyMod && wave.amplifyMod.amplitude) {
			formula = `${wave.amplifyMod.amplitude} * (${formula})`;

			if (wave.amplifyMod.amplitudeOffset) {
				formula += ` + ${combine(wave.amplifyMod.amplitudeOffset, '*', combine(1, '-', wave.amplifyMod.amplitude))}`
			}
		}

		if (returnString) {
			return formula;
		}

		return new Function("input", "args", formula) as waveFunction;
}

/**
 * Creates a summation, which adds waves together with different frequency edits.
 * 
 * Formula: 0.5N * SUM(n=0, n < N, n++) of modified Waves[n % Waves.length] + 0.5
 * - if even-only: n=0, n += 2
 * - if odd-only: n=1, n += 2
 * 
 * Modification varies:
 * - for harmonics: multiplies frequency by n (effective with sines, mod)
 * - for sub harmonics: divides frequency by n (useful only with sines)
 * - for powers: raises frequency to n (useful only with sines)
 * - if a function is provided, it takes the current value and wave to work with, and returns the new value.
 * 
 * @param sumWith The wave definitions to perform a summation over. If the sum count exceeds this array length, it
 * cycles the wave to use like [1, 2, 3, 1, 2, 3, 1, ...].
 * 
 * @param sumCount How many numbers to add up. If a filter is used, it counts that many even or odd numbers.
 * 
 * @param filter Whether to include all values, or filter to keep only values matching a pattern such as even-numbered
 * N. Alternatively, this can take a function that takes in the current index in the summation loop and the current
 * wave (as waves[i % waves.length]). The function should return a wave formula; it's expected that you call
 * createWaveFormula to do this, although anything even as simple as a number stored in a string would suffice. Keep in
 * mind input is called "input" in wave formulas and left as a placeholder.
 */
export const createWaveSum = (
	sumWith: IWave[], sumCount?: number,
	filter?: SumType | ((val: number, thisWave: IWave) => string)) => {

	// Note: this is problematic for performance because it has to perform the full math of every wave included in
	// the summation in order to sum it before division. the way the default filters work depends on a hack whereby
	// I'm asserting the expression (constant * f) is the same as the string literal 'f'; this violates the API to
	// avoid needing to add a secondary number-only coefficient to each placeholder in createWaveFormula. Due to
	// calling createWaveFormula, this can't use placeholders.

	let startAt = 0;
	let countBy = 1;

	if (filter === SumType.EvenHarmonics ||
		filter === SumType.EvenPowers ||
		filter === SumType.EvenSubHarmonics) {
		countBy = 2;
	} else if (filter === SumType.OddHarmonics ||
		filter === SumType.OddPowers ||
		filter === SumType.OddSubHarmonics) {
		startAt = 1;
		countBy = 2;
	}

	let waves: string[] = [];
	for (let i = startAt; i < (sumCount ?? 1) * countBy; i += countBy) {
		const current = sumWith[i % sumWith.length];

		if (filter === SumType.AllHarmonics ||
			filter === SumType.EvenHarmonics ||
			filter === SumType.OddHarmonics) {
			waves.push(createWaveFormula({ ...current, frequency: combine(current.frequency, '*', i) as any }, true) as string)
		} else if (filter === SumType.AllPowers ||
			filter === SumType.EvenPowers ||
			filter === SumType.OddPowers) {
			waves.push(createWaveFormula({ ...current, frequency: combine(current.frequency, '^', i) as any }, true) as string)
		} else if (filter === SumType.AllSubHarmonics ||
			filter === SumType.EvenSubHarmonics ||
			filter === SumType.OddSubHarmonics) {
			waves.push(createWaveFormula({ ...current, frequency: combine(i, '/', current.frequency) as any }, true) as string)
		} else if (typeof(filter) === 'function') {
			waves.push(filter(i, current));
		}
	}

	if (waves.length > 1) {
		return `${0.5 / waves.length} * (${waves.map(str => `(${str})`).join('+')}) / ${waves.length} + 0.5`;
	}
	if (waves.length == 1) {
		return waves[0];
	}

	return ''; // length 0, no-op.
}

/**
 * This transitions from one wave to another using a linear interpolation that optionally occurs over time and is
 * optionally periodic. This is valuable for creating a transition between any two values of a property in like waves,
 * or between wave shapes. This is good for getting quasisine waves (square/sine mix).
 * 
 * Formula (no transition): waveFrom + percentAlong * (waveTo - waveFrom)
 * Formula modifiers:
 * - non-periodic: F * min(x/T, 1)
 * - periodic: F * min((x % T)/T, 1)
 * 
 * @param waveFrom The first wave in the interpolation.
 * 
 * @param waveTo The second wave in the interpolation.
 * 
 * @param percentAlong A value in range [0,1] where 0 = waveFrom, 1 = waveTo, and inbetweens are an interpolated mix.
 * 
 * @param transitionAt Normally, the mix is constant and equal to percentTo. If transitionAt is set, then the mix will
 * instead transition from 0% and reach percentTo when the input value (X) for the formula is >= this number.
 * 
 * @param transitionPeriodically Default false. When true and transitionAt is provided, it will use modulo to repeat
 * the transition, treating the whole transition as one period.
 */
export const createWaveLerp = (
	waveFrom: IWave | lerpFrom, waveTo: IWave | lerpTo,
	percentAlong: number | lerpPercent,
	transitionAt?: number | lerpTransTo, transitionPeriodically?: true | lerpTransPeriodic) => {
	const waveFromStr = typeof(waveFrom) === 'object' ? createWaveFormula(waveFrom, true) as string : waveFrom;
	const waveToStr = typeof(waveTo) === 'object' ? createWaveFormula(waveTo, true) as string : waveTo;

	const formula = `${waveFromStr} + ${percentAlong} * ((${waveToStr}) - (${waveFromStr}))`;

	if (transitionAt) {
		if (transitionPeriodically) {
			return formula + ` * Math.min((${INPUT} % ${percentAlong}) / ${percentAlong}, 1)`
		}
		
		return formula + ` * Math.min(${INPUT} / ${percentAlong}, 1)`
	}

	return formula;
}

/**
 * Fits any number of waves into one period by using multi-part logic. The amount of space within that period which is
 * allocated to each wave -- called the portion -- is equidistant by default, but can be set to other values. If any
 * wave explicitly defines its portion, the resulting function will use GPU-friendly uniform branching. Otherwise, it
 * rounds indexed access into an array.
 * 
 * @param waves The waves to use. They receive a weighting of 1 automatically, which results in equal weight given, but this
 * can be overridden by supplying a property called portion that specifies a number. The weight of all waves
 * will be summed and each portion divided by the sum to get the final fraction of the period that each wave
 * occupies. The array will go through each one in order until the last.
 * 
 * @param frequency This is multiplied by the period to get how much of / how many times the multipart wave repeats within the
 * period (which is 1).
 */
export const createWaveMultipart = (waves: (IWave & {portion?: number})[], frequency: number) => {
	if (waves.length === 0) {
		return '';
	}
	if (waves.length === 1) {
		return createWaveFormula(waves[0], true) as string;
	}

	let hasPortioning = false;

	// Fair GPU-predictable branching if inequally-portioned
	if (hasPortioning) {
		let formula = '';
		let sum = 0;
		waves.forEach((o => sum += o.portion ?? 1));
		if (sum === 0) { return ''; } // avoid div by zero

		let last = 0;
		for (let i = 0; i < waves.length; i++) {
			const val = (waves[i].portion ?? 1) / sum;

			if (i < waves.length - 1) {
				formula += `(${INPUT} % 1) < ${val} ? ${createWaveFormula(waves[i], true)} :`;
			} else {
				formula += createWaveFormula(waves[i], true);
			}

			last += val;
		}

		return `(${formula})`;
	}

	// Fairly fast indexed access to an array of the waves if equal-portioned
	return `[${waves.map(o => createWaveFormula(o, true)).join(',')}]`
		+ `[Math.round((${frequency} * ${INPUT}) % 1)]`;
}

/**
 * Does simple multiplication of two waves in range [0, 1]. The two major usecases are (A) custom damping
 * functions when the damping modifier isn't enough, and (B) ring modulation by multiplying usually a simple,
 * low-frequency wave with an arbitrarily complex one such that it audibly appears to give the complex wave a
 * "wobble" in the output that follows the low-frequency oscillation.
 */
export const createWaveMultiply = (wave1: IWave, wave2: IWave) => {
	const waveFromStr = typeof(wave1) === 'object' ? createWaveFormula(wave1, true) as string : wave1;
	const waveToStr = typeof(wave2) === 'object' ? createWaveFormula(wave2, true) as string : wave2;
	return `(${waveFromStr}) * (${waveToStr})`;
}