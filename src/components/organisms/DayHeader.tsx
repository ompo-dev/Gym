import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { DateNav } from '@/components/molecules/DateNav';
import { Spacing } from '@/constants/theme';

interface DayHeaderProps {
  title: string;
  date: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DayHeader({ title, date, canNext, onPrev, onNext, onToday }: DayHeaderProps) {
  return (
    <View style={styles.header}>
      <AppText variant="title">{title}</AppText>
      <DateNav date={date} canNext={canNext} onPrev={onPrev} onNext={onNext} onToday={onToday} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
  },
});
