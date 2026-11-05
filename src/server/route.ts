import { type Request, type Response, type NextFunction, type RequestHandler } from "express";

/** Express 4 doesn't catch rejected async handlers; pass errors on to the JSON error handler. */
export function route(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
