(function () {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) {
        errorEl.textContent = body.error || 'Sign in failed.';
        errorEl.hidden = false;
        return;
      }
      window.location.href = '/';
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      errorEl.hidden = false;
    }
  });
})();
