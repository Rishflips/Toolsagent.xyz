# Security

## Reporting a vulnerability

Please open a private security advisory on GitHub rather than a public issue.

---

## Secrets

`JWT_SECRET` and `ENCRYPTION_SECRET` are **required** and have no defaults. The
server exits with a clear error if either is missing, too short, or set to a
placeholder value from `.env.example`. This is deliberate: a default published in
a public repo would let anyone forge a valid login token on every deployment that
forgot to change it.

Generate both with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`JWT_SECRET` signs login sessions. `ENCRYPTION_SECRET` derives the AES-256-GCM key
that encrypts stored provider API keys. **Changing `ENCRYPTION_SECRET` after keys
have been saved makes those keys unreadable** — they would need to be re-entered.

---

## What is already handled

- Passwords hashed with bcrypt (cost 12)
- Provider API keys encrypted at rest (AES-256-GCM, random IV per value)
- Auth API keys stored as SHA-256 hashes only — the plaintext key is shown once at signup
- All SQL uses parameterised queries
- Login and signup are rate limited (20 requests / 15 min per IP)
- API endpoints are rate limited (300 requests / min per IP)
- CORS restricted to `FRONTEND_URL`
- Auth middleware fails closed: an invalid or missing token is a 401

---

## Known limitations

Be aware of these before exposing an instance to the public internet:

1. **WebSocket auth token is passed in the query string.** It will appear in
   reverse-proxy access logs. If that matters to you, terminate TLS at a proxy
   that strips query strings from logs, or move the token into a subprotocol
   header.

2. **Content-Security-Policy is disabled** (`helmet({ contentSecurityPolicy: false })`)
   because the frontend inlines styles. Re-enabling it requires auditing inline
   styles first.

3. **No email verification, password reset, or account lockout.** Anyone who can
   reach a public instance can create an account.

4. **Rate limiting is in-memory.** Limits reset on restart and are per-process;
   they do not coordinate across multiple instances. Use a shared store (Redis)
   if you run more than one backend.

5. **No CSRF token.** The API is token-based (Authorization header), not
   cookie-based, which mitigates the usual CSRF path — but keep it that way.

6. **TLS is not terminated by the app.** The backend speaks plain HTTP. Put it
   behind a reverse proxy that terminates HTTPS (nginx, Caddy, or a Cloudflare
   Tunnel). Never expose port 4000 directly.

7. **No audit log for auth events** beyond the guardrail event table.

8. **Some module screens are placeholders.** They render static sample data, not
   live data, so they should not be read as real telemetry.

---

## Hardening checklist for a public instance

- [ ] Generate real random values for `JWT_SECRET` and `ENCRYPTION_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Set `FRONTEND_URL` to your real HTTPS origin (CORS depends on it)
- [ ] Terminate TLS at a reverse proxy; never expose the backend port
- [ ] Do not publish the Postgres port; keep it on the internal Docker network
- [ ] Back up the `db_data` volume
- [ ] Consider putting signup behind an invite or reverse-proxy auth if the
      instance is public
