const { Client } = require('ssh2');

const MAX_MESSAGE_BYTES = 64 * 1024;
const CONNECT_TIMEOUT_MS = 15000;

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function attach(wss) {
  wss.on('connection', (ws) => {
    let ssh = null;
    let shellStream = null;
    let connected = false;

    ws.on('message', (raw) => {
      if (raw.length > MAX_MESSAGE_BYTES) {
        send(ws, { type: 'error', message: 'Message too large.' });
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }

      if (msg.type === 'connect') {
        if (connected) return;
        connected = true;

        const host = String(msg.host || '').trim();
        const port = Number(msg.port) || 22;
        const username = String(msg.username || '').trim();
        const cols = Number(msg.cols) || 80;
        const rows = Number(msg.rows) || 24;

        if (!host || !username) {
          send(ws, { type: 'error', message: 'Host and username are required.' });
          ws.close();
          return;
        }

        const connectConfig = {
          host,
          port,
          username,
          readyTimeout: CONNECT_TIMEOUT_MS,
          keepaliveInterval: 15000,
        };

        if (msg.authType === 'privateKey' && msg.privateKey) {
          connectConfig.privateKey = msg.privateKey;
          if (msg.passphrase) connectConfig.passphrase = msg.passphrase;
        } else if (msg.password) {
          connectConfig.password = msg.password;
        } else {
          send(ws, { type: 'error', message: 'A password or private key is required.' });
          ws.close();
          return;
        }

        ssh = new Client();

        ssh.on('ready', () => {
          ssh.shell({ cols, rows, term: 'xterm-256color' }, (err, stream) => {
            if (err) {
              send(ws, { type: 'error', message: `Shell error: ${err.message}` });
              ssh.end();
              return;
            }
            shellStream = stream;
            send(ws, { type: 'ready' });

            stream.on('data', (data) => {
              send(ws, { type: 'data', data: data.toString('base64') });
            });
            stream.stderr.on('data', (data) => {
              send(ws, { type: 'data', data: data.toString('base64') });
            });
            stream.on('close', () => {
              send(ws, { type: 'closed', message: 'Remote shell closed.' });
              ws.close();
            });
          });
        });

        ssh.on('error', (err) => {
          send(ws, { type: 'error', message: err.message || 'SSH connection error.' });
          ws.close();
        });

        ssh.on('close', () => {
          if (ws.readyState === ws.OPEN) {
            send(ws, { type: 'closed', message: 'Connection closed.' });
            ws.close();
          }
        });

        ssh.connect(connectConfig);
        return;
      }

      if (msg.type === 'data' && shellStream) {
        const chunk = Buffer.from(msg.data || '', 'base64');
        shellStream.write(chunk);
        return;
      }

      if (msg.type === 'resize' && shellStream) {
        const cols = Number(msg.cols) || 80;
        const rows = Number(msg.rows) || 24;
        shellStream.setWindow(rows, cols, 0, 0);
        return;
      }

      if (msg.type === 'disconnect') {
        ws.close();
      }
    });

    const cleanup = () => {
      try {
        if (shellStream) shellStream.end();
      } catch {
        // ignore
      }
      try {
        if (ssh) ssh.end();
      } catch {
        // ignore
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });
}

module.exports = { attach };
