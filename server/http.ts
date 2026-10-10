import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel supplies these HTTP helpers at runtime; this module contains types only.
export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  body: any;
}
export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
}
