import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { AppText } from '@/components/atoms/AppText';
import { Radii, Spacing } from '@/constants/theme';
import { niceDomain } from '@/domains/chartScale';
import { useColors } from '@/hooks/use-colors';

const PLOT_HEIGHT = 150;
const Y_AXIS_WIDTH = 34;
const GRID_LINES = 4;

export interface XYPoint {
  x: number;
  y: number;
}

export interface ScatterSeries {
  key: string;
  label: string;
  color: string;
  points: XYPoint[];
}

interface ScatterLineChartProps {
  series: ScatterSeries[];
  xLabel: string;
  yLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  /** Metric colours, matching the notes rows and the totals dock. */
  xLabelColor?: string;
  yLabelColor?: string;
}

/**
 * Both axes carry data — sets against load, time against distance. Unlike a
 * time series the X spacing is meaningful, so points cannot be laid out evenly;
 * they sit where their value puts them.
 */
export function ScatterLineChart({
  series,
  xLabel,
  yLabel,
  formatX,
  formatY,
  xLabelColor,
  yLabelColor,
}: ScatterLineChartProps) {
  const colors = useColors();
  const [plotWidth, setPlotWidth] = useState(0);
  const [active, setActive] = useState<{ series: ScatterSeries; point: XYPoint } | null>(null);

  const all = series.flatMap((line) => line.points);
  if (!all.length) return null;

  // Both axes fit the data. Anchoring X at zero would show set counts nobody
  // performed, and anchoring Y at zero flattens loads that live at 100+.
  const xDomain = niceDomain(all.map((point) => point.x), { tickCount: GRID_LINES });
  const yDomain = niceDomain(all.map((point) => point.y), { tickCount: GRID_LINES });

  // The padded domain already keeps sparse points off the borders; the inset
  // covers the dot radius so a point at the extreme is not half cut.
  const inset = 6;
  const usable = Math.max(1, plotWidth - inset * 2);
  const x = (value: number) =>
    inset + ((value - xDomain.min) / (xDomain.max - xDomain.min)) * usable;
  const y = (value: number) =>
    PLOT_HEIGHT - ((value - yDomain.min) / (yDomain.max - yDomain.min)) * PLOT_HEIGHT;
  const gridY = yDomain.ticks;
  const gridX = xDomain.ticks;

  /** Nearest plotted point to the finger, in screen space so both axes count. */
  const nearest = (touchX: number, touchY: number) => {
    const candidates = series.flatMap((line) =>
      line.points.map((point) => {
        const dx = x(point.x) - touchX;
        const dy = y(point.y) - touchY;
        return { series: line, point, distance: dx * dx + dy * dy };
      }),
    );
    const best = candidates.sort((a, b) => a.distance - b.distance)[0];
    // Ignore taps nowhere near a point rather than snapping across the chart.
    return best && best.distance <= 60 * 60 ? { series: best.series, point: best.point } : null;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          {[...gridY].reverse().map((value) => (
            <AppText
              key={value}
              variant="caption"
              color={yLabelColor ?? colors.textTertiary}
              numberOfLines={1}
            >
              {formatY(value)}
            </AppText>
          ))}
        </View>

        <View
          style={styles.plot}
          onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) =>
            setActive(nearest(event.nativeEvent.locationX, event.nativeEvent.locationY))
          }
          onResponderMove={(event) =>
            setActive(nearest(event.nativeEvent.locationX, event.nativeEvent.locationY))
          }
          onResponderRelease={() => setActive(null)}
          onResponderTerminate={() => setActive(null)}
        >
          {plotWidth > 0 ? (
            <Svg width={plotWidth} height={PLOT_HEIGHT}>
              {gridY.map((value) => (
                <Line
                  key={`y${value}`}
                  x1={0}
                  x2={plotWidth}
                  y1={y(value)}
                  y2={y(value)}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              ))}

              {series.map((line) => {
                // Sorted by X so the path reads left to right instead of
                // doubling back on itself.
                const sorted = [...line.points].sort((a, b) => a.x - b.x);
                return (
                  <Polyline
                    key={line.key}
                    points={sorted.map((point) => `${x(point.x)},${y(point.y)}`).join(' ')}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.7}
                  />
                );
              })}

              {series.map((line) =>
                line.points.map((point, index) => (
                  <Circle
                    key={`${line.key}-${index}`}
                    cx={x(point.x)}
                    cy={y(point.y)}
                    r={
                      active && active.point === point && active.series.key === line.key ? 7 : 4
                    }
                    fill={line.color}
                  />
                )),
              )}
            </Svg>
          ) : null}
        </View>
      </View>

      {active ? (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: colors.backgroundSelected, borderColor: colors.border },
          ]}
        >
          <View style={styles.tooltipRow}>
            <View style={[styles.legendDot, { backgroundColor: active.series.color }]} />
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {active.series.label}
            </AppText>
          </View>
          <AppText variant="caption">
            {`${formatX(active.point.x)} ${xLabel} · ${formatY(active.point.y)} ${yLabel}`}
          </AppText>
        </View>
      ) : null}

      <View style={styles.xAxis}>
        {gridX.map((value) => (
          <AppText
            key={value}
            variant="caption"
            color={xLabelColor ?? colors.textTertiary}
            numberOfLines={1}
            style={styles.xTick}
          >
            {formatX(value)}
          </AppText>
        ))}
      </View>

      <View style={styles.axisNames}>
        <AppText variant="caption" color={yLabelColor ?? colors.textTertiary}>
          {`↑ ${yLabel}`}
        </AppText>
        <AppText variant="caption" color={xLabelColor ?? colors.textTertiary}>
          {`${xLabel} →`}
        </AppText>
      </View>

      <View style={styles.legend}>
        {series.map((line) => (
          <View key={line.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: line.color }]} />
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {line.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  plotRow: {
    flexDirection: 'row',
    height: PLOT_HEIGHT,
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    height: PLOT_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: Spacing.two,
    marginTop: -7,
    marginBottom: -7,
  },
  plot: {
    flex: 1,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: Y_AXIS_WIDTH,
  },
  xTick: {
    flex: 1,
    textAlign: 'center',
  },
  axisNames: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
