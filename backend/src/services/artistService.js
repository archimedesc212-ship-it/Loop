// Independent-artist onboarding and rights-gated audio publishing.
// Files are stored in a private quarantine directory under LOCAL_MEDIA_DIR.
// They are never published or playable until ClamAV + ffprobe pass and an
// authorized moderator approves and publishes the upload.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { pipeline: pipe } = require('stream/promises');
const { Transform } = require('stream');
const { query, one, withTransaction } = require('../config/db');
const { session } = require('../config/env');
const { localMedia } = require('../providers');
const ApiError = require('../utils/ApiError');
const { AUDIO_TYPES, detectAudio, safeUploadId, isSupportedAudioCodec } = require('../utils/audioSignature');

const TERMS_VERSION = 'LOOP-ARTIST-RIGHTS-1.0';
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024;
const maxBytes = () => {
  const n = Number(process.env.ARTIST_UPLOAD_MAX_BYTES || DEFAULT_MAX_BYTES);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, DEFAULT_MAX_BYTES) : DEFAULT_MAX_BYTES;
};
const quotaBytes = () => {
  const n = Number(process.env.ARTIST_STORAGE_QUOTA_BYTES || DEFAULT_QUOTA_BYTES);
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_QUOTA_BYTES;
};
const quarantineDir = () => path.join(localMedia.dir(), 'artist-quarantine');
const quarantinePath = (id, ext) => path.join(quarantineDir(), `${id}.${ext}`);
const tempPath = (id) => path.join(quarantineDir(), `.${id}.part`);
const finalMediaName = (id, ext) => `artist_${id}.${ext}`;
const event = async (tx, id, actor, code, from, to, note = null) => {
  await tx.query(
    `INSERT INTO artist_upload_events (upload_id, actor_user_id, event_code, from_status, to_status, note)
     VALUES (?, ?, ?, ?, ?, ?)`, [id, actor || null, code, from || null, to || null, note || null]);
};
const ipHash = (ip) => crypto.createHmac('sha256', session.secret || 'local-only').update(`artist-ip:${ip || 'unknown'}`).digest('hex');

function ensureArtistAccount(userId, artistId, tx = null) {
  const run = tx ? tx.one : one;
  return run(
    `SELECT aa.artist_id AS artistId, a.name AS artistName
       FROM artist_accounts aa JOIN artists a USING (artist_id)
      WHERE aa.user_id = ? AND aa.artist_id = ? AND aa.account_status = 'ACTIVE'`, [userId, artistId]);
}

