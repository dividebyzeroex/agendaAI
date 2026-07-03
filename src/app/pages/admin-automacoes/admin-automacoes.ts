import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService, WorkflowRule } from '../../services/workflow.service';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-admin-automacoes',
  standalone: true,
  imports: [CommonModule, FormsModule, DropdownModule, InputTextModule, ButtonModule],
  templateUrl: './admin-automacoes.html',
  styleUrls: ['./admin-automacoes.css']
})
export class AdminAutomacoes implements OnInit {
  workflowService = inject(WorkflowService);

  rules: WorkflowRule[] = [];
  newRuleName = '';
  newRuleTrigger: 'ON_EVENT_CREATED' | 'ON_EVENT_CANCELED' = 'ON_EVENT_CREATED';
  newRuleAction: 'SEND_SMS' | 'SEND_EMAIL' | 'NOTIFY_ADMIN' = 'SEND_SMS';
  isLoading = true;
  
  triggerOptions = [
    { label: 'Quando: Novo Agendamento', value: 'ON_EVENT_CREATED' },
    { label: 'Quando: Cliente Cancelar', value: 'ON_EVENT_CANCELED' }
  ];
  
  actionOptions = [
    { label: 'Então: Enviar SMS de Lembrete', value: 'SEND_SMS' },
    { label: 'Então: Enviar Email Analítico', value: 'SEND_EMAIL' },
    { label: 'Então: Alarme no Dashboard', value: 'NOTIFY_ADMIN' }
  ];

  ngOnInit() {
    this.workflowService.rules$.subscribe(rules => {
      this.rules = rules;
      this.isLoading = false;
    });
  }

  toggleRule(id: string) {
    this.workflowService.toggleRule(id);
  }

  async createRule() {
    if (this.newRuleName.trim()) {
      await this.workflowService.addRule({
        name: this.newRuleName,
        trigger: this.newRuleTrigger,
        action: this.newRuleAction,
        active: true
      });
      this.newRuleName = '';
    }
  }

  formatTrigger(str: string) {
    return str === 'ON_EVENT_CREATED' ? 'Novo Agendamento' : 'Cancelamento Detectado';
  }

  formatAction(str: string) {
    const map: Record<string, string> = {
      'SEND_SMS': 'Disparar SMS de Lembrete',
      'SEND_EMAIL': 'Enviar Email Analítico',
      'NOTIFY_ADMIN': 'Alarme no Dashboard'
    };
    return map[str] || str;
  }
}
