'use strict';

/** A reorder request must be an exact permutation of the existing playlist IDs. */
function isExactPlaylistOrder(currentIds, requestedIds) {
  if (!Array.isArray(currentIds) || !Array.isArray(requestedIds) || currentIds.length !== requestedIds.length) return false;
  const current = currentIds.map(Number);
  const requested = requestedIds.map(Number);
  if (new Set(current).size !== current.length || new Set(requested).size !== requested.length) return false;
  const allowed = new Set(current);
  return requested.every((id) => Number.isSafeInteger(id) && allowed.has(id));
}

module.exports = { isExactPlaylistOrder };
