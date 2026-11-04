/**
 * GET /api/config
 *
 * Hands the browser the Google Maps key from an environment variable, so the
 * key lives in your hosting settings (Vercel → Project → Settings →
 * Environment Variables) and not in the source code.
 *
 *   GOOGLE_MAPS_API_KEY = <your key>
 *
 * A Maps JavaScript key is always visible to the browser once the map loads,
 * so protect it in Google Cloud Console instead:
 *   • Application restrictions → HTTP referrers → https://taskroom.in/*  (and your www / preview domains)
 *   • API restrictions → Maps JavaScript API, Places API (New), Geocoding API
 */
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
};
