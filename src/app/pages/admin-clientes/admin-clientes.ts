import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { SmsService } from '../../services/sms.service';
import { NovoClienteModalComponent } from '../../components/novo-cliente-modal/novo-cliente-modal.component';

@Component({
  selector: 'app-admin-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule, NovoClienteModalComponent],
  templateUrl: './admin-clientes.html',
  styleUrls: ['./admin-clientes.css']
})
export class AdminClientes implements OnInit {
  private clienteService = inject(ClienteService);
  private smsService     = inject(SmsService);
  private cdr            = inject(ChangeDetectorRef);

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
    this.clienteService.clientes$.subscribe(data => {
      this.clientes = data;
      this.applyFilter();
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  applyFilter() {
    const q = this.searchQuery.toLowerCase();
    
    // De-duplicação por telefone (Prioriza o primeiro encontrado)
    const uniqueMap = new Map<string, Cliente>();
    this.clientes.forEach(c => {
      if (c.telefone && !uniqueMap.has(c.telefone)) {
        uniqueMap.set(c.telefone, c);
      } else if (!c.telefone) {
        // Se sem telefone, permite como único temporário (ex: cadastro manual incompleto)
        uniqueMap.set(`id-${c.id}`, c);
      }
    });

    const deduped = Array.from(uniqueMap.values());

    this.filteredClientes = q
      ? deduped.filter(c => c.nome.toLowerCase().includes(q) || c.telefone?.includes(q))
      : deduped;
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
    if (!this.smsModal.cliente?.telefone || !this.smsModal.mensagem.trim()) return;
    this.smsModal.sending = true;
    this.smsModal.result  = '';

    const result = await this.smsService.enviarManual(
      this.smsModal.cliente.telefone,
      this.smsModal.mensagem
    );

    this.smsModal.sending = false;
    if (result.success) {
      this.smsModal.result = result.simulated
        ? '✅ SMS simulado (configure Twilio no Vercel para envio real)'
        : `✅ Enviado! SID: ${result.sid}`;
      setTimeout(() => this.closeSmsModal(), 3000);
    } else {
      this.smsModal.result = `❌ Erro: ${result.error}`;
    }
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
