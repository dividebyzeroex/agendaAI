import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

@Component({
  selector: 'app-comanda',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comanda.html',
  styleUrls: ['./comanda.css']
})
export class ComandaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);
  public estService = inject(EstabelecimentoService);

  token = '';
  caixaItem: any = null;
  produtos: any[] = [];
  loading = true;
  error = '';
  
  // Customization
  nomeEstabelecimento = 'Agenda AI';

  async ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.error = 'Comanda não encontrada (Token inválido).';
      this.loading = false;
      return;
    }

      // Se houver config via SegmentoService, usar:
      // this.nomeEstabelecimento = cfg.nomeApp;

    this.estService.estabelecimento$.subscribe(est => {
      if (est?.nome) this.nomeEstabelecimento = est.nome;
    });

    try {
      await this.carregarComanda();
    } catch (e: any) {
      this.error = 'Erro ao carregar comanda: ' + e.message;
    } finally {
      this.loading = false;
    }
  }

  async carregarComanda() {
    // Buscar caixa_itens via RPC
    const { data, error } = await this.supabase.client.rpc('get_comanda_digital', { p_token: this.token });
    if (error) throw error;
    if (!data) {
      throw new Error('Comanda não encontrada.');
    }
    
    // A RPC retorna JSON aggregate de produtos.
    this.caixaItem = data;
    this.produtos = this.caixaItem.produtos || [];
  }
}
