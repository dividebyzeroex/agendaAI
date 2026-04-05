import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'ok',
    message: 'AgendaAi Serverless Runtime is active',
    timestamp: new Date().toISOString(),
    node_version: process.version
  });
}
