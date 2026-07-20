import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";

import { AppText } from "@/components/atoms/AppText";
import { Radii, Spacing } from "@/constants/theme";
import { niceDomain } from "@/domains/chartScale";
import { useColors } from "@/hooks/use-colors";

const PLOT_HEIGHT = 150;
// Counts need two digits; a pace needs "10:00". Callers that plot time pass a
// wider axis rather than every chart paying for the widest possible tick.
const DEFAULT_Y_AXIS_WIDTH = 20;
const GRID_LINES = 4;

export interface ChartLine {
  key: string;
  label: string;
  color: string;
  /**
   * One value per bucket, aligned with `labels`. `null` is a gap, not a zero —
   * a bucket with no pace is missing data, and drawing it at the floor would
   * read as an impossibly fast session.
   */
  points: (number | null)[];
}

interface MultiLineChartProps {
  labels: string[];
  lines: ChartLine[];
  formatValue: (value: number) => string;
  /** How the legend condenses a line: total by default, average for rates. */
  summary?: "sum" | "average";
  /** Counts keep zero as the floor; rates like pace zoom to their own range. */
  zeroBased?: boolean;
  /**
   * Axis tick text. Defaults to the rounded number — a pace in seconds needs
   * its own formatter, or the axis reads 480 where the chart means 8:00.
   */
  formatTick?: (value: number) => string;
  /** Time axes step in 15/30/60s, not in tens. */
  scale?: "decimal" | "time";
  /** Widen when ticks are long, e.g. a pace. */
  yAxisWidth?: number;
  /** Axis names, so the reader never has to infer what the numbers are. */
  xLabel?: string;
  yLabel?: string;
  /** Metric colours, matching the notes rows and the totals dock. */
  xLabelColor?: string;
  yLabelColor?: string;
  band?: { min: number; max: number; label: string };
}

/**
 * Several lines over one axis. The layout is plain flex — a plot row with the
 * Y axis beside the SVG, then the X axis, then the legend. An earlier version
 * positioned the axes absolutely and pushed the legend down with a margin,
 * which left a hole the size of the chart when the parent had no fixed height.
 */
