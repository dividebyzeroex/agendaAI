import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
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
import { ProfissionaisService } from '../../services/profissionais.service';
import { AuthService } from '../../services/auth.service';
import { map, Observable } from 'rxjs';
import { PresenceService, OnlineUser } from '../../services/presence.service';


@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    CommandPaletteComponent,
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
  authService  = inject(AuthService);
  profService  = inject(ProfissionaisService);
  presence     = inject(PresenceService); // Monitor de Vida em Tempo Real

  showOnboarding = false;
  isNotifOpen = false;
  
  userProfile$ = this.authService.profile$ as Observable<{nome: string, role: string} | null>;
  onlineUsers$ = this.presence.onlineUsers$;
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
    
    await this.onboarding.checkOnboarding();
    this.onboarding.showOnboarding$.subscribe(show => (this.showOnboarding = show));

    await this.processTempOnboarding();
  }

  get isDono(): Observable<boolean> {
    return this.userProfile$.pipe(map(p => p?.role === 'dono'));
  }

  get isAdminOrFin(): Observable<boolean> {
    return this.userProfile$.pipe(map(p => p?.role === 'dono' || p?.role === 'financeiro'));
  }

  private async processTempOnboarding() {
    const rawData = localStorage.getItem('ag_temp_onboarding_data');
    if (rawData) {
      try {
        const onboardingData = JSON.parse(rawData);
        await this.estabService.createEstabelecimento({
          ...onboardingData,
          onboarding_completo: true
        });

        // 🔗 REGRA: O Criador é o Dono Nato
        // Criamos o primeiro registro de profissional para garantir a identidade no primeiro login
        await this.profService.criarProfissional({
          nome: onboardingData.nome || 'Proprietário',
          email: onboardingData.email,
          telefone: onboardingData.telefone,
          role: 'dono',
          ativo: true,
          cargo: 'Proprietário'
        });

        localStorage.removeItem('ag_temp_onboarding_data');
        localStorage.removeItem('ag_onboarding_email');
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
