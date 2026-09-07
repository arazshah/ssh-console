# ssh-console

یک کنسول SSH آنلاین خودمیزبان (self-hosted) برای دسترسی به سرورها از داخل مرورگر — قرار است روی زیردامنه‌ی `ssh.araz.me` با Coolify بالا بیاید.

- فرانت‌اند: [xterm.js](https://xtermjs.org/) برای شبیه‌سازی ترمینال در مرورگر
- بک‌اند: Node.js (Express + `ws`) که با کتابخانه‌ی [`ssh2`](https://github.com/mscdex/ssh2) به سرور مقصد وصل می‌شود و ورودی/خروجی ترمینال را روی یک WebSocket رد و بدل می‌کند
- هیچ‌کجا پسورد یا کلید SSH ذخیره نمی‌شود؛ فقط برای برقراری همان یک اتصال در حافظه استفاده و بعد از قطع اتصال دور ریخته می‌شود

## معماری در یک نگاه

```
مرورگر (xterm.js) --WebSocket--> Node.js server --SSH (ssh2)--> سرور مقصد
```

این ابزار یک **دروازه‌ی SSH** است: خودش سروری نیست که به آن SSH می‌زنید، بلکه صفحه‌ای است که از آن به هر سروری (با هاست/یوزر/پسورد یا کلید دلخواه) وصل می‌شوید. چون این صفحه از اینترنت در دسترس خواهد بود، با یک رمز عبور جداگانه (`APP_PASSWORD`) قفل شده تا فقط خود شما بتوانید وارد آن بشوید.

## اجرای محلی (تست)

```bash
cp .env.example .env
# APP_PASSWORD و APP_SECRET را در .env عوض کنید
npm install
npm start
# سپس http://localhost:3000 را باز کنید
```

## دیپلوی روی Coolify (سرور خودتان)

1. در Coolify یک **New Resource → Application** بسازید و ریپازیتوری گیت این پروژه را وصل کنید.
2. **Build Pack** را روی **Dockerfile** بگذارید (این پروژه یک ریپازیتوری مستقل است، نیازی به تنظیم Base Directory نیست).
3. **Port** برنامه را `3000` بگذارید (همان چیزی که در `Dockerfile`/`EXPOSE` است).
4. متغیرهای محیطی زیر را در بخش Environment Variables اپلیکیشن در Coolify تنظیم کنید:
   - `APP_PASSWORD` → رمز عبور ورود به خود کنسول (این رمز، رمز سرورهای مقصد نیست)
   - `APP_SECRET` → یک رشته‌ی تصادفی طولانی برای امضای session cookie؛ با `openssl rand -hex 32` بسازید
   - (اختیاری) `PORT=3000`
5. یک **Domain** برای این اپلیکیشن اضافه کنید: `ssh.araz.me` — Coolify به‌صورت خودکار گواهی SSL (Let's Encrypt) برایش صادر می‌کند، به شرطی که DNS درست تنظیم شده باشد.
6. در پنل DNS دامنه‌ی `araz.me` یک رکورد بسازید:
   - نوع: `A` (یا `AAAA` برای IPv6)
   - Host/Name: `ssh`
   - Value: آی‌پی سرور خودتان که Coolify رویش نصب است
   - Proxy/CDN (مثلاً Cloudflare orange-cloud) را برای این ساب‌دامین **خاموش** بگذارید، چون این یک اتصال WebSocket زنده و طولانی است و پروکسی‌های HTTP-only معمولاً WebSocket را قطع می‌کنند یا مشکل ایجاد می‌کنند. اگر حتماً می‌خواهید از Cloudflare proxy استفاده کنید، مطمئن شوید WebSocket support فعال است.
7. Deploy بزنید. بعد از بالا آمدن، آدرس `https://ssh.araz.me` باید صفحه‌ی ورود (رمز عبور) را نشان بدهد.

### چک‌لیست امنیتی قبل از انتشار عمومی

- [ ] `APP_PASSWORD` را حتماً تنظیم کنید — بدون آن هرکسی که آدرس را داشته باشد می‌تواند وارد کنسول شود (لاگ سرور موقع استارت هم این را هشدار می‌دهد).
- [ ] `APP_SECRET` را طولانی و تصادفی بگذارید تا session cookie قابل جعل نباشد.
- [ ] HTTPS را از طریق Coolify/Let's Encrypt فعال نگه دارید (کوکی session با `secure` علامت‌گذاری می‌شود وقتی `NODE_ENV=production` است، که در Dockerfile همین‌طور تنظیم شده).
- [ ] در نظر بگیرید که دسترسی به `ssh.araz.me` را با فایروال یا Coolify's "Access Control"/IP allowlist محدود کنید، چون این صفحه دروازه‌ای به سرورهای شماست.

## عیب‌یابی: «WebSocket connection failed»

اگر صفحه‌ی لاگین/فرم اتصال بالا می‌آید ولی همین پیام را موقع Connect می‌بینید، معمولاً یکی از این‌هاست:

- **`APP_SECRET` در Coolify تنظیم نشده یا خالی است.** بدون آن، هر بار که کانتینر ری‌استارت می‌شود (مثلاً به‌خاطر یک healthcheck ناموفق) یک کلید تصادفی جدید ساخته می‌شود و session cookie‌های قبلی دیگر معتبر نیستند، پس اتصال `/ws` با خطای 401 رد می‌شود. مطمئن شوید `APP_SECRET` یک مقدار ثابت و طولانی در Environment Variables دارد (نه خالی).
- **healthcheck کانتینر fail می‌شود و باعث ری‌استارت مکرر می‌شود.** `node:alpine` نه `curl` دارد نه `wget`؛ اگر Coolify یک healthcheck پیش‌فرض مبتنی بر curl تزریق کند همیشه fail می‌شود. این ریپو یک `HEALTHCHECK` مبتنی بر Node در `Dockerfile` و `docker-compose.yml` دارد که این مشکل را برطرف می‌کند — مطمئن شوید آخرین نسخه‌ی کد را دیپلوی کرده‌اید.
- **پروکسی/CDN جلوی دامنه (مثلاً Cloudflare) WebSocket را قطع می‌کند.** طبق مرحله‌ی ۶ بالا، ابر نارنجی (Proxied) را برای `ssh.araz.me` خاموش کنید یا مطمئن شوید WebSocket support در آن فعال است.
- برای بررسی دقیق‌تر، در مرورگر (F12 → Network → فیلتر WS) به کد وضعیت درخواست `/ws` نگاه کنید؛ و در Coolify، تب Logs کانتینر را در لحظه‌ی Connect زدن چک کنید.

## ساختار پروژه

```
ssh-console/
├── Dockerfile
├── docker-compose.yml       # برای اجرای محلی با docker compose (اختیاری)
├── package.json
├── server/
│   ├── index.js             # اپ Express + راه‌اندازی WebSocket upgrade
│   ├── auth.js              # قفل رمز عبور صفحه + session cookie امضاشده
│   ├── rateLimit.js         # محدودکننده‌ی تلاش‌های ورود
│   └── wsHandler.js         # پل بین WebSocket و اتصال ssh2
└── public/
    ├── login.html / assets/login.js   # صفحه ورود با رمز عبور
    ├── index.html / assets/app.js     # فرم اتصال SSH + ترمینال xterm.js
    └── assets/style.css
```

## نکات فنی

- ورودی/خروجی شل روی WebSocket به‌صورت پیام‌های JSON با فیلد `type` رد و بدل می‌شود (`connect`, `data`, `resize`, `error`, `ready`, `closed`)؛ بایت‌های خام ترمینال به‌صورت base64 encode می‌شوند تا داده‌ی باینری هم سالم منتقل شود.
- هم authentication با پسورد و هم با private key (OpenSSH/PEM، با passphrase اختیاری) پشتیبانی می‌شود.
- سایز کوکی session بر پایه‌ی HMAC-SHA256 با `APP_SECRET` امضا می‌شود؛ بدون دیتابیس یا session store خارجی کار می‌کند.
