const { withAndroidManifest } = require('expo/config-plugins');

// The app validates local IP literals before opening a plaintext WebSocket.
// Android otherwise blocks even an explicitly paired LAN connection.
module.exports = function withLocalAgentNetwork(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return result;
  });
};
