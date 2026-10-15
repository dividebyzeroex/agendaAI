import type { VercelRequest, VercelResponse } from '../../server/http.js';
import { runAppointmentMessages } from '../../server/appointment-messaging.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).end();
 const secret=process.env['CRON_SECRET'];
 if(!secret||req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized CRON.'});
 try{return res.status(200).json(await runAppointmentMessages());}catch{return res.status(503).json({error:'Não foi possível conferir a fila. Nenhum retry automático de envio incerto.'});}
}