async function myProfile(userId) {
  const [applications, artists, uploads] = await Promise.all([
    query(`SELECT application_id AS id, stage_name AS stageName, status, review_note AS reviewNote,
                  submitted_at AS submittedAt, reviewed_at AS reviewedAt
             FROM artist_applications WHERE user_id = ? ORDER BY application_id DESC`, [userId]),
    query(`SELECT a.artist_id AS id, a.name, a.artist_type AS type, a.bio,
                  aa.account_status AS accountStatus, aa.created_at AS linkedAt
             FROM artist_accounts aa JOIN artists a USING (artist_id)
            WHERE aa.user_id = ? ORDER BY a.name`, [userId]),
    query(`SELECT upload_id AS id, artist_id AS artistId, title, status, scan_status AS scanStatus,
                  scan_detail AS scanDetail, review_note AS reviewNote, created_at AS createdAt,
                  duration_verified_sec AS durationSec, file_size AS fileSize
             FROM artist_uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId]),
  ]);
  return { applications, artists, uploads, termsVersion: TERMS_VERSION, maxUploadBytes: maxBytes() };
}

async function apply(userId, data) {
  return withTransaction(async (tx) => {
    const account = await tx.one('SELECT r.code AS role, u.email FROM users u JOIN roles r USING (role_id) WHERE u.user_id = ? AND u.is_active = 1 FOR UPDATE', [userId]);
    if (!account) throw ApiError.unauthorized();
    if (account.email.endsWith('@guest.loop.invalid')) throw ApiError.forbidden('Create a LOOP account or sign in before applying for artist access.');
    if (account.role !== 'LISTENER') throw ApiError.forbidden('Only an active listener account can apply for artist access.');
    const existingArtist = await tx.one("SELECT 1 AS ok FROM artist_accounts WHERE user_id = ? AND account_status = 'ACTIVE' LIMIT 1", [userId]);
    if (existingArtist) throw ApiError.conflict('ARTIST_ALREADY_ACTIVE', 'This account already has an active artist profile.');
    const pending = await tx.one("SELECT application_id FROM artist_applications WHERE user_id = ? AND status = 'PENDING' LIMIT 1", [userId]);
    if (pending) throw ApiError.conflict('APPLICATION_PENDING', 'You already have an artist application awaiting review.');
    const r = await tx.query(
      `INSERT INTO artist_applications (user_id, stage_name, artist_type, country_code, bio, website_url, proof_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, data.stageName, data.artistType || 'SOLO', data.countryCode || 'IN', data.bio || null,
        data.websiteUrl || null, data.proofUrl || null]);
    await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                    VALUES (?, 'ARTIST_APPLICATION_SUBMITTED', 'artist_application', ?, ?)`,
      [userId, String(r.insertId), JSON.stringify({ stage_name: data.stageName, artist_type: data.artistType || 'SOLO' })]);
    return { id: r.insertId, status: 'PENDING', message: 'Your artist application has been submitted for manual review.' };
  }, { actorId: userId });
}

async function listApplications({ status = 'PENDING', limit = 100 }) {
  return query(
    `SELECT aa.application_id AS id, aa.user_id AS userId, u.username, u.email,
            p.display_name AS displayName, aa.stage_name AS stageName, aa.artist_type AS artistType,
            aa.country_code AS countryCode, aa.bio, aa.website_url AS websiteUrl, aa.proof_url AS proofUrl,
            aa.status, aa.review_note AS reviewNote, aa.submitted_at AS submittedAt
       FROM artist_applications aa JOIN users u USING (user_id) JOIN user_profiles p USING (user_id)
      WHERE (? = 'ALL' OR aa.status = ?) ORDER BY aa.submitted_at ASC LIMIT ?`, [status, status, limit]);
}

async function decideApplication(actor, applicationId, action, note = null) {
  return withTransaction(async (tx) => {
    const a = await tx.one('SELECT * FROM artist_applications WHERE application_id = ? FOR UPDATE', [applicationId]);
    if (!a) throw ApiError.notFound('Artist application');
    if (a.status !== 'PENDING') throw ApiError.conflict('APPLICATION_ALREADY_REVIEWED', 'This application is no longer awaiting review.');
    if (action === 'REJECT') {
      await tx.query(`UPDATE artist_applications SET status = 'REJECTED', reviewer_user_id = ?, review_note = ?, reviewed_at = NOW() WHERE application_id = ?`, [actor, note, applicationId]);
      await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                      VALUES (?, 'ARTIST_APPLICATION_REJECTED', 'artist_application', ?, ?)`, [actor, String(applicationId), JSON.stringify({ user_id: a.user_id, note })]);
      return { id: applicationId, status: 'REJECTED' };
    }
    if (action !== 'APPROVE') throw ApiError.badRequest('Decision must be APPROVE or REJECT.');
    const user = await tx.one('SELECT user_id, is_active FROM users WHERE user_id = ? FOR UPDATE', [a.user_id]);
    if (!user || !user.is_active) throw ApiError.conflict('ARTIST_ACCOUNT_INACTIVE', 'This account is inactive and cannot be approved.');
    const made = await tx.query(
      `INSERT INTO artists (name, disambiguation, artist_type, country_code, bio) VALUES (?, ?, ?, ?, ?)`,
      [a.stage_name, `LOOP account ${a.user_id}`, a.artist_type, a.country_code, a.bio]);
    const artistId = made.insertId;
    await tx.query('INSERT INTO artist_accounts (user_id, artist_id) VALUES (?, ?)', [a.user_id, artistId]);
    const role = await tx.one("SELECT role_id FROM roles WHERE code = 'ARTIST'");
    if (!role) throw new Error('ARTIST role is missing. Apply migration 0008 first.');
    await tx.query('UPDATE users SET role_id = ? WHERE user_id = ?', [role.role_id, a.user_id]);
    await tx.query(`UPDATE artist_applications SET status = 'APPROVED', artist_id = ?, reviewer_user_id = ?, review_note = ?, reviewed_at = NOW() WHERE application_id = ?`,
      [artistId, actor, note, applicationId]);
    await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                    VALUES (?, 'ARTIST_APPLICATION_APPROVED', 'artist_application', ?, ?)`,
      [actor, String(applicationId), JSON.stringify({ user_id: a.user_id, artist_id: artistId })]);
    return { id: applicationId, artistId, status: 'APPROVED', userId: a.user_id };
  }, { actorId: actor });
}

async function createUploadIntent(userId, ip, data) {
  if (localMedia.check().state === 'disabled') {
    throw new ApiError(503, 'ARTIST_UPLOAD_STORAGE_UNAVAILABLE', 'Artist audio uploads are disabled on this serverless deployment until durable private object storage and a scanning worker are configured.');
  }
  if (data.rightsAccepted !== true) throw ApiError.badRequest('You must accept the current LOOP Artist Rights Declaration before creating an upload.');
  if (data.fileSize > maxBytes()) throw new ApiError(413, 'UPLOAD_TOO_LARGE', `The maximum file size is ${Math.round(maxBytes() / 1024 / 1024)} MB.`);
  const declaredMime = String(data.mimeType || '').split(';')[0].toLowerCase();
  const allowedMimeTypes = new Set(['application/octet-stream', 'audio/x-wav', 'audio/x-m4a', ...Object.values(AUDIO_TYPES).map((x) => x.mime)]);
  if (!allowedMimeTypes.has(declaredMime)) throw ApiError.badRequest('The declared upload MIME type is not a supported audio format.');
  const evidence = data.rightsEvidenceRef || null;
  if ((data.compositionRights === 'LICENSED' || data.recordingRights === 'LICENSED') && !evidence) {
    throw ApiError.badRequest('Provide an HTTPS evidence reference when either composition or recording rights are licensed.');
  }
  if (evidence && !/^https:\/\//i.test(evidence)) throw ApiError.badRequest('Rights evidence must use HTTPS.');
  if (data.licenceStart && data.licenceEnd && data.licenceEnd < data.licenceStart) throw ApiError.badRequest('The licence end date must not be earlier than the start date.');
  const territories = Array.isArray(data.territories) && data.territories.length ? data.territories : ['WORLDWIDE'];
  if (territories.includes('WORLDWIDE') && territories.length > 1) throw ApiError.badRequest('Use WORLDWIDE by itself or list specific ISO country codes.');
  const allowedUses = ['INTERACTIVE_STREAMING'];
  const id = crypto.randomBytes(16).toString('hex');
  await withTransaction(async (tx) => {
    // Serialize quota checks per account so simultaneous intents cannot oversubscribe it.
    const user = await tx.one('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
    if (!user) throw ApiError.unauthorized();
    const linked = await tx.one(
      `SELECT artist_id FROM artist_accounts WHERE user_id = ? AND artist_id = ? AND account_status = 'ACTIVE' FOR UPDATE`,
      [userId, data.artistId]);
    if (!linked) throw ApiError.forbidden('You do not manage this artist profile.');
    const quota = await tx.one(
      `SELECT COALESCE(SUM(declared_size), 0) AS used_bytes,
              COALESCE(SUM(status IN ('UPLOADING','QUARANTINED','PROCESSING','PROCESSING_FAILED','PENDING_REVIEW','APPROVED')), 0) AS open_uploads
         FROM artist_uploads WHERE user_id = ? AND created_at >= NOW() - INTERVAL 30 DAY`, [userId]);
    if (Number(quota.used_bytes) + data.fileSize > quotaBytes()) throw new ApiError(429, 'ARTIST_QUOTA_EXCEEDED', 'Your rolling 30-day upload quota has been reached.');
    if (Number(quota.open_uploads || 0) >= 5) throw new ApiError(429, 'TOO_MANY_PENDING_UPLOADS', 'You already have five uploads awaiting processing or review.');
    await tx.query(
      `INSERT INTO artist_uploads
       (upload_id, user_id, artist_id, title, version_label, genre_id, language_id, duration_claim_sec,
        release_year, explicit, declared_size, declared_mime, composition_rights, recording_rights,
        rights_evidence_ref, territory_codes, allowed_uses, licence_start, licence_end,
        royalty_share_pct, royalty_currency, rights_terms_version, rights_accepted_at, rights_ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [id, userId, data.artistId, data.title, data.versionLabel || '', data.genreId, data.languageId || null,
        data.durationSec, data.releaseYear, data.explicit ? 1 : 0, data.fileSize, data.mimeType,
        data.compositionRights, data.recordingRights, evidence, JSON.stringify(territories), JSON.stringify(allowedUses),
        data.licenceStart || null, data.licenceEnd || null, data.royaltySharePct ?? 0, data.royaltyCurrency || 'INR', TERMS_VERSION, ipHash(ip)]);
    await event(tx, id, userId, 'UPLOAD_INTENT_CREATED', null, 'UPLOADING', 'Rights declaration accepted; file not yet uploaded.');
  }, { actorId: userId });
  return { id, status: 'UPLOADING', uploadUrl: `/api/artist/uploads/${id}/content`, method: 'PUT', maxBytes: maxBytes(), termsVersion: TERMS_VERSION };
}

