import { Alert } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { LoggedPressable } from '@/components/atoms/Logged';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

/**
 * Android/web offline indicator: bare amber slashed-cloud icon. Tapping opens a
 * native `Alert` with the explanation. iOS gets the popover in `OfflineBadge.ios.tsx`.
 */
export function OfflineBadge() {
  const colors = useColors();
  return (
    <LoggedPressable
      onPress={() => Alert.alert(t('offline.title'), t('offline.body'))}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('offline.badge')}
    >
      <AppIcon name="cloudOff" color={colors.accent} size={22} />
    </LoggedPressable>
  );
}
