# iOS native surface (@expo/ui SwiftUI)

Status as of the SDK 57 upgrade. This file documents what is genuinely native
on iOS, what falls back to React Native, and what is left to convert.

## Runtime model

- **App is managed** (no `ios/` prebuild). Real native SwiftUI (`@expo/ui`) and
  the ExpoUI native module only exist in a **custom dev/EAS build** — not in the
  App Store Expo Go app. This is why the project left SDK 54 / Expo Go.
- **Platform split, no runtime guard:** `onboardingNative.ios.ts` imports SwiftUI
  straight from `@expo/ui/swift-ui` (the docs pattern) and exports
  `IOS_NATIVE_ENABLED = true`; `onboardingNative.ts` (Android/web) stubs every
  export and sets it `false`. Metro resolves the file per platform, so there is no
  lazy `require` and no kill switch — components just branch on `IOS_NATIVE_ENABLED`.
- New native components follow the same rule: either `Component.ios.tsx` +
  `Component.tsx`, or an inline `if (IOS_NATIVE_ENABLED)` branch with an RN fallback.

### Build & test the native UI

```bash
eas build --profile development --platform ios
```

Install that dev client on the device, then `npx expo start --dev-client`. The
SwiftUI controls only render there. If the app SIGABRTs on boot, set
`IOS_NATIVE_ENABLED = false` in `onboardingNative.ios.ts` (falls back to RN
everywhere) and capture the crash log.

## @expo/ui SwiftUI component catalog (SDK 57)

`@expo/ui/swift-ui` renders real SwiftUI views inside a `Host` container.
Modifiers come from `@expo/ui/swift-ui/modifiers` and are passed as a
`modifiers={[...]}` array. Grouped by role:

### Containers / layout
- **Host** — the bridge; every SwiftUI tree is wrapped in one. Props we use:
  `style`, `colorScheme`, `matchContents`, `useViewportSizeMeasurement`.
- **VStack / HStack / ZStack** — stacks. **Group** — logical grouping without
  layout (used to attach modifiers like `menuActionDismissBehavior`).
- **LazyVStack / LazyHStack**, **ScrollView**, **Spacer**, **Divider**,
  **Section**, **Form**, **List**, **DisclosureGroup**.

### Controls (the "real iOS" widgets)
- **Picker** — segmented / menu / wheel via `pickerStyle()`; children are
  `Text` with a `tag()` modifier. → our `NativeSegmented`, onboarding picker.
- **Button** — `label`, `systemImage` (SF Symbol), `role`
  (`default`/`cancel`/`destructive`), `modifiers` (`buttonStyle`, `controlSize`,
  `tint`, `frame`). → onboarding primary button, detail-sheet menu items.
- **Menu** — tap-to-open dropdown; children can be `Button`, `Toggle`,
  `Picker`, `Section`, `Divider`, nested `Menu`. → detail-sheet action menu.
- **Toggle**, **Slider**, **DatePicker**, **ColorPicker**, **TextField**,
  **SecureField**, **Stepper**-like controls, **ControlGroup**.

### Presentation
- **BottomSheet** — `isPresented` / `onIsPresentedChange`, detents via
  `presentationDetents()`. → onboarding picker/date sheets.
- **Popover**, **Alert**, **ConfirmationDialog**, **ContextMenu**,
  **Overlay**, **SwipeActions**, **TabView**.

### Display / misc
- **Text**, **Label**, **Image** (SF Symbols), **Link**, **Gauge**,
  **ProgressView**, **Namespace**, **AccessoryWidgetBackground**,
  **RNHostView** (embed RN views back inside SwiftUI).

## App native map

`.ios.tsx` = native iOS file; `.tsx` = RN fallback (Android/web/Expo Go).