async function storeUpload(userId, id, req) {
  if (localMedia.check().state === 'disabled') {
    throw new ApiError(503, 'ARTIST_UPLOAD_STORAGE_UNAVAILABLE', 'Artist audio uploads are disabled because this deployment has no persistent private media storage.');
  }
  if (!safeUploadId(id)) throw ApiError.notFound('Upload');
  const upload = await one('SELECT * FROM artist_uploads WHERE upload_id = ? AND user_id = ?', [id, userId]);
  if (!upload) throw ApiError.notFound('Upload');
  if (!await ensureArtistAccount(userId, upload.artist_id)) throw ApiError.forbidden('This artist profile is no longer active.');
  if (upload.status !== 'UPLOADING') throw ApiError.conflict('UPLOAD_NOT_OPEN', 'This upload intent is already used or no longer active.');
  const length = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 1 || length > maxBytes() || length !== Number(upload.declared_size)) {
    throw new ApiError(400, 'UPLOAD_LENGTH_MISMATCH', 'Content-Length must exactly match the declared file size and be within the upload limit.');
  }
  const base = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
  const accepted = new Set(['application/octet-stream', ...Object.values(AUDIO_TYPES).map((x) => x.mime), 'audio/x-wav', 'audio/x-m4a']);
  if (!accepted.has(base)) throw ApiError.badRequest('Use an audio MIME type or application/octet-stream.');
  const declaredMime = String(upload.declared_mime || '').split(';')[0].toLowerCase();
  if (declaredMime !== base) throw ApiError.badRequest('The uploaded Content-Type must match the MIME type declared with the upload intent.');

  await fs.promises.mkdir(quarantineDir(), { recursive: true, mode: 0o700 });
  const temp = tempPath(id);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const counter = new Transform({ transform(chunk, enc, cb) {
    bytes += chunk.length;
    if (bytes > maxBytes() || bytes > length) return cb(new ApiError(413, 'UPLOAD_TOO_LARGE', 'The upload exceeded its declared or configured size.'));
    hash.update(chunk);
    cb(null, chunk);
  } });
  let finalPath = null;
  try {
    await pipe(req, counter, fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    if (bytes !== length) throw new ApiError(400, 'UPLOAD_LENGTH_MISMATCH', 'The uploaded byte count did not match Content-Length.');
    const fd = await fs.promises.open(temp, 'r');
    const head = Buffer.alloc(32);
    await fd.read(head, 0, head.length, 0);
    await fd.close();
    const detected = detectAudio(head);
    if (!detected) throw ApiError.badRequest('The uploaded file does not have a supported audio container signature.');
    if (base !== 'application/octet-stream' && !(base === detected.mime || (base === 'audio/x-wav' && detected.ext === 'wav') || (base === 'audio/x-m4a' && detected.ext === 'm4a'))) {
      throw ApiError.badRequest('The Content-Type does not match the detected audio file type.');
    }
    finalPath = quarantinePath(id, detected.ext);
    await fs.promises.rename(temp, finalPath);
    const fileName = `${id}.${detected.ext}`;
    const checksum = hash.digest('hex');
    await withTransaction(async (tx) => {
      const result = await tx.query(
        `UPDATE artist_uploads SET status = 'QUARANTINED', scan_status = 'NOT_SCANNED', file_name = ?,
                file_size = ?, detected_mime = ?, sha256 = ?
          WHERE upload_id = ? AND user_id = ? AND status = 'UPLOADING'`,
        [fileName, bytes, detected.mime, checksum, id, userId]);
      if (!result.affectedRows) throw ApiError.conflict('UPLOAD_NOT_OPEN', 'This upload intent was already finalized.');
      await event(tx, id, userId, 'FILE_QUARANTINED', 'UPLOADING', 'QUARANTINED', `File received (${bytes} bytes; ${detected.mime}).`);
    }, { actorId: userId });
    return { id, status: 'QUARANTINED', bytes, mimeType: detected.mime };
  } catch (err) {
    await fs.promises.unlink(temp).catch(() => {});
    if (finalPath) await fs.promises.unlink(finalPath).catch(() => {});
    throw err;
  }
}


