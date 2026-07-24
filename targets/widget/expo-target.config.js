/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'GymWidget',
  // Widgets + AppShortcutsProvider use iOS 17 SwiftUI APIs (containerBackground).
  deploymentTarget: '17.0',
  // Shared with the main app so the widget can read today's snapshot the RN app
  // writes via @bacons/apple-targets ExtensionStorage. Must match app.json.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.ompinho.gymnotes'],
  },
};
