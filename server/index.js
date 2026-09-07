const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const auth = require('./auth');
const { createLimiter } = require('./rateLimit');
const { attach: attachWsHandler } = require('./wsHandler');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// A handful of restrictive-by-default security headers (no external deps).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const loginLimiter = createLimiter({ windowMs: 60 * 1000, max: 10 });

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/session', (req, res) => {
  res.json({
    authEnabled: auth.isAuthEnabled(),
    authenticated: auth.hasValidSession(req),
  });
});

app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!loginLimiter.check(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
  }

  const { password } = req.body || {};
  if (!auth.checkPassword(password)) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  auth.setSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Everything under /public requires a valid session once auth is enabled.
app.use((req, res, next) => {
  if (req.path === '/login.html' || req.path.startsWith('/assets/')) return next();
  if (!auth.hasValidSession(req)) {
    if (req.path === '/' || req.path === '/index.html') {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

const server = app.listen(PORT, () => {
  console.log(`ssh-console listening on port ${PORT}`);
  if (!auth.isAuthEnabled()) {
    console.warn(
      '[security] APP_PASSWORD is not set - the console is reachable by anyone who can ' +
        'reach this URL. Set APP_PASSWORD in the environment before exposing this publicly.'
    );
  }
});

const wss = new WebSocketServer({ noServer: true });
attachWsHandler(wss);

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  if (!auth.hasValidSession(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