function clamavScan(file) {
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiError(503, 'SCANNER_NOT_CONFIGURED', 'ClamAV is not configured. The upload remains private in quarantine.');
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = '';
    let settled = false;
    const finish = (err, value) => { if (settled) return; settled = true; socket.destroy(); err ? reject(err) : resolve(value); };
    socket.setTimeout(30000, () => finish(new ApiError(503, 'SCANNER_TIMEOUT', 'The malware scanner timed out.')));
    socket.on('data', (chunk) => { response += chunk.toString('utf8'); });
    socket.on('error', (err) => finish(new ApiError(503, 'SCANNER_UNAVAILABLE', `ClamAV could not scan the quarantined file: ${err.message}`)));
    socket.on('end', () => {
      if (/stream: OK/i.test(response)) return finish(null, { clean: true, detail: 'ClamAV: OK' });
      if (/FOUND/i.test(response)) return finish(null, { clean: false, detail: response.trim().slice(0, 450) });
      finish(new ApiError(503, 'SCANNER_INVALID_RESPONSE', `ClamAV returned an unexpected response: ${response.slice(0, 120)}`));
    });
    socket.on('connect', async () => {
      try {
        socket.write('zINSTREAM\0');
        for await (const chunk of fs.createReadStream(file)) {
          const header = Buffer.alloc(4); header.writeUInt32BE(chunk.length, 0);
          if (!socket.write(Buffer.concat([header, chunk]))) await new Promise((r) => socket.once('drain', r));
        }
        socket.end(Buffer.alloc(4));
      } catch (err) { finish(new ApiError(503, 'SCANNER_STREAM_FAILED', err.message)); }
    });
  });
}

