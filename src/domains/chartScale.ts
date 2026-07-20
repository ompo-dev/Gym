export interface ChartDomain {
  min: number;
  max: number;
  /** Evenly spaced values from min to max, for gridlines and axis labels. */
  ticks: number[];
}

/** 1, 2, 2.5, 5, 10 and their powers — the steps a person would pick. */
function decimalStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Seconds do not round in tens. A pace axis stepping by 50s reads 4:10, 5:00,
 * 5:50; stepping by 30s reads 4:30, 5:00, 5:30 — which is how runners think.
 */
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

function timeStep(rawStep: number): number {
  return TIME_STEPS.find((step) => step >= rawStep) ?? TIME_STEPS[TIME_STEPS.length - 1];
}

/**
 * An axis range that fits the data instead of the origin.
 *
 * Anchoring every axis at zero flattens the thing you are looking for: loads
 * between 100 and 110 kg on a 0-120 axis are a straight line. When the values
 * sit well away from zero the range zooms in; when they hug it, or when a count
 * is being plotted, zero stays the floor because "none" is a real value there.
 */
export function niceDomain(
  values: number[],
  options: { zeroBased?: boolean; tickCount?: number; scale?: "decimal" | "time" } = {},
): ChartDomain {
  const { zeroBased = false, tickCount = 4, scale = "decimal" } = options;
  const stepFor = scale === "time" ? timeStep : decimalStep;
  const real = values.filter((value) => Number.isFinite(value));

  if (!real.length) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }

  const dataMin = Math.min(...real);
  const dataMax = Math.max(...real);

  // A flat series still needs a readable band around its value.
  if (dataMin === dataMax) {
    const step = stepFor(Math.max(1, Math.abs(dataMin) * 0.1));
    const min = zeroBased ? 0 : Math.max(0, Math.floor((dataMin - step) / step) * step);
    return buildTicks(min, Math.ceil((dataMax + step) / step) * step, step);
  }

  const span = dataMax - dataMin;
  // Hugging zero, or an explicit count: the origin carries meaning, keep it.
  const keepZero = zeroBased || dataMin <= 0 || span / dataMax >= 0.5;

  // Two or three readings would otherwise sit exactly on the borders, reading
  // as if the chart were clipped. Widen the range so the data floats inside it.
  const sparse = new Set(real).size <= 3;
  const breathing = sparse ? span * 0.4 : 0;

  const step = stepFor((span + breathing * 2) / tickCount);
  const min = keepZero
    ? 0
    : Math.max(0, Math.floor((dataMin - breathing) / step) * step);
  const max = Math.ceil((dataMax + breathing) / step) * step;

  return buildTicks(min, max === min ? min + step : max, step);
}

/**
 * Ticks are multiples of the step, not an even division of the range. Splitting
 * min..max into N parts produced values like 4:48 on an axis whose step was a
 * round 30s — the bounds were tidy and everything between them was not.
 */
function buildTicks(min: number, max: number, step: number): ChartDomain {
  const count = Math.max(1, Math.round((max - min) / step));
  return {
    min,
    max,
    ticks: Array.from({ length: count + 1 }, (_, i) => min + step * i),
  };
}

/**
 * Zeros before a series first appears are not data, they are a claim that the
 * exercise existed and was skipped. Blank them so the line starts on the day it
 * was actually first logged.
 *
 * Zeros AFTER the first appearance stay: once you have done an exercise, a day
 * without it is a real zero and worth seeing.
 */
export function trimLeadingGaps(points: number[]): (number | null)[] {
  const first = points.findIndex((value) => value > 0);
  if (first < 0) return points.map(() => null);
  return points.map((value, index) => (index < first ? null : value));
}
