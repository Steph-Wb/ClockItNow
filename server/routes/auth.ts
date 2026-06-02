import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { db } from '../database.js';

const router = Router();

const JWT_SECRET = () => process.env.JWT_SECRET!;
const APP_URL    = () => process.env.APP_URL ?? 'http://localhost:5173';

function setSessionCookie(res: Response, userId: number, email: string) {
  const token = jwt.sign({ id: userId, email }, JWT_SECRET(), { expiresIn: '7d' });
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_URL?.startsWith('https') ?? false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage
  });
}

function getMailTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── GET /api/auth/status ─────────────────────────────────────────────────────
router.get('/status', (req: Request, res: Response) => {
  const token = (req as any).cookies?.session;
  const hasUser = !!(db.prepare('SELECT id FROM users LIMIT 1').get());
  let loggedIn = false;

  if (token) {
    try { jwt.verify(token, JWT_SECRET()); loggedIn = true; } catch { /* expired */ }
  }

  res.json({ loggedIn, hasUser });
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) { res.status(403).json({ error: 'errors.auth.userExists' }); return; }

  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'errors.auth.emailPasswordRequired' }); return; }
  if (password.length < 8)  { res.status(400).json({ error: 'errors.auth.passwordTooShort' }); return; }

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.trim(), hash);
  const userId = result.lastInsertRowid as number;

  // Bestehende Daten dem neuen User zuweisen
  db.prepare('UPDATE clients      SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE projects     SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE tasks        SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE time_entries SET user_id = ? WHERE user_id IS NULL').run(userId);

  setSessionCookie(res, userId, email.trim());
  res.status(201).json({ ok: true, email: email.trim() });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'errors.auth.emailPasswordRequired' }); return; }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as any;
  if (!user || !user.password_hash) { res.status(401).json({ error: 'errors.auth.invalidCredentials' }); return; }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) { res.status(401).json({ error: 'errors.auth.invalidCredentials' }); return; }

  setSessionCookie(res, user.id, user.email);
  res.json({ ok: true, email: user.email });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// ── POST /api/auth/magic-link ────────────────────────────────────────────────
router.post('/magic-link', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'errors.auth.emailRequired' }); return; }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as any;
  if (!user) { res.status(404).json({ error: 'errors.auth.accountNotFound' }); return; }

  // Token generieren (32 Byte = 64 Hex-Zeichen)
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 Minuten

  // Alte ungenutzte Links für diesen User löschen
  db.prepare('DELETE FROM magic_links WHERE user_id = ? AND used_at IS NULL').run(user.id);
  db.prepare('INSERT INTO magic_links (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

  const magicLink = `${APP_URL()}/magic-link/verify?token=${token}`;

  try {
    const transporter = getMailTransporter();
    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? 'ClockItNow',
      to:      user.email,
      subject: 'ClockItNow – Anmeldelink',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:40px auto">
          <h2 style="color:#00BCD4">ClockItNow</h2>
          <p>Klicke auf den Link unten, um dich einzuloggen.<br>Der Link ist <strong>15 Minuten</strong> gültig und kann nur einmal verwendet werden.</p>
          <a href="${magicLink}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#00BCD4;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
            Jetzt einloggen
          </a>
          <p style="color:#888;font-size:12px">Falls du diesen Link nicht angefordert hast, ignoriere diese E-Mail.</p>
        </div>
      `,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('SMTP-Fehler:', err);
    res.status(500).json({ error: 'errors.auth.emailSendFailed' });
  }
});

// ── GET /api/auth/magic-link/verify ─────────────────────────────────────────
router.get('/magic-link/verify', (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') { res.status(400).json({ error: 'errors.auth.tokenMissing' }); return; }

  const link = db.prepare('SELECT * FROM magic_links WHERE token = ?').get(token) as any;
  if (!link) { res.status(400).json({ error: 'errors.auth.invalidLink' }); return; }
  if (link.used_at) { res.status(400).json({ error: 'errors.auth.linkAlreadyUsed' }); return; }
  if (new Date(link.expires_at) < new Date()) { res.status(400).json({ error: 'errors.auth.linkExpired' }); return; }

  // Als benutzt markieren
  db.prepare('UPDATE magic_links SET used_at = ? WHERE id = ?').run(new Date().toISOString(), link.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(link.user_id) as any;
  if (!user) { res.status(404).json({ error: 'errors.auth.userNotFound' }); return; }

  setSessionCookie(res, user.id, user.email);
  res.json({ ok: true, email: user.email });
});

export default router;
