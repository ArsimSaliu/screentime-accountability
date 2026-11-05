/**
 * Apple App Site Association: lets iOS open /join/<code> invite links in the Leash app.
 * Set APPLE_APP_ID to "<TeamID>.<bundle id>", e.g. "ABCDE12345.com.alexk.leash".
 */
export function GET() {
  const appId = process.env.APPLE_APP_ID;
  const body = {
    applinks: {
      details: appId ? [{ appIDs: [appId], components: [{ '/': '/join/*', comment: 'Partner invite links' }] }] : [],
    },
  };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
