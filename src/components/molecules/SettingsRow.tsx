import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { Metrics, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

interface SettingsRowProps {
  icon?: AppIconName;
  iconColor?: string;
  title: string;
  titleColor?: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
}

/** One tappable row inside a settings card: optional tinted icon, title,
 * optional subtitle, and a trailing slot (chevron, switch, or value). */
export function SettingsRow({
  icon,
  iconColor,
  title,
  titleColor,
  subtitle,
  trailing,
  onPress,
}: SettingsRowProps) {
  const colors = useColors();

  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={styles.iconWrap}>
          <AppIcon name={icon} color={iconColor ?? colors.text} size={20} />
        </View>
      ) : null}

      <View style={styles.text}>
        <AppText variant="body" color={titleColor} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="secondary" color={colors.textSecondary} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  iconWrap: {
    width: 26,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  trailing: {
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.6,
  },
});
