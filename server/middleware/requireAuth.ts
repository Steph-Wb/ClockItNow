import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from '../database.js';
import { localToken } from '../lib/localToken.js';

export interface AuthUser { id: number; email: string; }

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Electron-Hauptprozess (Tray/Idle): authentifiziert sich per lokalem Token
  // aus dem Datenverzeichnis und agiert als der (einzige) Benutzer
  const local = req.header('x-local-token');
  if (local && localToken && local === localToken) {
    const user = db.prepare('SELECT id, email FROM users LIMIT 1').get() as AuthUser | undefined;
    if (user) {
      (req as any).user = { id: user.id, email: user.email };
      next();
      return;
    }
  }

  const token = (req as any).cookies?.session;
  if (!token) { res.status(401).json({ error: 'errors.auth.notLoggedIn' }); return; }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'errors.auth.sessionExpired' });
  }
}
