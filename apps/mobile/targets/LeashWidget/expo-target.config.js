// Home-screen / lock-screen widget: streak and pending request.
// Built by @kingstinct/expo-apple-targets (via the react-native-device-activity plugin) during prebuild.
const getAppGroup = require('react-native-device-activity/config-plugin/getAppGroupFromExpoConfig');

/** @type {import('@kingstinct/expo-apple-targets/build/config-plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'LeashWidget',
  deploymentTarget: '17.0',
  frameworks: ['WidgetKit', 'SwiftUI'],
  entitlements: {
    'com.apple.security.application-groups': [getAppGroup(config)],
  },
  colors: {
    LeashAccent: { color: '#6366F1', darkColor: '#818CF8' },
  },
});