| Surface | Native today | Path |
| --- | --- | --- |
| Tab bar | ✅ `NativeTabs` (SF Symbols + Liquid Glass) | `app-tabs.ios.tsx` / custom glass bar in `app-tabs.tsx` |
| Icons | ✅ SF Symbols (`expo-symbols`) | `AppIcon.ios.tsx` / lucide in `AppIcon.tsx` |
| Liquid Glass | ✅ `expo-glass-effect` (iOS 26) | `GlassSurface.ios.tsx` / BlurView fallback |
| Segmented select | ✅ SwiftUI `Picker(segmented)` | `NativeSegmented` (in `WorkoutMonitorSheet`) |
| Detail-sheet action menu | ✅ SwiftUI `Menu` | `FoodEntryDetailSheet` (native path) |
| Onboarding primary button | ✅ SwiftUI `Button` | `onboardingControls` |
| Onboarding height/date picker | ✅ SwiftUI `BottomSheet` + `Picker(wheel)` | `onboardingControls` (weight still RN wheels) |
| Settings toggles / switches | ✅ SwiftUI `Toggle` | shared `Toggle` primitive (`settings/primitives`, nutrition edit) |
| Bias slider | ✅ SwiftUI `Slider` | `EstimationBiasSheet` |
| Camera action menu | ✅ SwiftUI `Menu` | `DayTemplate` keyboard button (no popover on iOS) |
| Settings sheets (Form) | 🚧 SwiftUI `Form` — pilot | `HealthProfileSheet` done (native branch); `NutritionGoals`/`WorkoutMonitor`/`Pantry` pending device-verify then replicate |
| **App sheets/modals** | ❌ RN `Modal` + glass | `SheetFrame` — candidate → SwiftUI `BottomSheet` |
| **Macro / workout stat bars** | ❌ custom RN | `MacroStat`, bars — need native Swift |
| **Goal / progress rings** | ❌ custom RN (SVG) | `ProgressRing` — candidate → SwiftUI `Gauge` |

## Full @expo/ui catalog audit (all 39)

Swept the whole component tree against every SDK-57 SwiftUI component.

**Live natively:** Host, Picker, Button, Menu, Toggle, Slider, BottomSheet,
DatePicker, Form, Section, Text, VStack, Group, Divider (+ HStack/ZStack/Spacer/
Image/Label used as needed inside hosts).

**In progress:** Form rewrite of settings (pilot `HealthProfileSheet`) — brings
`TextField` (number inputs) and optionally `SecureField` with it.

**Already native via RN — swapping is lateral, not an upgrade:**
- `Alert` — `Alert.alert` (SettingsSheet erase-data) is UIAlertController already.
- `TextField` / `SecureField` — RN `TextInput` / `secureTextEntry` (ApiKeys, note
  composer) is a native UITextField already, and keeps custom styling the SwiftUI
  versions drop. Left as RN outside the Form.

**Would regress a custom design — kept RN on purpose:**
- `Gauge` / `ProgressView` — the goal rings + calories bar (`FoodGoalsSheet`,
  `ProgressRing`) are custom-sized, per-macro-tinted, with an animated centered
  value. Native equivalents are thin/small and can't host the centered value.
- `List` / `DisclosureGroup` — the food-detail accordion and note/entry lists are
  custom glass rows on RN FlatList; native would be a full rewrite that loses the
  design.

**Not applicable (no matching UI — would be new features, not conversions):**
ColorPicker, ContextMenu, ControlGroup, LazyHStack, LazyVStack, Link, Namespace,
Overlay, Popover, RNHostView, ScrollView, SwipeActions, TabView (tab bar already
NativeTabs), AccessoryWidgetBackground (for widgets, not built yet).

**Optional native additions (additive, not conversions) — say the word:**
- `ContextMenu` on food/note rows (long-press → Edit/Delete) — a real iOS pattern
  we don't have yet.
- `SwipeActions` swipe-to-delete on entry rows.
- `Gauge` for the progress viz if you accept the thinner native look.

## Remaining native opportunities

Ordered by value / risk. All keep the RN fallback via `IOS_NATIVE_ENABLED`.

1. **Camera action menu → SwiftUI `Menu`** (`FoodMediaActionMenu`). The 3 options
   (food photo / menu photo / barcode) map to `Menu` + `Button` children. Needs
   the *trigger* rewired: a SwiftUI `Menu` anchors to its own button, so the
   opener in `DayTemplate` / `AppModalHost` must host the `Menu` instead of
   toggling a free-floating popover. Multi-file; verify on device.
2. **App sheets → SwiftUI `BottomSheet`** (`SheetFrame`). The onboarding sheets
   already do this; generalising `SheetFrame` to a native detented sheet on iOS
   would make every app modal feel native. Larger refactor (scroll/keyboard
   insets, nested sheets) — do it deliberately.
3. **Goal rings → SwiftUI `Gauge`** (`ProgressRing`). `Gauge(accessoryCircular)`
   is the native equivalent of the SVG ring. 1:1-ish; low risk.
4. **Macro/workout stat bars → native Swift.** No 1:1 primitive; these are
   custom multi-segment bars. Requires the Expo UI "extending" API (real Swift
   in a local module / config plugin). Highest effort, lowest marginal gain —
   the RN versions already look right. Defer unless you want pixel-native.
