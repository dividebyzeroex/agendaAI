import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface Cliente {
  id?: string;
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

  clientes$ = new BehaviorSubject<Cliente[]>([]);

  constructor() {
    this.fetchClientes();
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
    const { data, error } = await this.supabase
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) {
      this.ngZone.run(() => this.clientes$.next(data || []));
    }
  }

  getClientes(): Cliente[] {
    return this.clientes$.value;
  }

  async addCliente(c: Omit<Cliente, 'id' | 'created_at'>): Promise<Cliente> {
    const { data, error } = await this.supabase
      .from('clientes')
      .insert([c])
      .select()
      .single();
    if (error) throw error;
    this.ngZone.run(() => {
      this.clientes$.next([data, ...this.clientes$.value]);
    });
    return data;
  }

  async updateCliente(id: string, changes: Partial<Cliente>): Promise<Cliente> {
    const { data, error } = await this.supabase
      .from('clientes')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    this.ngZone.run(() => {
      this.clientes$.next(this.clientes$.value.map(c => (c.id === id ? data : c)));
    });
    return data;
  }

  async registrarFalta(id: string, faltasAtuais: number): Promise<void> {
    await this.updateCliente(id, { faltas: faltasAtuais + 1 });
  }

  async upsertClienteByPhone(nome: string, telefone: string): Promise<Cliente> {
    // Check existing first - using maybeSingle to avoid 406/PGRST116 errors
    const { data: existing, error } = await this.supabase
      .from('clientes')
      .select('*')
      .eq('telefone', telefone)
      .maybeSingle();

    if (existing) {
      await this.updateCliente(existing.id, { ultima_visita: new Date().toISOString().split('T')[0] });
      return existing;
    }
    return this.addCliente({ nome, telefone, ultima_visita: new Date().toISOString().split('T')[0] });
  }
}
