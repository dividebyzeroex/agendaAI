import { Component, inject, OnInit, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { ClientImport } from '../../components/client-import/client-import';
import { SmsService } from '../../services/sms.service';
import { NovoClienteModalComponent } from '../../components/novo-cliente-modal/novo-cliente-modal.component';

@Component({
  selector: 'app-admin-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClientImport],
  templateUrl: './admin-clientes.html',
  styleUrls: ['./admin-clientes.css']
})
export class AdminClientes implements OnInit {
  public clienteService = inject(ClienteService);
  private smsService     = inject(SmsService);
  private cdr            = inject(ChangeDetectorRef);

  private destroyRef = inject(DestroyRef);
  importOpen=inject(ActivatedRoute).snapshot.queryParamMap.has('importar');
  clientes: Cliente[] = [];
  filteredClientes: Cliente[] = [];
  searchQuery = '';
  isLoading   = true;

  // Modais
  showNovoClienteModal = false;
  selectedCliente: Cliente | undefined;
  smsModal: { open: boolean; cliente: Cliente | null; mensagem: string; sending: boolean; result: string } = {
    open: false, cliente: null, mensagem: '', sending: false, result: ''
  };

  ngOnInit() {
    this.clienteService.loading$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(v => { this.isLoading = v; this.cdr.markForCheck(); });
    this.clienteService.clientes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.clientes = data;
      this.applyFilter();

      this.cdr.detectChanges();
    });
  }

  applyFilter() {
    const q = this.searchQuery.toLowerCase();

    this.filteredClientes=this.clientes.filter(c=>!q||`${c.nome} ${c.telefone||''} ${c.email||''}`.toLowerCase().includes(q));
  }

  // --- Novo Cliente Modal ---
  abrirNovo() {
    this.selectedCliente = undefined;
    this.showNovoClienteModal = true;
  }

  abrirEditar(cliente: Cliente) {
    this.selectedCliente = cliente;
    this.showNovoClienteModal = true;
  }

  onClienteSalvo(cliente: Cliente) {
    this.showNovoClienteModal = false;
    this.selectedCliente = undefined;
    this.searchQuery = '';
    this.applyFilter();
  }

  // --- SMS Manual Modal ---
  openSmsModal(cliente: Cliente) {
    this.smsModal = {
      open: true,
      cliente,
      mensagem: `Olá, ${cliente.nome}! `,
      sending: false,
      result: ''
    };
  }

  closeSmsModal() { this.smsModal.open = false; }

  async enviarSms() {
    if (this.smsModal.sending || !this.smsModal.cliente?.telefone || !this.smsModal.mensagem.trim()) return;
    this.smsModal.sending = true;
    this.smsModal.result  = '';

    try{const result=await this.smsService.enviarManual(this.smsModal.cliente.telefone,this.smsModal.mensagem);this.smsModal.result=result.success?(result.simulated?'Envio simulado. Nenhum SMS foi enviado.':'Mensagem enviada.'):`Não foi possível enviar: ${result.error||'tente novamente'}`;}catch{this.smsModal.result='Não foi possível enviar. Tente novamente.';}finally{this.smsModal.sending=false;this.cdr.markForCheck();}
  }

  async enviarLembreteCliente(cliente: Cliente) {
    if (!cliente.telefone) return;
    await this.smsService.enviarLembrete(
      cliente.telefone,
      cliente.nome,
      'seu próximo agendamento',
      ''
    );
  }
}
