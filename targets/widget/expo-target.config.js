/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'GymWidget',
  // OpenURLIntent (App Intent that opens the deep link) requires iOS 18; the
  // widgets/containerBackground work fine there too.
  deploymentTarget: '18.0',
  // Shared with the main app so the widget can read today's snapshot the RN app
  // writes via @bacons/apple-targets ExtensionStorage. Must match app.json.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.ompinho.gymnotes'],
  },
};
