import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProdutosService, Produto } from '../../services/produtos.service';

@Component({
  selector: 'app-admin-produtos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-produtos.html',
  styleUrls: ['./admin-produtos.css']
})
export class AdminProdutos implements OnInit {
  public svc = inject(ProdutosService);
  
  produtos: Produto[] = [];
  isLoading = false;
  
  // Painel de edição
  panelAberto = false;
  isNovo = false;
  isSaving = false;
  erro = '';
  prodAtual: Partial<Produto> = {};

  ngOnInit() {
    this.svc.produtos$.subscribe(p => this.produtos = p);
    this.svc.isLoading$.subscribe(l => this.isLoading = l);
  }

  abrirNovo() {
    this.isNovo = true;
    this.erro = '';
    this.prodAtual = { ativo: true, preco: 0, estoque: 0 };
    this.panelAberto = true;
  }

  abrirEditar(p: Produto) {
    this.isNovo = false;
    this.erro = '';
    this.prodAtual = { ...p };
    this.panelAberto = true;
  }

  fecharPainel() {
    this.panelAberto = false;
  }

  async salvar() {
    if (!this.prodAtual.nome) {
      this.erro = 'Nome do produto é obrigatório.';
      return;
    }
    if (this.prodAtual.preco === undefined || this.prodAtual.preco < 0) {
      this.erro = 'Preço inválido.';
      return;
    }
    
    this.isSaving = true;
    this.erro = '';
    try {
      await this.svc.saveProduto(this.prodAtual as Produto);
      this.fecharPainel();
    } catch (e: any) {
      this.erro = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  confirmarDelete: string | null = null;
  
  async deletarProduto(id: string) {
    if (this.confirmarDelete !== id) {
      this.confirmarDelete = id;
      return;
    }
    await this.svc.deleteProduto(id);
    this.confirmarDelete = null;
  }

  cancelarDelete() {
    this.confirmarDelete = null;
  }
}
