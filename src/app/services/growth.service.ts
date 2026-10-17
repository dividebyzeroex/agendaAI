import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { boundedFetch } from '../core/helpers/bounded-fetch';
@Injectable({ providedIn: 'root' })
export class GrowthService {
  private db = inject(SupabaseService).client;
  private keys = new Map<string, string>();
  async command(tenant: string, action: string, data: any) {
    const fingerprint = tenant + ':' + action + ':' + JSON.stringify(data),
      key = this.keys.get(fingerprint) || crypto.randomUUID();
    this.keys.set(fingerprint, key);
    const { data: result, error } = await this.db
      .rpc('growth_operation', { p_tenant: tenant, p_action: action, p_data: data, p_key: key })
      .abortSignal(AbortSignal.timeout(20000));
    if (error)
      throw Error(
        error.code === 'PGRST202'
          ? 'Esta atualização está sendo preparada. Tente novamente em instantes.'
          : error.code === '23505'
            ? 'Este registro já existe. Confira a lista.'
            : ['23514', '22P02', '23502'].includes(error.code)
              ? 'Confira os valores e limites dos campos.'
              : error.message || 'Não foi possível salvar.',
      );
    this.keys.delete(fingerprint);
    return result;
  }
  async reconcile(tenant: string, month: string) {
    const {
      data: { session },
    } = await this.db.auth.getSession();
    if (!session) throw Error('Entre novamente.');
    const r = await boundedFetch('/api/billing?action=connect-reconcile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ estabelecimentoId: tenant, month }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Não foi possível conciliar.');
    return data;
  }
}
