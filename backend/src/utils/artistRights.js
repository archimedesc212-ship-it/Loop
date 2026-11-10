// Small pure checks used by both playback resolution and the direct media endpoint.
function artistTerritoryAllows(codes, user) {
  let territories = codes;
  if (typeof territories === 'string') {
    try { territories = JSON.parse(territories); } catch { return false; }
  }
  if (!Array.isArray(territories) || !territories.length) return false;
  if (territories.includes('WORLDWIDE')) return true;
  const country = typeof user?.regionCode === 'string' ? user.regionCode.slice(0, 2).toUpperCase() : '';
  return !!country && territories.includes(country);
}

module.exports = { artistTerritoryAllows };
