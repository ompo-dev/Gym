import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { nearbyGapLabel, timeLabel } from '@/core/date';
import type { Entry } from '@/core/types';
import { useColors } from '@/hooks/use-colors';

/** Timestamp of an entry, plus a "+Xs" gap badge when it closely follows the previous one. */
export function EntryMeta({ entry, previousEntry }: { entry: Entry; previousEntry?: Entry }) {
  const colors = useColors();
  const gap = nearbyGapLabel(entry.createdAt, previousEntry?.createdAt);

  return (
    <View style={styles.meta}>
      <AppText variant="caption" color={colors.textSecondary}>
        {timeLabel(entry.createdAt)}
      </AppText>
      {gap ? (
        <AppText variant="caption" color={colors.textTertiary}>
          {gap}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: {
    alignItems: 'flex-end',
    gap: 2,
  },
});
