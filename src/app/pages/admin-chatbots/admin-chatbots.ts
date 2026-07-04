import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService, Conversation } from '../../services/chatbot.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-admin-chatbots',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-chatbots.html',
  styleUrls: ['./admin-chatbots.css']
})
export class AdminChatbots implements OnInit {
  private chatService = inject(ChatbotService);

  activeTab: 'robots' | 'channels' | 'history' | 'live' = 'robots';
  conversations$: Observable<Conversation[]> = this.chatService.conversations$;
  activeConversation$: Observable<Conversation | null> = this.chatService.activeConversation$;
  integrations$ = this.chatService.integrations$;

  // Local State
  selectedConvId: string | null = null;
  newMessage: string = '';

  // Onboarding Stepper
  showOnboarding = false;
  onboardingStep = 1;
  targetChannel: 'whatsapp' | 'facebook' | 'instagram' | null = null;
  
  // Real Config Storage
  whatsappConfig = { phoneId: '', token: '' };
  isVerifying = false;
  errorMessage = '';

  // Gamification: "Fábrica de Robôs" State
  myRobots = [
    { id: 1, name: 'Marcos', role: 'Atendente de Agendamentos', channel: 'WhatsApp', tone: 'Amigável', avatar: '🤖', active: true }
  ];
  showRobotModal = false;
  robotForm = { id: null as number | null, name: '', role: 'Atendente Geral', channel: 'WhatsApp', tone: 'Amigável', avatar: '🤖' };

  openRobotModal(robot?: any) {
    if (robot) {
      this.robotForm = { ...robot };
    } else {
      this.robotForm = { id: null, name: '', role: 'Atendente Geral', channel: 'WhatsApp', tone: 'Amigável', avatar: '🤖' };
    }
    this.showRobotModal = true;
  }

  saveRobot() {
    if (this.robotForm.id) {
      const idx = this.myRobots.findIndex(r => r.id === this.robotForm.id);
      if (idx > -1) this.myRobots[idx] = { ...this.robotForm, active: true } as any;
    } else {
      this.myRobots.push({ ...this.robotForm, id: Date.now(), active: true } as any);
    }
    this.showRobotModal = false;
  }

  deleteRobot(id: number) {
    this.myRobots = this.myRobots.filter(r => r.id !== id);
  }

  toggleRobotStatus(id: number) {
    const robot = this.myRobots.find(r => r.id === id);
    if (robot) robot.active = !robot.active;
  }

  ngOnInit() {
    this.conversations$.subscribe(convs => {
      if (convs.length > 0 && !this.selectedConvId) {
        this.selectConversation(convs[0].id);
      }
    });
  }

  selectConversation(id: string) {
    this.selectedConvId = id;
    this.chatService.setActiveConversation(id);
    this.activeTab = 'live';
  }

  toggleIntegration(channel: 'whatsapp' | 'facebook' | 'instagram') {
    // For real toggling, we'd need to update the status in the DB
    // Currently, we just load them on init in the service
  }

  sendMessage() {
    if (!this.newMessage.trim() || !this.selectedConvId) return;
    this.chatService.processSimulatedMessage(this.newMessage, this.selectedConvId);
    this.newMessage = '';
  }

  getChannelIcon(channel: string | null): string {
    if (!channel) return 'pi pi-chat';
    const icons: Record<string, string> = {
      whatsapp: 'pi pi-whatsapp',
      facebook: 'pi pi-facebook',
      instagram: 'pi pi-instagram'
    };
    return icons[channel] || 'pi pi-chat';
  }

  // ONBOARDING ACTIONS
  openOnboarding(channel: 'whatsapp' | 'facebook' | 'instagram') {
    this.targetChannel = channel;
    this.onboardingStep = 1;
    this.showOnboarding = true;
    this.errorMessage = '';
    this.whatsappConfig = { phoneId: '', token: '' };
  }

  async nextStep() {
    if (this.onboardingStep === 2 && this.targetChannel === 'whatsapp') {
      this.isVerifying = true;
      try {
        await this.chatService.saveIntegration('whatsapp', this.whatsappConfig);
        this.isVerifying = false;
        this.onboardingStep = 3;
      } catch (err: any) {
        this.isVerifying = false;
        this.errorMessage = 'Falha ao autenticar com a Meta. Verifique o Phone ID e o Token.';
      }
    } else {
      this.onboardingStep++;
    }
  }

  async authenticateViaOAuth() {
    if (!this.targetChannel || this.targetChannel === 'whatsapp') return;
    
    this.isVerifying = true;
    try {
      // Simulating OAuth redirect and return for MVP UX
      setTimeout(async () => {
        await this.chatService.saveIntegration(this.targetChannel as any, { authMethod: 'oauth', provider: this.targetChannel });
        this.isVerifying = false;
        this.onboardingStep = 3;
      }, 1500);
      
    } catch (err: any) {
      this.isVerifying = false;
      this.errorMessage = 'Erro ao iniciar login com Facebook.';
    }
  }

  finishOnboarding() {
    this.closeOnboarding();
  }

  closeOnboarding() {
    this.showOnboarding = false;
    this.onboardingStep = 1;
    this.targetChannel = null;
    this.whatsappConfig = { phoneId: '', token: '' };
    this.isVerifying = false;
  }
}
