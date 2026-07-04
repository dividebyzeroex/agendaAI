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

  // WhatsApp connection modes
  whatsappConnectionMode: 'qr-code' | 'meta-api' = 'qr-code';
  qrCodeImage: string | null = null;
  isGeneratingQr = false;

  // Gamification: "Fábrica de Robôs" State
  myRobots$ = this.chatService.robots$;
  showRobotModal = false;
  robotForm = { id: null as string | null, name: '', role: 'Atendente Geral', channel: 'WhatsApp', tone: 'Amigável', avatar: '🤖', active: true };

  openRobotModal(robot?: any) {
    if (robot) {
      this.robotForm = { ...robot };
    } else {
      this.robotForm = { id: null, name: '', role: 'Atendente Geral', channel: 'WhatsApp', tone: 'Amigável', avatar: '🤖', active: true };
    }
    this.showRobotModal = true;
  }

  async saveRobot() {
    try {
      await this.chatService.saveRobot(this.robotForm as any);
      this.showRobotModal = false;
    } catch (e: any) {
      alert("Erro ao salvar robô: " + e.message);
    }
  }

  async deleteRobot(id: string) {
    if (confirm("Tem certeza que deseja demitir esse robô?")) {
      try {
        await this.chatService.deleteRobot(id);
      } catch (e: any) {
        alert("Erro ao deletar: " + e.message);
      }
    }
  }

  async toggleRobotStatus(robot: any) {
    try {
      await this.chatService.saveRobot({ ...robot, active: !robot.active });
    } catch (e: any) {
      alert("Erro ao atualizar status.");
    }
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
    this.whatsappConfig = { phoneId: '', token: '' };
    this.whatsappConnectionMode = 'qr-code';
    this.qrCodeImage = null;
  }

  async nextStep() {
    if (this.onboardingStep === 1) {
      this.onboardingStep = 2;
      if (this.targetChannel === 'whatsapp' && this.whatsappConnectionMode === 'qr-code') {
        this.generateQrCode();
      }
    } else if (this.onboardingStep === 2) {
      if (this.targetChannel === 'whatsapp') {
        if (this.whatsappConnectionMode === 'meta-api') {
          this.isVerifying = true;
          try {
            await this.chatService.saveIntegration('whatsapp', this.whatsappConfig);
            this.isVerifying = false;
            this.onboardingStep = 3;
          } catch (e: any) {
            this.isVerifying = false;
            alert('Falha na configuração: ' + e.message);
          }
        } else {
          // It's QR Code mode and user clicked Simulate
          this.isVerifying = true;
          try {
             await this.chatService.saveIntegration('whatsapp', { type: 'evolution', qrCode: true });
             this.isVerifying = false;
             this.onboardingStep = 3;
          } catch(e: any) {
             this.isVerifying = false;
             alert('Erro: ' + e.message);
          }
        }
      } else {
        this.onboardingStep = 3;
      }
    }
  }

  generateQrCode() {
    this.isGeneratingQr = true;
    this.qrCodeImage = null;
    setTimeout(() => {
      // Mock QR code image for demonstration
      this.qrCodeImage = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=AgendaAi-Evolution-Simulation';
      this.isGeneratingQr = false;
    }, 2000);
  }

  switchWhatsappMode(mode: 'qr-code' | 'meta-api') {
    this.whatsappConnectionMode = mode;
    if (mode === 'qr-code' && !this.qrCodeImage) {
      this.generateQrCode();
    }
  }

  async authenticateViaOAuth() {
    if (!this.targetChannel || this.targetChannel === 'whatsapp') return;
    
    this.isVerifying = true;
    
    // Simulate opening Facebook/Instagram OAuth window
    const w = 600;
    const h = 700;
    const left = (window.screen.width / 2) - (w / 2);
    const top = (window.screen.height / 2) - (h / 2);
    
    const authWindow = window.open(
      'https://www.facebook.com/v17.0/dialog/oauth?client_id=AGENDA_AI_MOCK&redirect_uri=...',
      'MetaBusinessOAuth',
      `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=${w}, height=${h}, top=${top}, left=${left}`
    );

    try {
      // Polling or waiting for the popup to "complete"
      setTimeout(async () => {
        if (authWindow) authWindow.close();
        
        await this.chatService.saveIntegration(this.targetChannel as any, { 
          authMethod: 'oauth', 
          provider: this.targetChannel,
          pageName: this.targetChannel === 'instagram' ? '@barbearia.elite' : 'Barbearia Elite' 
        });
        
        this.isVerifying = false;
        this.onboardingStep = 3;
      }, 3000);
      
    } catch (err: any) {
      if (authWindow) authWindow.close();
      this.isVerifying = false;
      this.errorMessage = 'Erro ao conectar com a Meta.';
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
