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

  public produtos$ = new BehaviorSubject<Produto[]>([]);
  public isLoading$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.estService.activeId$.subscribe(id => {
      if (id) {
        this.fetchProdutos(id);
      } else {
        this.produtos$.next([]);
      }
    });
  }

  async fetchProdutos(estId: string) {
    this.ngZone.run(() => this.isLoading$.next(true));
    try {
      const { data, error } = await this.supabase
        .from('produtos')
        .select('*')
        .eq('estabelecimento_id', estId)
        .order('nome');
      
      if (error) throw new Error(parseSupabaseError(error));
      
      this.ngZone.run(() => this.produtos$.next(data as Produto[]));
    } catch (e: any) {
      console.error('Erro ao buscar produtos:', e.message);
    } finally {
      this.ngZone.run(() => this.isLoading$.next(false));
    }
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
