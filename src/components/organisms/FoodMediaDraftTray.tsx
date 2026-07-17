import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import type { EntryMediaAttachment } from '@/core/types';
import type { FoodData } from '@/domains/schemas';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { SheetFrame } from './SheetFrame';

export interface FoodMediaDraft extends EntryMediaAttachment {
  data?: FoodData;
  base64?: string;
  mimeType?: string;
}

const thumbnailRotations = ['-8deg', '5deg', '-4deg'] as const;

function draftLabel(kind: FoodMediaDraft['kind']): string {
  if (kind === 'foodPhoto') return t('media.foodPhoto');
  if (kind === 'menuPhoto') return t('media.menuPhoto');
  return t('media.barcode');
}

export function DraftPreview({
  draft,
  size,
}: {
  draft: EntryMediaAttachment;
  size: number;
}) {
  const colors = useColors();

  if (draft.uri) {
    return <Image source={{ uri: draft.uri }} style={[styles.preview, { width: size, height: size }]} contentFit="cover" />;
  }

  return (
    <View
      style={[
        styles.preview,
        styles.iconPreview,
        { width: size, height: size, backgroundColor: colors.backgroundElement },
      ]}>
      <AppIcon name="scanBarcode" color={colors.textSecondary} size={Math.max(18, size - 18)} />
    </View>
  );
}

export function FoodMediaDraftTray({
  drafts,
  onChangeDescription,
  onRemove,
}: {
  drafts: FoodMediaDraft[];
  onChangeDescription?: (id: string, description: string) => void;
  onRemove?: (id: string) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  if (drafts.length === 0) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('media.photosAdded')}
        style={styles.galleryButton}>
        {drafts.slice(0, 3).map((draft, index) => (
          <View
            key={draft.id}
            style={[
              index > 0 && styles.thumbnailOverlap,
              {
                transform: [{ rotate: thumbnailRotations[index] }],
                zIndex: 3 - index,
              },
            ]}>
            <DraftPreview draft={draft} size={38} />
          </View>
        ))}
        {drafts.length > 3 ? (
          <GlassSurface glass="regular" style={styles.moreBadge}>
            <AppText variant="caption" color="#FFFFFF">
              +{drafts.length - 3}
            </AppText>
          </GlassSurface>
        ) : null}
      </Pressable>

      <SheetFrame
        visible={open}
        title={t('media.photosAdded')}
        onClose={() => setOpen(false)}
        keyboardAwareScroll>
        {drafts.map((draft) => (
          <View key={draft.id} style={styles.row}>
            <DraftPreview draft={draft} size={48} />
            <View style={styles.content}>
              <AppText variant="caption" color={colors.textSecondary}>
                {draftLabel(draft.kind)}
              </AppText>
              <TextInput
                value={draft.description}
                onChangeText={(value) => onChangeDescription?.(draft.id, value)}
                placeholder={t('media.descriptionPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                editable={Boolean(onChangeDescription)}
                style={[styles.input, { color: colors.text }]}
                returnKeyType="done"
              />
            </View>
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(draft.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('media.removeAttachment')}>
                <AppIcon name="x" color={colors.textSecondary} size={18} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </SheetFrame>
    </>
  );
}

const styles = StyleSheet.create({
  galleryButton: {
    width: 78,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  preview: {
    borderRadius: Radii.sm,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  iconPreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailOverlap: {
    marginLeft: -22,
  },
  moreBadge: {
    width: 28,
    height: 28,
    marginLeft: -18,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 4,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  input: {
    minHeight: 34,
    padding: 0,
    fontSize: 15,
  },
});
