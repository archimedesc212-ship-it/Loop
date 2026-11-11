'use strict';

/**
 * Decide whether local-filesystem audio is safe to use in this process.
 * Serverless function filesystems are ephemeral, so an explicit enable flag
 * must never override the serverless safety boundary.
 */
function localMediaEnabled({ isServerless, configured }) {
  if (isServerless) return false;
  if (configured === undefined || configured === null || configured === '') return true;
  return String(configured).toLowerCase() === 'true';
}

module.exports = { localMediaEnabled };
