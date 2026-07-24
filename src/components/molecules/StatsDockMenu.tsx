import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import {
  SwiftHost,
  SwiftMenu,
  SwiftRNHostView,
} from '@/components/onboarding/onboardingNative';

interface StatsDockMenuProps {
  /** Always-visible bar that triggers the menu — the stats dock itself. */
  trigger: ReactElement;
  /** Rich block shown when the menu opens — goals + today's progress. */
  content: ReactElement;
}

/**
 * The stats dock, rebased on the native SwiftUI menu (same family as
 * NativeMenuButton). Tapping the bar opens a native menu whose content is the
 * goals/progress block, hosted through `RNHostView` so the existing RN blocks
 * render as-is — no rebuild. iOS-only: render behind `IOS_NATIVE_ENABLED`, the
 * caller keeps the RN toggle fallback.
 *
 * ponytail: @expo/ui documents Menu content as controls-only; RNHostView is the
 * bridge that lets it host arbitrary RN. Only a device build confirms the menu
 * renders the block — if it comes up empty, the Popover variant is the drop-in.
 */
export function StatsDockMenu({ trigger, content }: StatsDockMenuProps) {
  return (
    <SwiftHost matchContents={{ horizontal: false, vertical: true }} style={styles.host}>
      <SwiftMenu label={<SwiftRNHostView matchContents>{trigger}</SwiftRNHostView>}>
        <SwiftRNHostView matchContents>{content}</SwiftRNHostView>
      </SwiftMenu>
    </SwiftHost>
  );
}

const styles = StyleSheet.create({
  host: {
    alignSelf: 'stretch',
  },
});