function probeAudio(file) {
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 15000);
    child.stdout.on('data', (x) => { stdout += x.toString(); });
    child.stderr.on('data', (x) => { stderr += x.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(new ApiError(503, 'FFPROBE_UNAVAILABLE', `ffprobe could not start: ${err.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new ApiError(503, 'FFPROBE_TIMEOUT', 'ffprobe took too long to inspect the quarantined file.'));
      if (code !== 0) return reject(new ApiError(422, 'INVALID_AUDIO_MEDIA', `ffprobe rejected the audio container: ${stderr.slice(0, 250)}`));
      try {
        const data = JSON.parse(stdout);
        const duration = Math.round(Number(data.format?.duration));
        if (!Array.isArray(data.streams) || !data.streams.some((s) => s.codec_type === 'audio')) throw new Error('No audio stream detected.');
        if (data.streams.some((s) => s.codec_type === 'video')) throw new Error('Video streams are not supported. Upload an audio-only recording.');
        const audio = data.streams.find((s) => s.codec_type === 'audio');
        if (!isSupportedAudioCodec(audio.codec_name)) throw new Error(`Audio codec ${audio.codec_name || 'unknown'} is not supported. Use MP3, AAC, FLAC, Vorbis, Opus or standard PCM audio.`);
        if (!Number.isInteger(duration) || duration < 30 || duration > 1800) throw new Error('Audio duration must be between 30 seconds and 30 minutes.');
        resolve(duration);
      } catch (err) { reject(new ApiError(422, 'INVALID_AUDIO_MEDIA', err.message)); }
    });
  });
}

async function scanUpload(uploadId, actor = null) {
  if (!safeUploadId(uploadId)) throw ApiError.notFound('Upload');
  const upload = await one('SELECT * FROM artist_uploads WHERE upload_id = ?', [uploadId]);
  if (!upload) throw ApiError.notFound('Upload');
  if (!['QUARANTINED', 'PROCESSING_FAILED'].includes(upload.status)) throw ApiError.conflict('UPLOAD_NOT_SCANNABLE', 'Only quarantined uploads can be scanned.');
  const ext = String(upload.file_name || '').split('.').pop();
  if (!Object.values(AUDIO_TYPES).some((t) => t.ext === ext)) throw ApiError.conflict('UPLOAD_FILE_MISSING', 'The quarantined file metadata is invalid.');
  const file = quarantinePath(uploadId, ext);
  if (!fs.existsSync(file)) throw ApiError.notFound('Quarantined file');
  const claimed = await query("UPDATE artist_uploads SET status = 'PROCESSING', scan_status = 'NOT_SCANNED', scan_detail = NULL WHERE upload_id = ? AND status IN ('QUARANTINED','PROCESSING_FAILED')", [uploadId]);
  if (!claimed.affectedRows) throw ApiError.conflict('UPLOAD_SCAN_IN_PROGRESS', 'Another worker has already claimed this upload for scanning.');
  try {
    const scan = await clamavScan(file);
    if (!scan.clean) {
      await withTransaction(async (tx) => {
        await tx.query("UPDATE artist_uploads SET status = 'REJECTED', scan_status = 'INFECTED', scan_detail = ? WHERE upload_id = ?", [scan.detail, uploadId]);
        await event(tx, uploadId, actor, 'MALWARE_DETECTED', 'PROCESSING', 'REJECTED', scan.detail);
      }, { actorId: actor });
      // Keep the scan result and hash in the audit ledger, but do not retain
      // a known-infected payload in the live quarantine volume.
      await fs.promises.unlink(file).catch(() => {});
      return { id: uploadId, status: 'REJECTED', scanStatus: 'INFECTED' };
    }
    const duration = await probeAudio(file);
    await withTransaction(async (tx) => {
      await tx.query("UPDATE artist_uploads SET status = 'PENDING_REVIEW', scan_status = 'CLEAN', scan_detail = ?, duration_verified_sec = ? WHERE upload_id = ?", [scan.detail, duration, uploadId]);
      await event(tx, uploadId, actor, 'SCAN_PASSED', 'PROCESSING', 'PENDING_REVIEW', `${scan.detail}; ffprobe duration ${duration}s.`);
    }, { actorId: actor });
    return { id: uploadId, status: 'PENDING_REVIEW', scanStatus: 'CLEAN', durationSec: duration };
  } catch (err) {
    await withTransaction(async (tx) => {
      await tx.query("UPDATE artist_uploads SET status = 'QUARANTINED', scan_status = 'ERROR', scan_detail = ? WHERE upload_id = ?", [String(err.message).slice(0, 500), uploadId]);
      await event(tx, uploadId, actor, 'SCAN_RETRY_REQUIRED', 'PROCESSING', 'QUARANTINED', String(err.message).slice(0, 450));
    }, { actorId: actor });
    throw err;
  }
}

async function listUploads({ status = 'PENDING_REVIEW', limit = 100 }) {
  return query(
    `SELECT au.upload_id AS id, au.user_id AS userId, u.username, au.artist_id AS artistId, a.name AS artistName,
            au.title, au.version_label AS versionLabel, au.song_id AS songId, au.duration_verified_sec AS durationSec,
            au.scan_detail AS scanDetail, au.file_size AS fileSize, au.detected_mime AS mimeType, au.status, au.scan_status AS scanStatus,
            au.composition_rights AS compositionRights, au.recording_rights AS recordingRights,
            au.rights_evidence_ref AS evidenceRef, au.territory_codes AS territories,
            au.allowed_uses AS allowedUses, au.licence_start AS licenceStart, au.licence_end AS licenceEnd,
            au.royalty_share_pct AS royaltySharePct, au.royalty_currency AS royaltyCurrency,
            au.created_at AS createdAt, au.review_note AS reviewNote
       FROM artist_uploads au JOIN users u USING (user_id) JOIN artists a USING (artist_id)
      WHERE (? = 'ALL' OR au.status = ?) ORDER BY au.created_at ASC LIMIT ?`, [status, status, limit]);
}

async function decideUpload(actor, uploadId, action, note = null) {
  if (!safeUploadId(uploadId)) throw ApiError.notFound('Upload');
  return withTransaction(async (tx) => {
    const u = await tx.one('SELECT * FROM artist_uploads WHERE upload_id = ? FOR UPDATE', [uploadId]);
    if (!u) throw ApiError.notFound('Upload');
    if (u.status !== 'PENDING_REVIEW' || u.scan_status !== 'CLEAN') throw ApiError.conflict('UPLOAD_NOT_REVIEWABLE', 'Only malware-scanned uploads awaiting review can be approved or rejected.');
    if (action === 'REJECT') {
      await tx.query("UPDATE artist_uploads SET status = 'REJECTED', reviewer_user_id = ?, review_note = ?, reviewed_at = NOW() WHERE upload_id = ?", [actor, note, uploadId]);
      await event(tx, uploadId, actor, 'MODERATOR_REJECTED', u.status, 'REJECTED', note);
      return { id: uploadId, status: 'REJECTED' };
    }
    if (action !== 'APPROVE') throw ApiError.badRequest('Decision must be APPROVE or REJECT.');
    if ((u.composition_rights === 'LICENSED' || u.recording_rights === 'LICENSED') && !u.rights_evidence_ref) {
      throw ApiError.conflict('RIGHTS_EVIDENCE_MISSING', 'A licensed composition or recording must have an evidence reference.');
    }
    const artist = await tx.one('SELECT artist_id FROM artist_accounts WHERE user_id = ? AND artist_id = ? AND account_status = \'ACTIVE\'', [u.user_id, u.artist_id]);
    if (!artist) throw ApiError.conflict('ARTIST_ACCOUNT_INACTIVE', 'The uploader no longer manages this artist profile.');
    const created = await tx.query(
      `INSERT INTO songs (title, version_label, primary_artist_id, duration_sec, release_year, language_id,
                          explicit, content_rating, popularity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 50, 'HIDDEN')`,
      [u.title, u.version_label, u.artist_id, u.duration_verified_sec, u.release_year, u.language_id,
        u.explicit ? 1 : 0, u.explicit ? 'MATURE' : 'ALL']);
    const songId = created.insertId;
    await tx.query('INSERT INTO song_genres (song_id, genre_id, is_primary) VALUES (?, ?, 1)', [songId, u.genre_id]);
    await tx.query("UPDATE artist_uploads SET status = 'APPROVED', song_id = ?, reviewer_user_id = ?, review_note = ?, reviewed_at = NOW() WHERE upload_id = ?",
      [songId, actor, note, uploadId]);
    await event(tx, uploadId, actor, 'MODERATOR_APPROVED', u.status, 'APPROVED', note || 'Metadata and rights declaration approved; not yet public.');
    await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                    VALUES (?, 'ARTIST_UPLOAD_APPROVED', 'artist_upload', ?, ?)`, [actor, uploadId, JSON.stringify({ song_id: songId, artist_id: u.artist_id })]);
    return { id: uploadId, songId, status: 'APPROVED', published: false };
  }, { actorId: actor });
}

