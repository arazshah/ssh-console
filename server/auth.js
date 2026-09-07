const crypto = require('crypto');
const cookie = require('cookie');

const COOKIE_NAME = 'ssh_console_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (secret && secret.length >= 16) return secret;
  // Fall back to a per-process random secret so sessions still work,
  // but they will not survive a restart. A real deployment should set APP_SECRET.
  if (!getSecret._fallback) {
    getSecret._fallback = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[auth] APP_SECRET is not set (or too short) - using a random in-memory secret. ' +
        'Set APP_SECRET in the environment for stable sessions across restarts.'
    );
  }
  return getSecret._fallback;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function isAuthEnabled() {
  return Boolean(process.env.APP_PASSWORD);
}

function issueToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = String(expires);
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  const expires = Number(payload);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return true;
}

function checkPassword(candidate) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return true; // gate disabled
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function setSessionCookie(res) {
  const token = issueToken();
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS / 1000,
      path: '/',
    })
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: '/',
    })
  );
}

function hasValidSession(req) {
  if (!isAuthEnabled()) return true;
  const header = req.headers.cookie || '';
  const parsed = cookie.parse(header);
  return verifyToken(parsed[COOKIE_NAME]);
}

module.exports = {
  COOKIE_NAME,
  isAuthEnabled,
  checkPassword,
  setSessionCookie,
  clearSessionCookie,
  hasValidSession,
  verifyToken,
};
