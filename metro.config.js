// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports wa-sqlite.wasm; without this Metro treats it
// as source and the web bundle fails to resolve it. Additive — native is
// unaffected, it just never asks for this extension.
config.resolver.assetExts.push('wasm');

module.exports = config;