async function publishUpload(actor, uploadId) {
  if (!safeUploadId(uploadId)) throw ApiError.notFound('Upload');
  if (localMedia.check().state === 'disabled') throw new ApiError(503, 'LOCAL_MEDIA_DISABLED', 'Enable the private local media provider before publishing artist uploads.');
  const u = await one(`SELECT *, (licence_start IS NULL OR licence_start <= CURRENT_DATE) AND
                               (licence_end IS NULL OR licence_end >= CURRENT_DATE) AS licence_date_active
                          FROM artist_uploads WHERE upload_id = ?`, [uploadId]);
  if (!u) throw ApiError.notFound('Upload');
  if (u.status !== 'APPROVED' || u.scan_status !== 'CLEAN' || !u.song_id) throw ApiError.conflict('UPLOAD_NOT_APPROVED', 'The upload must pass scanning and moderator approval before publication.');
  if (!u.licence_date_active) throw ApiError.conflict('LICENCE_OUTSIDE_TERM', 'This recording is outside the declared licence dates and cannot be published yet.');
  const ext = String(u.file_name || '').split('.').pop();
  const source = quarantinePath(uploadId, ext);
  if (!fs.existsSync(source)) throw ApiError.notFound('Quarantined file');
  const fileName = finalMediaName(uploadId, ext);
  const destination = path.join(localMedia.dir(), fileName);
  await fs.promises.mkdir(localMedia.dir(), { recursive: true });
  try { await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL); }
  catch (err) {
    if (err.code === 'EEXIST') throw ApiError.conflict('MEDIA_FILE_EXISTS', 'A media file with this generated name already exists.');
    throw err;
  }
  try {
    const result = await withTransaction(async (tx) => {
      const locked = await tx.one('SELECT * FROM artist_uploads WHERE upload_id = ? FOR UPDATE', [uploadId]);
      if (!locked || locked.status !== 'APPROVED' || locked.scan_status !== 'CLEAN') throw ApiError.conflict('UPLOAD_NOT_APPROVED', 'The upload state changed before publication.');
      const activeArtist = await tx.one("SELECT artist_id FROM artist_accounts WHERE user_id = ? AND artist_id = ? AND account_status = 'ACTIVE' FOR UPDATE", [locked.user_id, locked.artist_id]);
      if (!activeArtist) throw ApiError.conflict('ARTIST_ACCOUNT_INACTIVE', 'The uploader no longer manages an active artist profile.');
      const src = await tx.one("SELECT source_id FROM music_sources WHERE code = 'ARTIST_UPLOAD' AND is_enabled = 1");
      if (!src) throw new Error('ARTIST_UPLOAD media source is missing. Apply migration 0008.');
      const media = await tx.query(
        `INSERT INTO song_media (song_id, source_id, media_type, uri, rights_status, availability,
                                 last_checked_at, attribution, priority)
         VALUES (?, ?, 'USER_LOCAL', ?, 'PERMITTED', 'AVAILABLE', NOW(), 'Uploaded by the verified LOOP artist account.', 5)`,
        [locked.song_id, src.source_id, fileName]);
      await tx.query("UPDATE songs SET status = 'ACTIVE' WHERE song_id = ?", [locked.song_id]);
      await tx.query("UPDATE artist_uploads SET status = 'PUBLISHED', media_id = ? WHERE upload_id = ?", [media.insertId, uploadId]);
      await event(tx, uploadId, actor, 'PUBLISHED', 'APPROVED', 'PUBLISHED', 'Passed malware/media scan and moderator approval.');
      await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                      VALUES (?, 'ARTIST_UPLOAD_PUBLISHED', 'artist_upload', ?, ?)`, [actor, uploadId, JSON.stringify({ song_id: locked.song_id, media_id: media.insertId })]);
      return { id: uploadId, songId: locked.song_id, mediaId: media.insertId, status: 'PUBLISHED' };
    }, { actorId: actor });
    await fs.promises.unlink(source).catch(() => {});
    return result;
  } catch (err) {
    await fs.promises.unlink(destination).catch(() => {});
    throw err;
  }
}

async function withdrawUpload(userId, uploadId, note = 'Withdrawn by artist.') {
  if (!safeUploadId(uploadId)) throw ApiError.notFound('Upload');
  const result = await withTransaction(async (tx) => {
    const u = await tx.one('SELECT * FROM artist_uploads WHERE upload_id = ? AND user_id = ? FOR UPDATE', [uploadId, userId]);
    if (!u) throw ApiError.notFound('Upload');
    if (['REJECTED', 'TAKEN_DOWN'].includes(u.status)) throw ApiError.conflict('UPLOAD_CLOSED', 'This upload is already closed.');
    if (u.song_id) await tx.query("UPDATE songs SET status = 'HIDDEN' WHERE song_id = ?", [u.song_id]);
    if (u.media_id) await tx.query("UPDATE song_media SET rights_status = 'RESTRICTED', availability = 'UNAVAILABLE' WHERE media_id = ?", [u.media_id]);
    await tx.query("UPDATE artist_uploads SET status = 'TAKEN_DOWN', review_note = ? WHERE upload_id = ?", [note, uploadId]);
    await event(tx, uploadId, userId, 'ARTIST_WITHDRAWAL', u.status, 'TAKEN_DOWN', note);
    return { id: uploadId, status: 'TAKEN_DOWN', playbackBlocked: true, previousStatus: u.status, fileName: u.file_name };
  }, { actorId: userId });
  // An unpublished withdrawn file has no evidentiary value beyond its checksum
  // and event history; remove its quarantine payload. Published media is kept
  // private for rights/dispute retention, but is no longer addressable via API.
  if (result.previousStatus !== 'PUBLISHED' && result.fileName) {
    const ext = String(result.fileName).split('.').pop();
    if (Object.values(AUDIO_TYPES).some((x) => x.ext === ext)) {
      await fs.promises.unlink(quarantinePath(uploadId, ext)).catch(() => {});
    }
  }
  delete result.previousStatus;
  delete result.fileName;
  return result;
}

async function reportUpload(reporterId, uploadId, data) {
  if (!safeUploadId(uploadId)) throw ApiError.notFound('Upload');
  const u = await one("SELECT upload_id FROM artist_uploads WHERE upload_id = ? AND status = 'PUBLISHED'", [uploadId]);
  if (!u) throw ApiError.notFound('Published track');
  const r = await query(
    `INSERT INTO artist_rights_reports (upload_id, reporter_user_id, report_type, details, evidence_ref)
     VALUES (?, ?, ?, ?, ?)`, [uploadId, reporterId, data.reportType, data.details, data.evidenceRef || null]);
  return { id: r.insertId, status: 'OPEN' };
}

async function listRightsReports({ status = 'OPEN', limit = 100 }) {
  return query(
    `SELECT rr.report_id AS id, rr.upload_id AS uploadId, rr.reporter_user_id AS reporterId,
            u.username AS reporter, rr.report_type AS reportType, rr.details, rr.evidence_ref AS evidenceRef,
            rr.status, rr.resolution_note AS resolutionNote, rr.created_at AS createdAt,
            au.title, a.name AS artistName
       FROM artist_rights_reports rr JOIN artist_uploads au USING (upload_id)
       JOIN artists a USING (artist_id) JOIN users u ON u.user_id = rr.reporter_user_id
      WHERE (? = 'ALL' OR rr.status = ?) ORDER BY rr.created_at ASC LIMIT ?`, [status, status, limit]);
}

async function resolveRightsReport(actor, reportId, action, note = null) {
  if (!['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'].includes(action)) throw ApiError.badRequest('Invalid rights report status.');
  return withTransaction(async (tx) => {
    const r = await tx.one('SELECT * FROM artist_rights_reports WHERE report_id = ? FOR UPDATE', [reportId]);
    if (!r) throw ApiError.notFound('Rights report');
    if (['RESOLVED', 'DISMISSED'].includes(r.status)) throw ApiError.conflict('REPORT_CLOSED', 'This rights report has already been closed.');
    await tx.query('UPDATE artist_rights_reports SET status = ?, assigned_to = ?, resolution_note = ?, resolved_at = ? WHERE report_id = ?',
      [action, actor, note, ['RESOLVED', 'DISMISSED'].includes(action) ? new Date() : null, reportId]);
    await tx.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
                    VALUES (?, 'ARTIST_RIGHTS_REPORT_UPDATED', 'artist_rights_report', ?, ?)`,
      [actor, String(reportId), JSON.stringify({ upload_id: r.upload_id, from: r.status, to: action, note })]);
    if (action === 'RESOLVED' && r.report_type === 'COPYRIGHT') {
      // A resolved copyright report defaults to takedown; restoration is a separate,
      // explicit moderation decision and is never automated here.
      const u = await tx.one('SELECT song_id, media_id, status FROM artist_uploads WHERE upload_id = ? FOR UPDATE', [r.upload_id]);
      if (u && u.status === 'PUBLISHED') {
        if (u.song_id) await tx.query("UPDATE songs SET status = 'HIDDEN' WHERE song_id = ?", [u.song_id]);
        if (u.media_id) await tx.query("UPDATE song_media SET rights_status = 'RESTRICTED', availability = 'UNAVAILABLE' WHERE media_id = ?", [u.media_id]);
        await tx.query("UPDATE artist_uploads SET status = 'TAKEN_DOWN', review_note = ? WHERE upload_id = ?", [note || 'Taken down after rights report.', r.upload_id]);
        await event(tx, r.upload_id, actor, 'RIGHTS_REPORT_TAKEDOWN', u.status, 'TAKEN_DOWN', note);
      }
    }
    return { id: reportId, status: action };
  }, { actorId: actor });
}

module.exports = {
  TERMS_VERSION, maxBytes, detectAudio, safeUploadId,
  myProfile, apply, listApplications, decideApplication, createUploadIntent, storeUpload,
  scanUpload, listUploads, decideUpload, publishUpload, withdrawUpload,
  reportUpload, listRightsReports, resolveRightsReport,
};
