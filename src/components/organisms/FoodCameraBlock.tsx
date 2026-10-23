import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { LoggedPressable } from '@/components/atoms/Logged';
import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import type { FoodMediaAction } from '@/core/types';
import { prepareFoodPhoto, type CapturedFoodPhoto } from '@/core/food/scan-photo';
import { useFeature } from '@/core/dev/flags';
import { log } from '@/core/log';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { latestThumbnails } from './FoodMediaDraftTray';
import { FoodPhotoReview } from './FoodPhotoReview';

// ponytail: tune on device — must show enough preview to frame food/barcode
// without pushing the dock/composer off-screen on smaller phones.
const CAMERA_BLOCK_HEIGHT = 460;

const thumbnailRotations = ['-8deg', '5deg', '-4deg'] as const;

/**
 * Product codes only. A packet often carries a QR code too, and reading that one
 * instead sends a URL to Open Food Facts, which knows nothing about it. The live
 * camera and the still-image reader share this list so they cannot drift.
 */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] as const;

/**
 * Whether a saved image can be read at all on this platform.
 *
 * `scanFromURLAsync` defaults to `['qr']` and on iOS throws the requested types
 * away entirely — `CameraViewModule.swift:47` takes them as `_` — so a photo of
 * an EAN-13 comes back empty every single time, no matter how sharp it is.
 * Telling the user "no barcode in this image" blamed the picture for something
 * the platform cannot do; not opening the picker at all is the honest version.
 */
const GALLERY_READS_BARCODES = Platform.OS !== 'ios';

