import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Keyboard, Modal, ScrollView, StyleSheet, type KeyboardEvent, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { LoggedPressable } from "@/components/atoms/Logged";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

interface SheetFrameProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  children: ReactNode;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  hideDefaultClose?: boolean;
  centerTitle?: boolean;
  overlay?: ReactNode;
  scroll?: boolean;
  keyboardAwareScroll?: boolean;
  contentBottomInset?: number;
  /** 'sheet' = glass bottom card (default), 'full' = native iOS page sheet. */
  size?: "sheet" | "full";
}

export function SheetFrame({
  visible,
  title,
  onClose,
  onDismiss,
  children,
  headerLeading,
  headerTrailing,
  hideDefaultClose = false,
  centerTitle = false,
  overlay,
  scroll = true,
  keyboardAwareScroll = false,
  contentBottomInset = 0,
  size = "sheet",
}: SheetFrameProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isFull = size === "full";
  const [headerHeight, setHeaderHeight] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const scrollBottomInset = Math.max(
    contentBottomInset,
    keyboardInset > 0 ? keyboardInset + Spacing.five : 0,
  );

  useEffect(() => {
    if (!visible || !keyboardAwareScroll) {
      setKeyboardInset(0);
      return undefined;
    }

    const show = ({ endCoordinates }: KeyboardEvent) => setKeyboardInset(endCoordinates.height);
    const willShow = Keyboard.addListener("keyboardWillShow", show);
    const didShow = Keyboard.addListener("keyboardDidShow", show);
    const willHide = Keyboard.addListener("keyboardWillHide", () => setKeyboardInset(0));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      willShow.remove();
      didShow.remove();
      willHide.remove();
      hide.remove();
    };
  }, [keyboardAwareScroll, visible]);

  const handle = (
    <View style={[styles.handle, { backgroundColor: colors.border }]} />
  );

  const closeButton = (
    <LoggedPressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("common.close")}
    >
      <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
        <AppIcon name="x" color={colors.textSecondary} size={18} />
      </GlassSurface>
    </LoggedPressable>
  );

  const header = centerTitle ? (
    <View style={styles.centerHeader}>
      <View style={styles.headerSide}>{headerLeading}</View>
      <AppText variant="heading" numberOfLines={1} style={styles.centerTitle}>
        {title}
      </AppText>
      <View style={[styles.headerSide, styles.headerSideEnd]}>
        {headerTrailing}
        {hideDefaultClose ? null : closeButton}
      </View>
    </View>
  ) : (
    <View style={styles.header}>
      <AppText variant="heading">{title}</AppText>

      <View style={styles.actions}>
        {headerTrailing}
        {hideDefaultClose ? null : closeButton}
      </View>
    </View>
  );

  // Native iOS page sheet with a glass header that frosts content scrolling under it.
  if (isFull) {
    const page = (
        // Not a bottom-inset SafeAreaView: that left a fixed background band
        // under the scroll. The scroll fills edge to edge and the safe area is
        // folded into the content padding, so the last card clears the home
        // indicator without a dead bar below it.
        <View style={[styles.fill, { backgroundColor: colors.background }]}>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[
              styles.contentFull,
              {
                paddingTop: headerHeight + Spacing.four,
                paddingBottom: Spacing.four + insets.bottom + scrollBottomInset,
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={false}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              setScrolled(nativeEvent.contentOffset.y > 4);
            }}
          >
            {children}
          </ScrollView>

          <View
            style={styles.headerBar}
            onLayout={({ nativeEvent }) =>
              setHeaderHeight(nativeEvent.layout.height)
            }
          >
            {/* Glass only once content is behind it; keep the header tintless. */}
            {scrolled ? (
              <GlassSurface
                glass="regular"
                style={[StyleSheet.absoluteFill, styles.headerGlass]}
              />
            ) : null}
            {handle}
            {header}
          </View>
          {overlay}
        </View>
    );

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
        onDismiss={onDismiss}
      >
        {page}
      </Modal>
    );
  }

  const content = scroll ? (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={[
        styles.content,
        scrollBottomInset > 0 && { paddingBottom: scrollBottomInset },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={false}
      scrollEventThrottle={16}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={[styles.modal, { backgroundColor: colors.overlay }]}>
        <LoggedPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        <SafeAreaView
          style={styles.safe}
          edges={["left", "right", "bottom"]}
          pointerEvents="box-none">
          <GlassSurface glass="regular" style={styles.sheet}>
            {handle}
            {header}
            {content}
          </GlassSurface>
          {overlay}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: "flex-end",
  },
  safe: {
    // Fill the screen so the card can anchor to the bottom AND so the sheet's
    // percentage maxHeight has a definite height to resolve against. box-none in
    // the JSX lets taps on the empty area above the card fall through to the
    // backdrop that closes the sheet.
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  // The card hugs its content (flexGrow 0) but yields (flexShrink 1) once the
  // content would push the sheet past maxHeight — that is what turns on scroll
  // instead of clipping. Only the bottom-sheet mode uses this; `size="full"`
  // has its own full-height ScrollView.
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  fill: {
    flex: 1,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    overflow: "hidden",
  },
  headerGlass: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  sheet: {
    maxHeight: "88%",
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: Radii.pill,
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  iconButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  centerHeader: {
    minHeight: Metrics.iconButton,
    flexDirection: "row",
    alignItems: "center",
  },
  centerTitle: {
    flex: 1,
    textAlign: "center",
  },
  headerSide: {
    width: Metrics.iconButton,
    alignItems: "flex-start",
  },
  headerSideEnd: {
    alignItems: "flex-end",
  },
  content: {
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  contentFull: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
});
