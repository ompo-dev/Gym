import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

// ponytail: kill switch para isolar o SIGABRT no boot. Deixe false ate confirmar
// que o ExpoUI nao e a causa; volte para true (ou remova a flag) depois.
const ENABLE_EXPO_UI = false;

type SwiftUiBundle = {
  BottomSheet: any;
  Button: any;
  DatePicker: any;
  Divider: any;
  Group: any;
  Host: any;
  Menu: any;
  Picker: any;
  Slider: any;
  Text: any;
  Toggle: any;
  VStack: any;
  modifiers: Record<string, any>;
};

let swiftUiBundleCache: SwiftUiBundle | null | undefined;

function loadSwiftUiBundle(): SwiftUiBundle | null {
  if (swiftUiBundleCache !== undefined) {
    return swiftUiBundleCache;
  }

  if (!ENABLE_EXPO_UI || Platform.OS !== "ios" || !requireOptionalNativeModule("ExpoUI")) {
    swiftUiBundleCache = null;
    return swiftUiBundleCache;
  }

  try {
    // Expo Go does not ship ExpoUI, so this must stay lazy.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const swiftUi = require("@expo/ui/swift-ui");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modifiers = require("@expo/ui/swift-ui/modifiers");

    swiftUiBundleCache = {
      ...swiftUi,
      modifiers,
    };
  } catch {
    swiftUiBundleCache = null;
  }

  return swiftUiBundleCache ?? null;
}

const swiftUiBundle = loadSwiftUiBundle();
export const SwiftBottomSheet = swiftUiBundle?.BottomSheet as any;
export const SwiftButton = swiftUiBundle?.Button as any;
export const SwiftDivider = swiftUiBundle?.Divider as any;
export const SwiftGroup = swiftUiBundle?.Group as any;
export const SwiftHost = swiftUiBundle?.Host as any;
export const SwiftMenu = swiftUiBundle?.Menu as any;
export const SwiftPicker = swiftUiBundle?.Picker as any;
export const SwiftText = swiftUiBundle?.Text as any;
export const SwiftToggle = swiftUiBundle?.Toggle as any;
export const SwiftVStack = swiftUiBundle?.VStack as any;
export const swiftButtonStyle = swiftUiBundle?.modifiers.buttonStyle as any;
export const swiftControlSize = swiftUiBundle?.modifiers.controlSize as any;
export const swiftFont = swiftUiBundle?.modifiers.font as any;
export const swiftForegroundStyle = swiftUiBundle?.modifiers.foregroundStyle as any;
export const swiftFrame = swiftUiBundle?.modifiers.frame as any;
export const swiftLabelStyle = swiftUiBundle?.modifiers.labelStyle as any;
export const swiftLabelsHidden = swiftUiBundle?.modifiers.labelsHidden as any;
export const swiftMenuActionDismissBehavior = swiftUiBundle?.modifiers
  .menuActionDismissBehavior as any;
export const swiftPadding = swiftUiBundle?.modifiers.padding as any;
export const swiftPickerStyle = swiftUiBundle?.modifiers.pickerStyle as any;
export const presentationDetents = swiftUiBundle?.modifiers.presentationDetents as any;
export const presentationDragIndicator = swiftUiBundle?.modifiers
  .presentationDragIndicator as any;
export const swiftTag = swiftUiBundle?.modifiers.tag as any;
export const swiftTint = swiftUiBundle?.modifiers.tint as any;
export const swiftToggleStyle = swiftUiBundle?.modifiers.toggleStyle as any;
export const IOS_NATIVE_ENABLED = Platform.OS === "ios" && !!swiftUiBundle;