export function FoodCameraBlock({
  mode,
  onClose,
  onPhoto,
  onBarcode,
  drafts,
}: {
  mode: FoodMediaAction;
  onClose: () => void;
  onPhoto: (photo: CapturedFoodPhoto) => void;
  /** `imageUri` is the frame it was read from — the note shows it. */
  onBarcode: (code: string, imageUri?: string) => void;
  /** What is already attached — the strip beside the shutter reads this. */
  drafts: { uri?: string }[];
}) {
  const colors = useColors();
  const cutoutsEnabled = useFeature('foodPhotoCutouts');
  const [preparing, setPreparing] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const photoWork = useRef(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const cameraRef = useRef<CameraView | null>(null);
  const scannedRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanSession, setScanSession] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<(CapturedFoodPhoto & { reviewId: string })[]>([]);
  const captureBusy = useRef(false);
  const photoSequence = useRef(0);
  const [scanNotice, setScanNotice] = useState<'none' | 'notFound' | 'unsupported'>('none');
  const isBarcode = mode === 'barcode';
  const kind = mode === 'menuPhoto' ? 'menuPhoto' : 'foodPhoto';
  const stagePhoto = useCallback((photo: CapturedFoodPhoto) => {
    if (photo.kind === 'foodPhoto' && cutoutsEnabled) {
      const reviewId = String(++photoSequence.current);
      setReviewQueue((current) => [...current, { ...photo, reviewId }]);
      return;
    }
    photoWork.current = photoWork.current.catch(() => {}).then(async () => {
      if (!mounted.current) return;
      setPreparing(true); setPrepareFailed(false);
      try {
        const prepared = await prepareFoodPhoto(photo);
        if (mounted.current) onPhoto({ ...prepared, cutouts: undefined });
      } catch {
        log.media('photo.prepare.failed');
        if (mounted.current) setPrepareFailed(true);
      } finally { if (mounted.current) setPreparing(false); }
    });
  }, [cutoutsEnabled, onPhoto]);

  useEffect(() => {
    scannedRef.current = false;
    setScanNotice('none');
    setScanSession((current) => current + 1);
  }, [mode]);

  // Derived, not stored. The local copy this replaces was wiped every time the
  // sheet lost visibility — which is exactly what the system gallery does when
  // it takes over the screen, so a picked photo vanished on the way back.
  const capturedUris = latestThumbnails(drafts);
  const hiddenCount = drafts.filter((draft) => draft.uri).length - capturedUris.length;

  /**
   * Once per session. A delivered code closes the block, and the live scanner
   * fires many times a second — claimed before the picture is taken, because
   * that wait is exactly the window it keeps firing in.
   */
  const claimScan = (): boolean => {
    if (scannedRef.current) return false;
    scannedRef.current = true;
    return true;
  };

  /**
   * Reads a still image — the shutter's frame or a gallery pick, same path.
   * The boolean answers "was there a code in the picture", which is the only
   * thing the caller can tell the user about.
   */
  const scanStill = async (uri: string): Promise<boolean> => {
    const [found] = await scanFromURLAsync(uri, [...BARCODE_TYPES]).catch(() => []);
    if (!found) return false;
    if (claimScan()) onBarcode(found.data, uri);
    return true;
  };

  const attachPickedPhotos = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    assets.forEach((asset) => {
      if (!asset.uri) return;
      stagePhoto({
        kind,
        uri: asset.uri,
        base64: asset.base64 ?? undefined,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });
    });
  }, [kind, stagePhoto]);

  useEffect(() => {
    if (Platform.OS !== 'android' || isBarcode) return;
    let mounted = true;
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (!mounted || !result || 'code' in result || result.canceled) return;
        attachPickedPhotos(result.assets);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [attachPickedPhotos, isBarcode]);

  const takePhoto = async () => {
    if (captureBusy.current) return;
    captureBusy.current = true;
    setScanNotice('none');
    try {
      const camera = cameraRef.current;
      if (!camera) return;
      const photo = await camera.takePictureAsync({ base64: !isBarcode, quality: 0.85 });
      if (!photo?.uri) return;
      // In scan mode the shutter is a manual retry of the reader, not a way to
      // attach a picture: it used to file the barcode frame as a meal photo,
      // silently adding an unreadable image to the note.
      if (isBarcode) {
        if (!(await scanStill(photo.uri))) setScanNotice('notFound');
        return;
      }
      stagePhoto({ kind, uri: photo.uri, base64: photo.base64, mimeType: 'image/jpeg', width: photo.width, height: photo.height });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('unmounted')) console.warn('Failed to take food photo', error);
    } finally {
      captureBusy.current = false;
    }
  };

  const pickFromGallery = async () => {
    setScanNotice('none');
    // Say so before the picker, not after: making someone browse for a photo
    // that can never be read is the same dead end with extra steps.
    if (isBarcode && !GALLERY_READS_BARCODES) {
      setScanNotice('unsupported');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // One code per scan: the nutrition sheet reviews a single product, so
      // picking five photos would read one and drop four without saying so.
      allowsMultipleSelection: !isBarcode,
      base64: !isBarcode,
      // Preserve silhouette detail; food photos are resized before segmentation.
      quality: isBarcode ? 1 : 0.85,
    });
    if (result.canceled) return;

    // A photo of a barcode is still a barcode. Without this, picking one in
    // scan mode attached an image nobody read and the note stayed empty.
    if (isBarcode) {
      for (const asset of result.assets) {
        if (asset.uri && (await scanStill(asset.uri))) return;
      }
      // Coming back from the gallery to an unchanged screen is how the app
      // looks when it ignored the tap. It did not — the picture had no code.
      setScanNotice('notFound');
      return;
    }

    attachPickedPhotos(result.assets);
  };

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (!claimScan()) return;
    // Grab the frame it was read from so the note can show the product when
    // Open Food Facts has no picture of its own. Best effort — a missing photo
    // must never cost the user the scan itself.
    void cameraRef.current
      ?.takePictureAsync({ quality: 0.4 })
      .then((photo) => onBarcode(result.data, photo?.uri))
      .catch(() => onBarcode(result.data));
  };

  const reviewPhoto = reviewQueue[0];
  if (reviewPhoto) return (
    <GlassSurface glass="regular" style={styles.panel}>
      <FoodPhotoReview key={reviewPhoto.reviewId} photo={reviewPhoto} remaining={reviewQueue.length}
        onDiscard={() => setReviewQueue((current) => current.slice(1))}
        onConfirm={(photo) => {
          onPhoto(photo);
          setReviewQueue((current) => current.slice(1));
        }} />
    </GlassSurface>
  );

  return (
    <GlassSurface glass="regular" style={styles.panel}>
      {/* Camera fills the block edge-to-edge */}
      {preparing || prepareFailed ? <View style={[styles.hint, { zIndex: 3 }]} pointerEvents="none">
        {preparing ? <ActivityIndicator color={colors.accent} /> : <AppText color={colors.danger}>{t('media.prepareFailed')}</AppText>}
      </View> : null}
      {permission?.granted ? (
        <>
          <CameraView
            key={`${mode}-${scanSession}`}
            ref={(node) => {
              cameraRef.current = node;
            }}
            style={StyleSheet.absoluteFill}
            facing="back"
            active
            onBarcodeScanned={isBarcode ? handleBarcode : undefined}
            barcodeScannerSettings={{
              barcodeTypes: [...BARCODE_TYPES],
            }}
          />
          {isBarcode ? (
            <GlassSurface glass="regular" style={styles.hint}>
              <AppText
                variant="body"
                color={scanNotice === 'notFound' ? colors.danger : '#FFFFFF'}>
                {scanNotice === 'notFound'
                  ? t('media.noBarcodeFound')
                  : scanNotice === 'unsupported'
                    ? t('media.galleryScanUnsupported')
                    : t('media.scanHint')}
              </AppText>
            </GlassSurface>
          ) : null}
        </>
      ) : (
        <View style={styles.permissionCard}>
          <AppText variant="body" color="#FFFFFF">
            {t('media.cameraPermission')}
          </AppText>
          <LoggedPressable
            onPress={() => void requestPermission()}
            accessibilityRole="button"
            accessibilityLabel={t('media.allowCamera')}>
            <AppText variant="label" color={colors.accent}>
              {t('media.allowCamera')}
            </AppText>
          </LoggedPressable>
        </View>
      )}

      {/* Header — overlaid on top */}
      <View style={styles.header}>
        <GlassSurface glass="regular" style={styles.titlePill}>
          <AppText variant="label" color="#FFFFFF">
            {isBarcode ? t('media.scanBarcode') : mode === 'foodPhoto' ? t('media.foodPhoto') : t('media.menuPhoto')}
          </AppText>
        </GlassSurface>
        <LoggedPressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
            <AppIcon name="x" color="#FFFFFF" size={22} />
          </GlassSurface>
        </LoggedPressable>
      </View>

      {/* Controls — overlaid on bottom */}
      <View style={styles.captureControls}>
          <View style={styles.gallerySlot}>
            {capturedUris.length > 0 ? (
              <View style={styles.thumbnailRow}>
                {capturedUris.map((uri, index) => (
                  <Image
                    key={`${uri}-${index}`}
                    source={{ uri }}
                    style={[
                      styles.thumbnail,
                      index > 0 && styles.thumbnailOverlap,
                      {
                        transform: [{ rotate: thumbnailRotations[index] }],
                        zIndex: 3 - index,
                      },
                    ]}
                    contentFit="cover"
                  />
                ))}
                {hiddenCount > 0 ? (
                  <GlassSurface glass="regular" style={styles.moreBadge}>
                    <AppText variant="caption" color="#FFFFFF">
                      +{hiddenCount}
                    </AppText>
                  </GlassSurface>
                ) : null}
              </View>
            ) : null}
          </View>
          <LoggedPressable onPress={takePhoto} disabled={!permission?.granted} style={{ opacity: permission?.granted ? 1 : 0.35 }} accessibilityRole="button" accessibilityLabel={t('media.takePhoto')}>
            <View style={styles.shutterOuter}>
              <View style={styles.shutterInner} />
            </View>
          </LoggedPressable>
          <View style={[styles.gallerySlot, styles.gallerySlotEnd]}>
            <LoggedPressable
              onPress={() => void pickFromGallery()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('media.openGallery')}>
              <GlassSurface glass="regular" isInteractive style={styles.galleryButton}>
                <AppIcon name="images" color="#FFFFFF" size={24} />
              </GlassSurface>
            </LoggedPressable>
          </View>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    // ponytail: tune CAMERA_BLOCK_HEIGHT on device — tall enough to frame
    // food and small enough to leave room for the keyboard/dock below.
    height: CAMERA_BLOCK_HEIGHT,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // ponytail: tune insets on device
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    zIndex: 1,
  },
  iconButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  titlePill: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  hint: {
    position: 'absolute',
    // ponytail: tune bottom inset on device — must sit above the controls row
    bottom: 80,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
    alignSelf: 'center',
    zIndex: 1,
  },
  permissionCard: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  captureControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // ponytail: tune insets on device
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    zIndex: 1,
  },
  gallerySlot: {
    width: 104,
    minHeight: 56,
    justifyContent: 'center',
  },
  gallerySlotEnd: {
    alignItems: 'flex-end',
  },
  galleryButton: {
    width: 56,
    height: 56,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.one,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: Radii.sm,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  thumbnailOverlap: {
    marginLeft: -28,
  },
  moreBadge: {
    width: 32,
    height: 32,
    marginLeft: -24,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 4,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: Radii.pill,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: Radii.pill,
    backgroundColor: '#FFFFFF',
  },
});
