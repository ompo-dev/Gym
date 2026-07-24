/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'GymWidget',
  // Widgets + AppShortcutsProvider use iOS 17 SwiftUI APIs (containerBackground).
  deploymentTarget: '17.0',
};
