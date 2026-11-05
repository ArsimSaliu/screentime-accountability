import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with values that depend on the environment.
 *
 * Universal links: when EXPO_PUBLIC_WEB_URL is set at build time (EAS env), invite links like
 * https://<web>/join/<code> open the app directly instead of the website. The web app serves the
 * matching /.well-known/apple-app-site-association file (set APPLE_APP_ID there).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  let host: string | null = null;
  try {
    host = webUrl ? new URL(webUrl).host : null;
  } catch {
    host = null;
  }

  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      associatedDomains: host ? [`applinks:${host}`] : config.ios?.associatedDomains,
    },
  };
};
