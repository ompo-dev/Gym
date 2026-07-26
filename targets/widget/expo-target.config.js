/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'GymWidget',
  // OpenURLIntent (App Intent that opens the deep link) requires iOS 18; the
  // widgets/containerBackground work fine there too.
  deploymentTarget: '18.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.ompinho.gymnotes'],
  },
};
