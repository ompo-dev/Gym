import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import type { FoodMediaAction } from '@/core/types';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface CapturedFoodPhoto {
  kind: Extract<FoodMediaAction, 'foodPhoto' | 'menuPhoto'>;
  uri: string;
  base64?: string;
  mimeType?: string;
}

const thumbnailRotations = ['-8deg', '5deg', '-4deg'] as const;

export function FoodMediaCaptureSheet({
  visible,
  mode,
  onClose,
  onDismiss,
  onPhoto,
  onBarcode,
}: {
  visible: boolean;
  mode: FoodMediaAction | null;
  onClose: () => void;
  onDismiss?: () => void;
  onPhoto: (photo: CapturedFoodPhoto) => void;
  onBarcode: (code: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const visibleRef = useRef(false);
  const scannedRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [activeMode, setActiveMode] = useState<FoodMediaAction | null>(mode);
  const [scanned, setScanned] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [capturedUris, setCapturedUris] = useState<string[]>([]);
  const currentMode = mode ?? activeMode;
  const isBarcode = currentMode === 'barcode';

  useEffect(() => {
    if (mode) setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    visibleRef.current = visible;
    scannedRef.current = false;
    setScanned(false);
    if (visible && mode) {
      setScanSession((current) => current + 1);
    } else {
      setCapturedUris([]);
    }
  }, [visible, mode]);

  const takePhoto = async () => {
    if (!currentMode) return;
    try {
      const camera = cameraRef.current;
      if (!camera) return;
      const photo = await camera.takePictureAsync({ base64: true, quality: 0.45 });
      if (!visibleRef.current || !photo?.uri) return;
      const kind = currentMode === 'menuPhoto' ? 'menuPhoto' : 'foodPhoto';
      onPhoto({ kind, uri: photo.uri, base64: photo.base64, mimeType: 'image/jpeg' });
      setCapturedUris((current) => [photo.uri, ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('unmounted')) console.warn('Failed to take food photo', error);
    }
  };

  const pickFromGallery = async () => {
    if (!currentMode) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      base64: true,
      quality: 0.45,
    });
    if (result.canceled) return;
    const kind = currentMode === 'menuPhoto' ? 'menuPhoto' : 'foodPhoto';
    result.assets.forEach((asset) => {
      if (!asset.uri) return;
      onPhoto({
        kind,
        uri: asset.uri,
        base64: asset.base64 ?? undefined,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    });
    setCapturedUris((current) => [
      ...result.assets.map((asset) => asset.uri).filter(Boolean),
      ...current,
    ]);
  };

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (scannedRef.current || scanned) return;
    scannedRef.current = true;
    setScanned(true);
    onBarcode(result.data);
  };

  if (!currentMode) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onDismiss={() => {
        if (!visible) setActiveMode(null);
        onDismiss?.();
      }}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {permission?.granted ? (
          <CameraView
            key={`${currentMode}-${scanSession}`}
            ref={(node) => {
              cameraRef.current = node;
            }}
            style={StyleSheet.absoluteFill}
            facing="back"
            active={visible}
            onBarcodeScanned={isBarcode ? handleBarcode : undefined}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
            }}
          />
        ) : null}

        <View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + Spacing.two,
              paddingBottom: insets.bottom + Spacing.five,
            },
          ]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
                <AppIcon name="x" color="#FFFFFF" size={22} />
              </GlassSurface>
            </Pressable>
            <GlassSurface glass="regular" style={styles.titlePill}>
              <AppText variant="label" color="#FFFFFF">
                {isBarcode ? t('media.scanBarcode') : currentMode === 'foodPhoto' ? t('media.foodPhoto') : t('media.menuPhoto')}
              </AppText>
            </GlassSurface>
          </View>

          <View style={styles.center}>
            {!permission ? null : permission.granted ? (
              isBarcode ? (
                <GlassSurface glass="regular" style={styles.hint}>
                  <AppText variant="body" color="#FFFFFF">
                    {t('media.scanHint')}
                  </AppText>
                </GlassSurface>
              ) : null
            ) : (
              <GlassSurface glass="regular" style={styles.permissionCard}>
                <AppText variant="body" color="#FFFFFF">
                  {t('media.cameraPermission')}
                </AppText>
                <Pressable onPress={() => void requestPermission()} accessibilityRole="button">
                  <AppText variant="label" color={colors.accent}>
                    {t('media.allowCamera')}
                  </AppText>
                </Pressable>
              </GlassSurface>
            )}
          </View>

          {permission?.granted ? (
            <View style={styles.footer}>
              <View style={styles.captureControls}>
                <View style={styles.gallerySlot}>
                  {!isBarcode && capturedUris.length > 0 ? (
                    <View style={styles.thumbnailRow}>
                      {capturedUris.slice(0, 3).map((uri, index) => (
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
                      {capturedUris.length > 3 ? (
                        <GlassSurface glass="regular" style={styles.moreBadge}>
                          <AppText variant="caption" color="#FFFFFF">
                            +{capturedUris.length - 3}
                          </AppText>
                        </GlassSurface>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                <Pressable onPress={takePhoto} accessibilityRole="button" accessibilityLabel={t('media.takePhoto')}>
                  <View style={styles.shutterOuter}>
                    <View style={styles.shutterInner} />
                  </View>
                </Pressable>
                <View style={[styles.gallerySlot, styles.gallerySlotEnd]}>
                  <Pressable
                    onPress={() => void pickFromGallery()}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('media.openGallery')}>
                    <GlassSurface glass="regular" isInteractive style={styles.galleryButton}>
                      <AppIcon name="images" color="#FFFFFF" size={24} />
                    </GlassSurface>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  center: {
    alignItems: 'center',
  },
  hint: {
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    overflow: 'hidden',
  },
  permissionCard: {
    borderRadius: Radii.lg,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
    overflow: 'hidden',
  },
  footer: {
    width: '100%',
  },
  captureControls: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
