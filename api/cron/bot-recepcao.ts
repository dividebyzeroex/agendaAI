import {runCustomerCampaigns} from '../../server/business-campaigns.js';
import type { VercelRequest, VercelResponse } from '../../server/http.js';
import { runAppointmentMessages } from '../../server/appointment-messaging.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).end();
 const secret=process.env['CRON_SECRET'];
 if(!secret||req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized CRON.'});
 try{const results=await Promise.allSettled([runAppointmentMessages(),runCustomerCampaigns()]);const failed=results.some(r=>r.status==='rejected');return res.status(failed?503:200).json({appointments:results[0].status==='fulfilled'?results[0].value:{error:'Rotina de lembretes indisponível'},campaigns:results[1].status==='fulfilled'?results[1].value:{error:'Rotina de campanhas indisponível'}});}catch{return res.status(503).json({error:'Não foi possível conferir a fila. Nenhum retry automático de envio incerto.'});}
}
