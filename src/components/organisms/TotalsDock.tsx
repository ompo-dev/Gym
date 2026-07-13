import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Spacing } from '@/constants/theme';
import type { TotalItem } from '@/domains/types';

export function TotalsDock({ items }: { items: TotalItem[] }) {
  return (
    <GlassSurface glass="regular" style={styles.dock}>
      {items.map((item) => (
        <View key={item.key} style={styles.item}>
          <AppText variant="label" color={item.color}>
            {item.label}
          </AppText>
          <AppText variant="value" color={item.color}>
            {item.value}
          </AppText>
        </View>
      ))}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 26,
    overflow: 'hidden',
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
