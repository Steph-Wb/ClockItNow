import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 4 fängt Fehler aus async-Handlern nicht ab – eine Rejection würde als
 * unhandled promise rejection den Prozess beenden. Dieser Wrapper leitet sie an
 * den zentralen Error-Handler (server/index.ts) weiter.
 */
export const asyncHandler = (fn: AsyncRouteHandler): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };
