import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';
import { SecurityService } from './security.service';

export interface Cliente {
  id?: string;
  estabelecimento_id?: string;
  nome: string;
  telefone?: string;
  email?: string;
  nascimento?: string;
  observacoes?: string;
  ultima_visita?: string;
  faltas?: number;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ClienteService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);
  private estService = inject(EstabelecimentoService);
  private security = inject(SecurityService);

  clientes$ = new BehaviorSubject<Cliente[]>([]);

  constructor() {
    this.estService.activeId$.subscribe(id => {
      if (id) this.fetchClientes();
    });
    this.subscribeRealtime();
  }

  private subscribeRealtime() {
    this.supabase
      .channel('realtime_clientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, (payload) => {
        console.log('[ClientesRealtime] Syncing...', payload.eventType);
        this.ngZone.run(() => this.fetchClientes());
      })
      .subscribe();
  }

  async fetchClientes() {
    const currentId = (this.estService as any)['activeIdSubject'].value; 
    
    if (!currentId) return;

    const { data, error } = await this.supabase
      .rpc('get_clientes_by_estab', { p_estab_id: currentId });
    
    if (!error) {
      const decrypted = await Promise.all((data as Cliente[] || []).map((c: Cliente) => 
        this.security.decryptObject(c, ['nome', 'telefone', 'email', 'observacoes'])
      ));

      this.ngZone.run(() => this.clientes$.next(decrypted || []));
    }
  }

  getClientes(): Cliente[] {
    return this.clientes$.value;
  }

  async addCliente(c: Omit<Cliente, 'id' | 'created_at'>): Promise<Cliente> {
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) throw new Error('Contexto de estabelecimento não encontrado.');

    // Criptografia PII (Zero-Knowledge)
    const encrypted = await this.security.encryptObject(c, ['nome', 'telefone', 'email', 'observacoes']);

    const { data: encryptedData, error } = await this.supabase
      .rpc('create_cliente_safe', { 
        p_data: { ...encrypted, estabelecimento_id: estId } 
      })
      .maybeSingle<Cliente>();
    if (error) throw error;
    
    // Descriptografa para uso local imediato
    const decrypted = await this.security.decryptObject(encryptedData as Cliente, ['nome', 'telefone', 'email', 'observacoes']);

    this.ngZone.run(() => {
      this.clientes$.next([decrypted, ...this.clientes$.value]);
    });
    return decrypted;
  }

  async updateCliente(id: string, changes: Partial<Cliente>): Promise<Cliente> {
    const encrypted = await this.security.encryptObject(changes, ['nome', 'telefone', 'email', 'observacoes']);

    const { data: encryptedData, error } = await this.supabase
      .rpc('update_cliente_safe', { p_id: id, p_changes: encrypted })
      .maybeSingle<Cliente>();
    if (error) throw error;

    const decrypted = await this.security.decryptObject(encryptedData as Cliente, ['nome', 'telefone', 'email', 'observacoes']);

    this.ngZone.run(() => {
      this.clientes$.next(this.clientes$.value.map(c => (c.id === id ? decrypted : c)));
    });
    return decrypted;
  }

  async registrarFalta(id: string, faltasAtuais: number): Promise<void> {
    await this.updateCliente(id, { faltas: faltasAtuais + 1 });
  }

  async upsertClienteByPhone(nome: string, telefone: string): Promise<Cliente> {
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) throw new Error('Contexto não encontrado.');

    const encryptedTel = await this.security.encryptData(telefone);

    const { data: existing, error } = await this.supabase
      .rpc('get_clientes_by_estab', { p_estab_id: estId })
      .filter('telefone', 'eq', encryptedTel)
      .maybeSingle<Cliente>();

    if (existing) {
      const decryptedExisting = await this.security.decryptObject(existing, ['nome', 'telefone', 'email', 'observacoes']);
      await this.updateCliente(decryptedExisting.id!, { ultima_visita: new Date().toISOString().split('T')[0] });
      return decryptedExisting;
    }
    return this.addCliente({ nome, telefone, ultima_visita: new Date().toISOString().split('T')[0] });
  }
}
