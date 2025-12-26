export enum EaseDirection {
    In,
    Out,
    InOut
}

/** Very simple easing functions. You should multiply the result by a time t in range [0, 1]. */
export class Easing
{
    /** Subtle easing, intensity=1 (weakest). */
    static sine(x: number, direction: EaseDirection) {
        return direction === EaseDirection.In ? 1 - Math.cos((x * Math.PI) / 2)
            : direction === EaseDirection.Out ? Math.sin((x * Math.PI) / 2)
            : -(Math.cos(Math.PI * x) - 1) / 2;
    }

    /** An exponential curve. Note: Exponents of X or 1/X and even/odd exponents are best. */
    static exponent(x: number, direction: EaseDirection, exponent: number) {
        return direction === EaseDirection.In ? Math.pow(x, exponent)
            : direction === EaseDirection.Out ? 1 - Math.pow(1 - x, exponent)
            : (x < 0.5 ? Math.pow(2, exponent - 1) * Math.pow(x, exponent) : 1 - Math.pow(-2 * x + 2, exponent) / 2)
    }

    /** A quadratic curve that undoes the exponent and uses (2*X)^2. Intensity 3 (moderate), more intense than ^5 exponent. */
    static circle(x: number, direction: EaseDirection) {
        return direction === EaseDirection.In ? 1 - Math.sqrt(1 - Math.pow(x, 2))
        : direction === EaseDirection.Out ? Math.sqrt(1 - Math.pow(x - 1, 2))
        : (x < 0.5
            ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
            : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2)
    }

    /** An exponential curve where X is in the exponent. Intensity 4 (strongest). */
    static exponent_x(x: number, direction: EaseDirection) {
        return direction === EaseDirection.In ? x === 0 ? 0 : Math.pow(2, 10 * x - 10)
        : direction === EaseDirection.Out ? x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
        : (x === 0
            ? 0
            : x === 1 ? 1
            : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2
            : (2 - Math.pow(2, -20 * x + 10)) / 2)
    }
}