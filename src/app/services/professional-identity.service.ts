import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { SecurityService } from './security.service';

/** Resolve the canonical professional by tenant + UUID instead of relying on
 *  agenda_events.profissional_nome, which older RPCs leave null. The ID is also
 *  the source of attribution for commissions. */
@Injectable({providedIn:'root'})
export class ProfessionalIdentityService {
  private db = inject(SupabaseService).client;
  private security = inject(SecurityService);

  async names(tenantId: string, ids: string[]): Promise<Map<string,string>> {
    const unique = [...new Set(ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
    if (!tenantId || !unique.length) return new Map();
    const {data,error} = await this.db.from('profissionais')
      .select('id,nome').eq('estabelecimento_id',tenantId).in('id',unique);
    if(error) throw Error('Não foi possível validar o profissional responsável pelo serviço.');
    const result = new Map<string,string>();
    await Promise.all((data || []).map(async record => {
      const decrypted = await this.security.decryptData(record.nome || '');
      if (decrypted?.trim()) result.set(record.id,decrypted.trim());
    }));
    return result;
  }
  async requiredName(tenantId: string, professionalId: string): Promise<string> {
    if (!professionalId) throw Error('Este atendimento não possui um profissional vinculado.');
    const names = await this.names(tenantId,[professionalId]);
    const name = names.get(professionalId);
    if (!name) throw Error('O profissional vinculado ao atendimento não foi encontrado neste estabelecimento. Confira o cadastro antes de receber.');
    return name;
  }
}
