import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';
import { boundedFetch } from '../core/helpers/bounded-fetch';
@Injectable({ providedIn: 'root' })
export class BusinessService {
  private db = inject(SupabaseService).client;
  private est = inject(EstabelecimentoService);
  private keys = new Map<string, string>();
  async command(action: string, data: any = {}, tenant = this.est.estabelecimento$.value?.id) {
    if (!tenant) throw Error('Selecione um estabelecimento.');
    const fingerprint = tenant + ':' + action + ':' + JSON.stringify(data);
    const key = this.keys.get(fingerprint) || crypto.randomUUID();
    this.keys.set(fingerprint, key);
    const { data: result, error } = await this.db
      .rpc('business_operation', { p_tenant: tenant, p_action: action, p_data: data, p_key: key })
      .abortSignal(AbortSignal.timeout(20000));
    if (error)
      throw Error(
        error.code === 'PGRST202'
          ? 'Este módulo está sendo preparado. Atualize em alguns instantes.'
          : ['23502', '22P02'].includes(error.code)
            ? 'Preencha todos os campos obrigatórios.'
            : error.code === '23505'
              ? 'Este registro já existe. Atualize a lista antes de tentar novamente.'
              : error.code === '23514'
                ? 'Confira os valores e os limites do formulário.'
                : error.message || 'Não foi possível salvar.',
      );
    this.keys.delete(fingerprint);
    return result;
  }
  async scheduleCampaign(id: string, tenant: string) {
    const {
      data: { session },
    } = await this.db.auth.getSession();
    if (!session) throw Error('Entre novamente para agendar.');
    const response = await boundedFetch('/api/sms/send?action=campaign-schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ campaign_id: id, estabelecimento_id: tenant }),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Não foi possível agendar.');
    return data;
  }
  async publicAction(action: string, token: string, body: any = {}) {
    const response = await boundedFetch('/api/public-booking?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Não foi possível concluir.');
    return data;
  }
}
