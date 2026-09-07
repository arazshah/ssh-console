(function () {
  const statusPill = document.getElementById('status-pill');
  const connectForm = document.getElementById('connect-form');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const connectError = document.getElementById('connect-error');
  const authType = document.getElementById('auth-type');
  const passwordField = document.getElementById('password-field');
  const keyField = document.getElementById('key-field');
  const logoutBtn = document.getElementById('logout-btn');

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 14,
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
    },
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  fitAddon.fit();
  term.writeln('Not connected. Fill in the form on the left and click Connect.');

  window.addEventListener('resize', () => {
    if (ws && ws.readyState === WebSocket.OPEN) fitAddon.fit();
  });

  let ws = null;

  function setStatus(state, label) {
    statusPill.className = `pill pill-${state}`;
    statusPill.textContent = label;
  }

  authType.addEventListener('change', () => {
    const usingKey = authType.value === 'privateKey';
    keyField.hidden = !usingKey;
    passwordField.hidden = usingKey;
  });

  function showError(message) {
    connectError.textContent = message;
    connectError.hidden = false;
  }

  function clearError() {
    connectError.hidden = true;
    connectError.textContent = '';
  }

  function setConnecting(isConnecting) {
    connectBtn.disabled = isConnecting;
  }

  function wsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  connectForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();

    const host = document.getElementById('host').value.trim();
    const port = Number(document.getElementById('port').value) || 22;
    const username = document.getElementById('username').value.trim();
    const mode = authType.value;

    const payload = {
      type: 'connect',
      host,
      port,
      username,
      authType: mode,
      cols: term.cols,
      rows: term.rows,
    };

    if (mode === 'privateKey') {
      payload.privateKey = document.getElementById('private-key').value;
      payload.passphrase = document.getElementById('passphrase').value;
    } else {
      payload.password = document.getElementById('password').value;
    }

    setConnecting(true);
    setStatus('connecting', 'Connecting…');
    term.reset();
    term.writeln(`Connecting to ${username}@${host}:${port} ...`);

    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ready') {
        setStatus('connected', 'Connected');
        setConnecting(false);
        disconnectBtn.hidden = false;
        term.focus();
        fitAddon.fit();
        sendResize();
      } else if (msg.type === 'data') {
        term.write(base64ToUint8Array(msg.data));
      } else if (msg.type === 'error') {
        setStatus('error', 'Error');
        setConnecting(false);
        showError(msg.message);
        term.writeln(`\r\n[error] ${msg.message}`);
      } else if (msg.type === 'closed') {
        setStatus('idle', 'Disconnected');
        setConnecting(false);
        disconnectBtn.hidden = true;
        term.writeln(`\r\n[session ended] ${msg.message || ''}`);
      }
    });

    ws.addEventListener('close', () => {
      setStatus('idle', 'Disconnected');
      setConnecting(false);
      disconnectBtn.hidden = true;
    });

    ws.addEventListener('error', () => {
      setStatus('error', 'Error');
      setConnecting(false);
      showError('WebSocket connection failed.');
    });
  });

  disconnectBtn.addEventListener('click', () => {
    if (ws) {
      try {
        ws.send(JSON.stringify({ type: 'disconnect' }));
      } catch {
        // ignore
      }
      ws.close();
    }
  });

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data: uint8ArrayToBase64(strToUint8Array(data)) }));
    }
  });

  function sendResize() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  }

  term.onResize(() => sendResize());

  function strToUint8Array(str) {
    return new TextEncoder().encode(str);
  }

  function uint8ArrayToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }

  function base64ToUint8Array(b64) {
    const binary = window.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  logoutBtn.addEventListener('click', async () => {
    if (ws) ws.close();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // Bounce to /login.html if the session is not (or no longer) valid.
  fetch('/api/session')
    .then((r) => r.json())
    .then((info) => {
      if (info.authEnabled && !info.authenticated) {
        window.location.href = '/login.html';
      }
    })
    .catch(() => {});
})();
