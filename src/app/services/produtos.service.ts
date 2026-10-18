import { Injectable, inject, NgZone } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { parseSupabaseError } from '../core/helpers/error-parser';
import { EstabelecimentoService } from './estabelecimento.service';
import { SupabaseService } from './supabase.service';

export interface Produto {
  id?: string;
  estabelecimento_id?: string;
  nome: string;
  descricao?: string;
  preco: number;
  estoque: number;
  codigo_barras?: string;
  ativo: boolean;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ProdutosService {
  private supabase: SupabaseClient = inject(SupabaseService).client;
  private estService = inject(EstabelecimentoService);
  private ngZone = inject(NgZone);

  public error$ = new BehaviorSubject<string>('');
  private loadVersion = 0;
  public produtos$ = new BehaviorSubject<Produto[]>([]);
  public isLoading$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.estService.activeId$.subscribe(id => {
      if (id) {
        this.fetchProdutos(id);
      } else {
        this.loadVersion++;
        this.produtos$.next([]);
        this.isLoading$.next(false);
        this.error$.next('');
      }
    });
  }

  async fetchProdutos(estId: string) {
    const version = ++this.loadVersion;
    this.error$.next('');
    this.ngZone.run(() => this.isLoading$.next(true));
    try {
      const { data, error } = await this.supabase
        .from('produtos')
        .select('*')
        .eq('estabelecimento_id', estId)
        .order('nome');
      
      if (error) throw new Error(parseSupabaseError(error));
      
      if (version === this.loadVersion) this.ngZone.run(() => this.produtos$.next(data ?? []));
    } catch (e: any) {
      if (version === this.loadVersion) this.error$.next('Não foi possível carregar os produtos. Tente novamente.');
    } finally {
      if (version === this.loadVersion) this.ngZone.run(() => this.isLoading$.next(false));
    }
  }

  async retryLoad() {
    const id = this.estService.estabelecimento$.value?.id;
    if (id) await this.fetchProdutos(id);
  }

  async saveProduto(p: Produto): Promise<Produto> {
    const estId = this.estService.estabelecimento$.value?.id;
    if (!estId) throw new Error('Estabelecimento não selecionado.');

    const payload = { ...p, estabelecimento_id: estId };
    
    let result;
    if (p.id) {
      result = await this.supabase
        .from('produtos')
        .update(payload)
        .eq('id', p.id)
        .select()
        .single();
    } else {
      result = await this.supabase
        .from('produtos')
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) throw new Error(parseSupabaseError(result.error));

    // Atualiza a lista em memória
    await this.fetchProdutos(estId);
    
    return result.data as Produto;
  }

  async deleteProduto(id: string) {
    const { error } = await this.supabase.from('produtos').delete().eq('id', id);
    if (error) throw new Error(parseSupabaseError(error));
    
    const estId = this.estService.estabelecimento$.value?.id;
    if (estId) await this.fetchProdutos(estId);
  }
}
