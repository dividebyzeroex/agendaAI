import { Injectable } from '@angular/core';

export interface SmsPayload {
  to: string;         // telefone do destinatário
  message: string;    // corpo da mensagem
  tipo?: string;      // 'lembrete' | 'confirmacao' | 'cancelamento' | 'manual'
}

export interface SmsResult {
  success: boolean;
  sid?: string;
  to?: string;
  status?: string;
  simulated?: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SmsService {

  private readonly endpoint = '/api/sms/send';

  /**
   * Envia um SMS via Vercel Serverless → Twilio.
   * Em desenvolvimento sem credenciais, retorna sucesso simulado.
   */
  async send(payload: SmsPayload): Promise<SmsResult> {
    try {
      const resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro desconhecido');
      return data as SmsResult;
    } catch (e: any) {
      console.error('[SmsService] Falha ao enviar SMS:', e.message);
      return { success: false, error: e.message };
    }
  }

  // --- Mensagens pré-formatadas ---

  async enviarConfirmacao(telefone: string, nomeCliente: string, servico: string, horario: string): Promise<SmsResult> {
    return this.send({
      to: telefone,
      tipo: 'confirmacao',
      message: `✅ Olá, ${nomeCliente}! Seu agendamento *${servico}* às ${horario} foi confirmado. Até lá! — AgendaAi`,
    });
  }

  async enviarLembrete(telefone: string, nomeCliente: string, servico: string, horario: string): Promise<SmsResult> {
    return this.send({
      to: telefone,
      tipo: 'lembrete',
      message: `⏰ Lembrete, ${nomeCliente}! Você tem *${servico}* amanhã às ${horario}. Responda CONFIRMAR ou CANCELAR. — AgendaAi`,
    });
  }

  async enviarCancelamento(telefone: string, nomeCliente: string, servico: string): Promise<SmsResult> {
    return this.send({
      to: telefone,
      tipo: 'cancelamento',
      message: `😔 ${nomeCliente}, seu agendamento *${servico}* foi cancelado. Para reagendar acesse o link ou nos chame! — AgendaAi`,
    });
  }

  async enviarManual(telefone: string, mensagem: string): Promise<SmsResult> {
    return this.send({ to: telefone, message: mensagem, tipo: 'manual' });
  }
}
