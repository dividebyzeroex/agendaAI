import { Component, inject, OnInit, DestroyRef, ChangeDetectorRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { SegmentoConfigService } from '../../services/segmento-config.service';
@Component({
  selector: 'app-novo-cliente-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './client-form.html',
})
export class NovoClienteModalComponent implements OnInit {
  clients = inject(ClienteService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroy = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private segment = inject(SegmentoConfigService);
  readonly id = this.route.snapshot.paramMap.get('id');
  cliente: Cliente | undefined;
  loading = true;
  saving = false;
  saved = false;
  erro = '';
  form = {
    nome: '',
    telefone: '',
    email: '',
    nascimento: '',
    observacoes: '',
    metadata: {} as Record<string, any>,
  };
  get isEdit() {
    return !!this.id;
  }
  get isSaude() {
    return ['clinica_medica', 'clinica_odonto', 'estetica'].includes(this.segment.current.id);
  }
  get isPetshop() {
    return this.segment.current.id === 'petshop';
  }
  ngOnInit() {
    if (!this.id) {
      this.loading = false;
      return;
    }
    this.clients.loading$.pipe(takeUntilDestroyed(this.destroy)).subscribe((v) => {
      this.loading = v;
      this.cdr.markForCheck();
    });
    this.clients.clientes$.pipe(takeUntilDestroyed(this.destroy)).subscribe((list) => {
      const c = list.find((item) => item.id === this.id);
      if (c && !this.cliente) {
        this.cliente = c;
        this.form = {
          nome: c.nome || '',
          telefone: c.telefone || '',
          email: c.email || '',
          nascimento: c.nascimento || '',
          observacoes: c.observacoes || '',
          metadata: structuredClone(c.metadata || {}),
        };
      }
      this.cdr.markForCheck();
    });
  }
  async confirmar() {
    if (this.saving || this.saved || !this.form.nome.trim() || (this.isEdit && !this.cliente))
      return;
    this.saving = true;
    this.erro = '';
    try {
      const values = {
        ...this.form,
        nome: this.form.nome.trim(),
        telefone: this.form.telefone.trim() || undefined,
        email: this.form.email.trim() || undefined,
        nascimento: this.form.nascimento || null,
        observacoes: this.form.observacoes.trim() || undefined,
      };
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
        throw new Error('Confira o e-mail informado.');
      if (this.id) await this.clients.updateCliente(this.id, values as any);
      else await this.clients.addCliente(values as any);
      this.saved = true;
      await this.router.navigate(['/admin/clientes']);
    } catch (e) {
      this.erro =
        e instanceof Error ? e.message : 'Não foi possível salvar. Seus dados foram mantidos.';
    } finally {
      this.saving = false;
      if (!this.destroy.destroyed) this.cdr.markForCheck();
    }
  }
}
