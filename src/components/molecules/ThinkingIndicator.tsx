import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

interface ThinkingIndicatorProps {
  label?: string;
}

export function ThinkingIndicator({ label }: ThinkingIndicatorProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
      {label ? (
        <AppText variant="label" color={colors.textSecondary}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
