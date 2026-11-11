// Run after configuring CLAMAV_HOST/CLAMAV_PORT and FFPROBE_PATH.
// Only scans private quarantined uploads; it never publishes a track.
const { query, pool } = require('../src/config/db');
const { scanUpload } = require('../src/services/artistService');

(async () => {
  const requestedId = process.argv[2];
  try {
    const rows = requestedId
      ? [{ upload_id: requestedId }]
      : await query("SELECT upload_id FROM artist_uploads WHERE status IN ('QUARANTINED','PROCESSING_FAILED') ORDER BY created_at LIMIT 20");
    if (!rows.length) console.log('No quarantined artist uploads are waiting for scanning.');
    for (const row of rows) {
      try {
        const result = await scanUpload(row.upload_id, null);
        console.log(`${row.upload_id}: ${result.status} (${result.scanStatus})`);
      } catch (err) {
        console.error(`${row.upload_id}: ${err.code || 'SCAN_ERROR'} — ${err.message}`);
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
