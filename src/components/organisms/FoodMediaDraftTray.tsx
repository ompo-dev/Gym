import { Image } from 'expo-image';
import { StyleSheet, TextInput, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import { canOpenAppModal } from '@/core/appModals';
import type { EntryMediaAttachment } from '@/core/types';
import type { FoodData } from '@/domains/schemas';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppModalStore } from '@/store/useAppModalStore';

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

export function DraftStack({
  drafts,
  size,
  overlap = -22,
  showMore = false,
}: {
  drafts: EntryMediaAttachment[];
  size: number;
  overlap?: number;
  showMore?: boolean;
}) {
  const visibleDrafts = drafts.slice(0, 3);
  if (visibleDrafts.length === 0) return null;

  return (
    // Height only. The width used to be computed from the thumbnail count and
    // it left out the "+N" badge, so the box was wrong for one photo, wrong for
    // four, and right by accident for three. A row sums its children's widths
    // and negative margins on its own — there was nothing to compute.
    <View style={[styles.draftStack, { height: size }]}>
      {visibleDrafts.map((draft, index) => (
        <View
          key={draft.id}
          style={[
            index > 0 && { marginLeft: overlap },
            {
              transform: [{ rotate: thumbnailRotations[index] }],
              zIndex: 3 - index,
            },
          ]}>
          <DraftPreview draft={draft} size={size} />
        </View>
      ))}
      {showMore && drafts.length > 3 ? (
        <GlassSurface glass="regular" style={styles.moreBadge}>
          <AppText variant="caption" color="#FFFFFF">
            +{drafts.length - 3}
          </AppText>
        </GlassSurface>
      ) : null}
    </View>
  );
}

export function FoodMediaDraftTray({
  drafts,
  ownerId,
  onChangeDescription,
  onRemove,
}: {
  drafts: FoodMediaDraft[];
  /** Which tray this is — see the `ownerId` note on the modal type. */
  ownerId: string;
  onChangeDescription?: (id: string, description: string) => void;
  onRemove?: (id: string) => void;
}) {
  const colors = useColors();
  const activeModal = useAppModalStore((s) => s.stack.at(-1));
  const replaceAppModal = useAppModalStore((s) => s.replaceAppModal);
  const closeAppModal = useAppModalStore((s) => s.closeAppModal);
  // Both halves. Matching on the id alone made every tray on screen visible at
  // the same moment, and the one the user tapped was not the one they saw.
  const open = activeModal?.id === 'food.mediaDraftTray' && activeModal.ownerId === ownerId;
  if (drafts.length === 0) return null;

  return (
    <>
      <LoggedPressable
        onPress={() => {
          if (!canOpenAppModal('day.root', 'food.mediaDraftTray')) return;
          replaceAppModal({ id: 'food.mediaDraftTray', domain: 'food', ownerId });
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('media.photosAdded')}
        style={styles.galleryButton}>
        <DraftStack drafts={drafts} size={38} showMore />
      </LoggedPressable>

      <SheetFrame
        visible={open}
        title={t('media.photosAdded')}
        onClose={() => closeAppModal('food.mediaDraftTray')}
        // Every draft is a row with a thumbnail and an editable description, so
        // the default short sheet clipped the list at one and a half photos —
        // the ones below were unreachable, remove button included.
        size="full"
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
              <LoggedPressable
                onPress={() => onRemove(draft.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('media.removeAttachment')}>
                <AppIcon name="x" color={colors.textSecondary} size={18} />
              </LoggedPressable>
            ) : null}
          </View>
        ))}
      </SheetFrame>
    </>
  );
}

const styles = StyleSheet.create({
  galleryButton: {
    // Hugs the stack instead of reserving room for three. One photo used to sit
    // in a 78pt slot with 40pt of dead space beside it, and the row next to the
    // note read as misaligned.
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.one,
  },
  draftStack: {
    flexDirection: 'row',
    alignItems: 'center',
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

/** How many thumbnails fit beside the shutter before they stack into a badge. */
export const THUMBNAIL_LIMIT = 3;

/**
 * The most recent photos first.
 *
 * Drafts arrive in the order they were added, and showing the first three meant
 * the strip beside the shutter froze on the oldest ones: a photo just taken did
 * not appear, and the slot still held whatever had been picked from the gallery
 * earlier. The newest is the one the user just created and expects to see.
 */
export function latestThumbnails(drafts: { uri?: string }[], limit = THUMBNAIL_LIMIT): string[] {
  return drafts
    .flatMap((draft) => (draft.uri ? [draft.uri] : []))
    .reverse()
    .slice(0, limit);
}

/** The exact wording `foodRouterPrompt` is taught to recognise. Change both. */
export const SCANNED_PREFIX = 'Already scanned and identified:';

/**
 * What the barcodes already identified, spelled out for the model.
 *
 * A scanned product arrives as finished `FoodData` — the same shape the model
 * returns for "banana" — so it skips the image payload, skips the image
 * description block, and the model never hears of it. "receita com isso" over a
 * scanned jar of mayonnaise was therefore a request for a recipe with no
 * ingredients: the one food in hand was the one thing missing from the prompt.
 */
export function buildBarcodeText(drafts: FoodMediaDraft[]): string {
  const labels = drafts
    .flatMap((draft) => (draft.data ? [draft.description.trim() || draft.data.items[0]?.label] : []))
    .filter(Boolean);
  return labels.length ? `${SCANNED_PREFIX} ${labels.join(', ')}.` : '';
}
