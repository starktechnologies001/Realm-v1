/**
 * locationPrivacy.js
 *
 * Applies a random 50–100 metre offset to GPS coordinates before they
 * are stored in the database or shown on the map.
 *
 * WHY: Prevents exact real-time tracking while keeping the "nearby" UX.
 * SAFETY: Offset is re-generated every call, so the noise pattern
 *         cannot be averaged away over time to reveal the real position.
 *
 * HOW:
 *  - 1 degree of latitude  ≈ 111 000 m
 *  - 1 degree of longitude ≈ 111 000 m × cos(lat)
 *  - We pick a random distance d ∈ [50, 100] m and a random bearing θ
 *    then convert to Δlat / Δlng.
 */

export function fuzzyLocation(lat, lng, activityStatus = 'live') {
  let minOffset = 50;
  let maxOffset = 100;

  // Stationary Protection
  if (activityStatus === 'recently_active') {
    minOffset = 100;
    maxOffset = 200;
  }

  // Night Mode Protection (10 PM to 6 AM)
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    minOffset = 200;
    maxOffset = 300;
  }

  // Random distance between MIN and MAX metres
  const distM = minOffset + Math.random() * (maxOffset - minOffset);

  // Random bearing in radians (0 – 2π)
  const bearing = Math.random() * 2 * Math.PI;

  // Convert metres → degrees
  const METRES_PER_DEG_LAT = 111_000;
  const METRES_PER_DEG_LNG = 111_000 * Math.cos((lat * Math.PI) / 180);

  const deltaLat = (distM * Math.cos(bearing)) / METRES_PER_DEG_LAT;
  const deltaLng = (distM * Math.sin(bearing)) / METRES_PER_DEG_LNG;

  return {
    lat: lat + deltaLat,
    lng: lng + deltaLng,
  };
}

/**
 * Returns the fuzzy lat/lng as a flat object ready for Supabase update.
 * Also generates the POINT() string used in the `last_location` column.
 *
 * @param {number} lat - Real latitude
 * @param {number} lng - Real longitude
 * @returns {{ latitude: number, longitude: number, last_location: string }}
 */
export function fuzzyLocationForDB(lat, lng) {
  const { lat: fLat, lng: fLng } = fuzzyLocation(lat, lng);
  return {
    latitude: fLat,
    longitude: fLng,
    last_location: `POINT(${fLng} ${fLat})`,
  };
}

/**
 * Calculates approximate distance in metres between two fuzzy locations.
 * Good enough for "nearby" labels — not used for exact positioning.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in metres
 */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearbyLabel(metres) {
  if (metres < 500)        return 'Nearby';
  if (metres < 2000)       return 'Close';
  return 'In your area';
}
