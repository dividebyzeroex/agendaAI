import { Resend } from 'resend';

// Vercel Serverless Function
export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, token, estabelecimento, valorTotal, data } = req.body;

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    // Instancia Resend com a chave nas envs
    const resend = new Resend(process.env['RESEND_API_KEY']);
    
    // Fallback pra enviar usando o email padrao do Resend para testes se nao houver dominio validado
    // O recomendado em producao eh ter um dominio, ex: contato@seu-dominio.com
    const fromEmail = process.env['RESEND_FROM_EMAIL'] || 'onboarding@resend.dev';

    const comandaUrl = `https://${req.headers.host || 'agenda-ai-beryl.vercel.app'}/comanda/${token}`;

    const { data: emailData, error } = await resend.emails.send({
      from: `${estabelecimento || 'Estabelecimento'} <${fromEmail}>`,
      to: [email],
      subject: `Sua Comanda Digital - ${estabelecimento || 'Estabelecimento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #111827; margin: 0;">${estabelecimento || 'Estabelecimento'}</h2>
            <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Recibo de Atendimento</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb;">
            <p style="color: #374151; font-size: 16px;">Olá!</p>
            <p style="color: #374151; font-size: 16px;">Sua comanda digital no valor de <strong>R$ ${Number(valorTotal || 0).toFixed(2)}</strong> gerada em ${new Date(data || Date.now()).toLocaleDateString('pt-BR')} já está disponível.</p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${comandaUrl}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Ver Comanda Completa</a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 0;">Obrigado pela preferência!</p>
          </div>
        </div>
      `
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Email sent successfully', id: emailData?.id });

  } catch (err: any) {
    console.error('Error sending email:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
