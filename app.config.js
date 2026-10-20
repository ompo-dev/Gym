const { expo } = require('./app.json');

module.exports = {
  expo: {
    ...expo,
    ios: {
      ...expo.ios,
      buildNumber: process.env.IOS_BUILD_NUMBER || expo.ios.buildNumber || '1',
      ...(process.env.IOS_APPLE_TEAM_ID ? { appleTeamId: process.env.IOS_APPLE_TEAM_ID } : {}),
    },
    android: {
      ...expo.android,
      versionCode: Number(process.env.ANDROID_VERSION_CODE || expo.android.versionCode || 1),
    },
  },
};
