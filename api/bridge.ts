import type { VercelRequest, VercelResponse } from '../server/http.js';

// Consolidated dispatcher for public API paths on Vercel Hobby.
// Each handler keeps its existing method, authorization, validation and response logic.
// Only the entrypoint changes; vercel.json rewrites preserve public URLs and query strings.
import ping from '../server/handlers/ping.js';
import activateHotmart from '../server/handlers/hotmart-activate.js';
import publicBooking from '../server/handlers/public-booking.js';
import respondAppointment from '../server/handlers/respond-appointment.js';
import sendComanda from '../server/handlers/send-comanda.js';
import triggerWorkflow from '../server/handlers/trigger-workflow.js';
import sendSms from '../server/handlers/sms/send.js';
import receptionCron from '../server/handlers/cron/bot-recepcao.js';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;
const handlers: Record<string, Handler> = {
  ping,
  'hotmart-activate': activateHotmart,
  'public-booking': publicBooking,
  'respond-appointment': respondAppointment,
  'send-comanda': sendComanda,
  'trigger-workflow': triggerWorkflow,
  'sms-send': sendSms,
  'bot-recepcao': receptionCron,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query['__handler'];
  if (typeof route !== 'string' || !Object.hasOwn(handlers, route)) {
    return res.status(404).json({ error: 'Endpoint não encontrado.' });
  }
  return handlers[route](req, res);
}
