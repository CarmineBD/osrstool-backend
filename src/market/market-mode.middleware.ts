import type { NextFunction, Request, Response } from 'express';
import { parseMarketMode, runWithMarketMode } from './market-mode';

/** Makes the optional public `market` query parameter available to all services in a request. */
export function marketModeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const rawMarket = Array.isArray(req.query.market) ? req.query.market[0] : req.query.market;
  runWithMarketMode(parseMarketMode(rawMarket), next);
}