/** Contiguous runs of real values; each becomes its own polyline. */
function segmentsOf(
  points: (number | null)[],
): { i: number; value: number }[][] {
  const segments: { i: number; value: number }[][] = [];
  let current: { i: number; value: number }[] = [];
  points.forEach((value, i) => {
    if (value === null) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    current.push({ i, value });
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

export function MultiLineChart({
  labels,
  lines,
  formatValue,
  band,
  summary = "sum",
  zeroBased = false,
  formatTick = (value) => `${Math.round(value)}`,
  scale = "decimal",
  yAxisWidth = DEFAULT_Y_AXIS_WIDTH,
  xLabel,
  yLabel,
  xLabelColor,
  yLabelColor,
}: MultiLineChartProps) {
  const summarise = (points: (number | null)[]) => {
    const real = points.filter((point): point is number => point !== null);
    if (!real.length) return 0;
    const total = real.reduce((sum, value) => sum + value, 0);
    // Summing a pace would be meaningless; averaging it is the readable figure.
    return summary === "average" ? total / real.length : total;
  };
  const colors = useColors();
  const [plotWidth, setPlotWidth] = useState(0);
  // No hover on a phone: the finger IS the cursor, so the tooltip follows drag
  // and clears on release.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!labels.length || !lines.length) return null;

  const values = lines.flatMap((line) =>
    line.points.filter((point): point is number => point !== null),
  );
  if (!values.length) return null;
  // The band is part of the data: hiding the 8-12 target because the week fell
  // short would remove the very reference the chart exists to show.
  const domain = niceDomain(band ? [...values, band.min, band.max] : values, {
    zeroBased,
    tickCount: GRID_LINES,
    scale,
  });
  const gridValues = domain.ticks;

  // With two or three buckets the ends land exactly on the borders and read as
  // a clipped chart. Inset them; with a full window the points are dense enough
  // that the edges are fine.
  const inset = plotWidth * (labels.length <= 3 ? 0.18 : 0.04);
  const usable = plotWidth - inset * 2;
  const x = (index: number) =>
    labels.length === 1
      ? plotWidth / 2
      : inset + (index / (labels.length - 1)) * usable;
  const y = (value: number) =>
    PLOT_HEIGHT -
    ((value - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT;
  const labelStep = Math.max(1, Math.ceil(labels.length / 5));

  /** Nearest bucket to where the finger is. */
  const indexAt = (touchX: number) => {
    if (labels.length === 1) return 0;
    const ratio = (touchX - inset) / Math.max(1, usable);
    return Math.max(
      0,
      Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1))),
    );
  };

  const active =
    activeIndex === null
      ? null
      : {
          label: labels[activeIndex],
          readings: lines
            .map((line) => ({ line, value: line.points[activeIndex] }))
            .filter(
              (reading): reading is { line: ChartLine; value: number } =>
                reading.value !== null,
            ),
        };

  return (
    <View style={styles.wrap}>
      <View style={styles.plotRow}>
        <View style={[styles.yAxis, { width: yAxisWidth }]}>
          {[...gridValues].reverse().map((value) => (
            <AppText
              key={value}
              variant="caption"
              color={yLabelColor ?? colors.textTertiary}
              numberOfLines={1}
            >
              {formatTick(value)}
            </AppText>
          ))}
        </View>

        <View
          style={styles.plot}
          onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) =>
            setActiveIndex(indexAt(event.nativeEvent.locationX))
          }
          onResponderMove={(event) =>
            setActiveIndex(indexAt(event.nativeEvent.locationX))
          }
          onResponderRelease={() => setActiveIndex(null)}
          onResponderTerminate={() => setActiveIndex(null)}
        >
          {plotWidth > 0 ? (
            <Svg width={plotWidth} height={PLOT_HEIGHT}>
              {band ? (
                <Rect
                  x={0}
                  y={y(band.max)}
                  width={plotWidth}
                  height={Math.max(0, y(band.min) - y(band.max))}
                  fill={colors.success}
                  opacity={0.1}
                />
              ) : null}

              {gridValues.map((value) => (
                <Line
                  key={value}
                  x1={0}
                  x2={plotWidth}
                  y1={y(value)}
                  y2={y(value)}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              ))}

              {activeIndex !== null ? (
                <Line
                  x1={x(activeIndex)}
                  x2={x(activeIndex)}
                  y1={0}
                  y2={PLOT_HEIGHT}
                  stroke={colors.textTertiary}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              ) : null}

              {lines.flatMap((line) =>
                segmentsOf(line.points).map((segment, index) => (
                  <Polyline
                    key={`${line.key}-seg${index}`}
                    points={segment
                      .map(({ i, value }) => `${x(i)},${y(value)}`)
                      .join(" ")}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )),
              )}

              {/* A single bucket has no line to draw, so the dots carry it. */}
              {lines.flatMap((line) =>
                line.points.flatMap((value, i) =>
                  value === null
                    ? []
                    : [
                        <Circle
                          key={`${line.key}-${i}`}
                          cx={x(i)}
                          cy={y(value)}
                          r={
                            labels.length === 1 || i === line.points.length - 1
                              ? 4
                              : 2.5
                          }
                          fill={line.color}
                        />,
                      ],
                ),
              )}
            </Svg>
          ) : null}
        </View>
      </View>

      {active && active.readings.length ? (
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: colors.backgroundSelected,
              borderColor: colors.border,
            },
          ]}
        >
          <AppText variant="caption" color={colors.textTertiary}>
            {active.label}
          </AppText>
          {active.readings.map(({ line, value }) => (
            <View key={line.key} style={styles.tooltipRow}>
              <View
                style={[styles.legendDot, { backgroundColor: line.color }]}
              />
              <AppText
                variant="caption"
                color={colors.textSecondary}
                numberOfLines={1}
              >
                {line.label}
              </AppText>
              <AppText variant="caption">{formatValue(value)}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.xAxis, { marginLeft: yAxisWidth }]}>
        {labels.map((label, index) => (
          <AppText
            key={label}
            variant="caption"
            color={colors.textTertiary}
            numberOfLines={1}
            style={styles.xLabel}
          >
            {index % labelStep === 0 ? label : ""}
          </AppText>
        ))}
      </View>

      {xLabel || yLabel ? (
        <View style={styles.axisNames}>
          <AppText variant="caption" color={yLabelColor ?? colors.textTertiary}>
            {yLabel ? `↑ ${yLabel}` : ""}
          </AppText>
          <AppText variant="caption" color={xLabelColor ?? colors.textTertiary}>
            {xLabel ? `${xLabel} →` : ""}
          </AppText>
        </View>
      ) : null}

      <View style={styles.legend}>
        {lines.map((line) => (
          <View key={line.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: line.color }]} />
            <AppText
              variant="caption"
              color={colors.textSecondary}
              numberOfLines={1}
            >
              {line.label}
            </AppText>
            <AppText variant="caption" color={colors.textTertiary}>
              {formatValue(summarise(line.points))}
            </AppText>
          </View>
        ))}
        {band ? (
          <AppText variant="caption" color={colors.success}>
            {band.label}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  plotRow: {
    flexDirection: "row",
    height: PLOT_HEIGHT,
  },
  yAxis: {
    height: PLOT_HEIGHT,
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginRight: 7,
    // Nudge so each number sits on its gridline instead of under it.
    marginTop: -7,
    marginBottom: -7,
  },
  plot: {
    flex: 1,
  },
  xAxis: {
    flexDirection: "row",
  },
  xLabel: {
    flex: 1,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  axisNames: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  tooltip: {
    position: "absolute",
    top: 0,
    right: 0,
    gap: Spacing.one,
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.md,
    maxWidth: "70%",
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.pill,
  },
});
