import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { AiAssistantComponent } from '../ai-assistant/ai-assistant.component';
import { MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';
import { MenuItem } from 'primeng/api';
import { CostTrackerService } from '../../services/cost-tracker.service';
import { AgentSwarmService } from '../../services/agent-swarm.service';
import { KeybindingService } from '../../services/keybinding.service';
import { WorkflowService } from '../../services/workflow.service';
import { OnboardingService } from '../../services/onboarding.service';
import { OnboardingModalComponent } from '../../components/onboarding-modal/onboarding-modal';
import { UpdateNotifierComponent } from '../../components/update-notifier/update-notifier.component';
import { NotificationService } from '../../services/notification.service';
import { AiInsightsService } from '../../services/ai-insights.service';
import { NotificationCenterComponent } from '../../components/notification-center/notification-center';
import { BillingService } from '../../services/billing.service';
import { ToastContainerComponent } from '../../components/toast-container/toast-container.component';
import { ThemeService, AppTheme } from '../../services/theme.service';
import { TooltipModule } from 'primeng/tooltip';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    CommandPaletteComponent,
    AiAssistantComponent,
    OnboardingModalComponent,
    UpdateNotifierComponent,
    NotificationCenterComponent,
    ToastContainerComponent,
    MenuModule,
    AvatarModule,
    TooltipModule
  ],
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.css']
})
export class AdminLayout implements OnInit {
  costTracker = inject(CostTrackerService);
  swarmAgent = inject(AgentSwarmService);
  keybindings = inject(KeybindingService);
  workflowEngine = inject(WorkflowService);
  onboarding = inject(OnboardingService);
  notifService = inject(NotificationService);
  aiInsights   = inject(AiInsightsService);
  billing      = inject(BillingService);
  theme        = inject(ThemeService);
  estabService = inject(EstabelecimentoService);

  showOnboarding = false;
  isNotifOpen = false;
  
  userMenuItems: MenuItem[] | undefined;

  async ngOnInit() {
    this.userMenuItems = [
      { 
        label: 'Minha Conta', 
        icon: 'pi pi-user',
        routerLink: ['/admin/configuracoes']
      },
      { 
        label: 'Configurações', 
        icon: 'pi pi-cog',
        routerLink: ['/admin/configuracoes']
      },
      { 
        label: 'Ver Página Pública', 
        icon: 'pi pi-external-link',
        url: '/',
        target: '_blank'
      },
      { separator: true },
      { 
        label: 'Sair da Plataforma', 
        icon: 'pi pi-sign-out', 
        command: () => this.logout() 
      }
    ];
    // Check if this user needs to do onboarding (flag in Supabase)
    await this.onboarding.checkOnboarding();
    this.onboarding.showOnboarding$.subscribe(show => (this.showOnboarding = show));

    // Lógica Gatekeeper: Sincroniza dados do Onboarding salvos localmente antes da autenticação
    await this.processTempOnboarding();
  }

  private async processTempOnboarding() {
    const rawData = localStorage.getItem('ag_temp_onboarding_data');
    if (rawData) {
      try {
        const onboardingData = JSON.parse(rawData);
        // Tenta criar a empresa com os dados fornecidos no onboarding "off-line" (pré-login)
        await this.estabService.createEstabelecimento({
          ...onboardingData,
          onboarding_completo: true
        });
        // Sucesso! Limpamos o lixo do storage
        localStorage.removeItem('ag_temp_onboarding_data');
        localStorage.removeItem('ag_onboarding_email');
        console.log('[Gatekeeper] Empresa criada com sucesso via Onboarding Diferido.');
      } catch (err) {
        console.error('[Gatekeeper] Erro ao sincronizar onboarding:', err);
      }
    }
  }

  logout() {
    window.location.href = '/login';
  }

  setTheme(t: AppTheme) {
    this.theme.setTheme(t);
  }
}
