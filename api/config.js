/**
 * GET /api/config
 * Returns the Google Maps key from an environment variable, so the key
 * is not stored in the source code.
 * Accepted variable names (first one found is used):
 *   GOOGLE_MAPS_API_KEY, GOOGLE_PLACES_API_KEY
 */
module.exports = (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ googleMapsApiKey: key });
};