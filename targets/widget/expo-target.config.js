/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'GymWidget',
  // OpenURLIntent (App Intent that opens the deep link) requires iOS 18; the
  // widgets/containerBackground work fine there too.
  deploymentTarget: '18.0',
  // ponytail: App Group TEMPORARIAMENTE removido (teste b) — pra ver se o widget
  // aparece sem entitlement especial (sideloadly/conta grátis). Se aparecer (com
  // zeros), o App Group era o bloqueio. REVERTER junto com o bloco em app.json:
  // entitlements: {
  //   'com.apple.security.application-groups': ['group.com.ompinho.gymnotes'],
  // },
};
