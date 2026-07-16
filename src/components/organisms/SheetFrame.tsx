import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  children: ReactNode;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  hideDefaultClose?: boolean;
  centerTitle?: boolean;
  overlay?: ReactNode;
  scroll?: boolean;
  /** 'sheet' = glass bottom card (default), 'full' = native iOS page sheet. */
  size?: "sheet" | "full";
}

export function SheetFrame({
  visible,
  title,
  onClose,
  children,
  headerLeading,
  headerTrailing,
  hideDefaultClose = false,
  centerTitle = false,
  overlay,
  scroll = true,
  size = "sheet",
}: SheetFrameProps) {
  const colors = useColors();
  const isFull = size === "full";
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const keyboardPadding = keyboardInset > 0
    ? keyboardInset + Math.round(viewportHeight * 0.45)
    : 0;

  const scrollFocusedInputToCenter = useCallback((animated: boolean) => {
    const scroll = scrollRef.current;
    const nativeScroll = scroll?.getNativeScrollRef();
    const focusedInput = TextInput.State.currentlyFocusedInput?.();
    if (!scroll || !nativeScroll || !focusedInput) return;

    nativeScroll.measureInWindow((_scrollX, scrollWindowY, _scrollWidth, scrollHeight) => {
      focusedInput.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
        const visibleTop = scrollWindowY + (isFull ? headerHeight + Spacing.four : 0);
        const visibleBottom = keyboardTop.current
          ? Math.min(scrollWindowY + scrollHeight, keyboardTop.current - Spacing.four)
          : scrollWindowY + scrollHeight;
        const visibleHeight = visibleBottom - visibleTop;
        if (visibleHeight <= 0) return;

        const desiredCenter = visibleTop + visibleHeight / 2;
        const inputCenter = inputY + inputHeight / 2;
        const delta = inputCenter - desiredCenter;
        if (Math.abs(delta) < 8) return;

        const y = Math.max(0, scrollY.current + delta);
        scroll.scrollTo({ y, animated });
      });
    });
  }, [headerHeight, isFull]);

  const scheduleFocusedInputScroll = useCallback((animated = true) => {
    requestAnimationFrame(() => scrollFocusedInputToCenter(animated));
    setTimeout(() => scrollFocusedInputToCenter(animated), 80);
  }, [scrollFocusedInputToCenter]);

  useEffect(() => {
    if (!visible) return undefined;

    const show = Keyboard.addListener("keyboardDidShow", ({ endCoordinates }) => {
      keyboardTop.current = endCoordinates.screenY;
      setKeyboardInset(endCoordinates.height);
      scheduleFocusedInputScroll(true);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      setKeyboardInset(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible, scheduleFocusedInputScroll]);

  useEffect(() => {
    if (keyboardInset > 0) scheduleFocusedInputScroll(true);
  }, [keyboardInset, scheduleFocusedInputScroll]);

  const handle = (
    <View style={[styles.handle, { backgroundColor: colors.border }]} />
  );

  const closeButton = (
    <Pressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("common.close")}
    >
      <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
        <AppIcon name="x" color={colors.textSecondary} size={18} />
      </GlassSurface>
    </Pressable>
  );

  const header = centerTitle ? (
    <View style={styles.centerHeader}>
      <View style={styles.headerSide}>{headerLeading}</View>
      <AppText variant="heading" style={styles.centerTitle}>
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
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
        onDismiss={onClose}
      >
        <SafeAreaView
          style={[styles.fill, { backgroundColor: colors.background }]}
          edges={["bottom"]}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.fill}
            contentContainerStyle={[
              styles.contentFull,
              { paddingTop: headerHeight + Spacing.four },
              keyboardPadding > 0 && { paddingBottom: Spacing.four + keyboardPadding },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            scrollEventThrottle={16}
            onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
            onTouchEnd={() => scheduleFocusedInputScroll(true)}
            onScroll={({ nativeEvent }) => {
              scrollY.current = nativeEvent.contentOffset.y;
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
        </SafeAreaView>
      </Modal>
    );
  }

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[
        styles.content,
        keyboardPadding > 0 && { paddingBottom: keyboardPadding },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      scrollEventThrottle={16}
      onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
      onTouchEnd={() => scheduleFocusedInputScroll(true)}
      onScroll={({ nativeEvent }) => {
        scrollY.current = nativeEvent.contentOffset.y;
      }}
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
    >
      <View style={[styles.modal, { backgroundColor: colors.overlay }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t("common.close")}
        />
        <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
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
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
});
