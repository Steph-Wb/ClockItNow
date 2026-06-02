import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthUser { id: number; email: string; }

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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
