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

  activeTab: string = 'channels';
  conversations$: Observable<Conversation[]> = this.chatService.conversations$;
  activeConversation$: Observable<Conversation | null> = this.chatService.activeConversation$;
  integrations$ = this.chatService.integrations$;
  connectedChannels$ = this.chatService.connectedChannels$;

  aiIntents$ = this.chatService.aiIntents$;
    aiActiveConversationsCount = 0;
  

  // Local State
  selectedConvId: string | null = null;
  newMessage: string = '';

  // Onboarding Stepper
  showOnboarding = false;
  onboardingStep = 1;
  targetChannel: 'whatsapp' | 'facebook' | 'instagram' | 'telegram' | null = null;
  
  // Real Config Storage
  whatsappConfig = { phoneId: '', token: '' }; // phoneId será usado como zernio_channel_id
  isVerifying = false;
  errorMessage = '';

  // Gamification: "Fábrica de Robôs" State
  myRobots$ = this.chatService.robots$;
  showRobotModal = false;
  robotForm = { id: null as string | null, name: '', role: 'Atendente Geral', channel: 'WhatsApp', tone: 'Amigável', avatar: '🤖', active: true };

  // Test Chat Modal
  showTestModal = false;
  testingRobot: any = null;
  testMessages: { sender: 'user' | 'ai', text: string, time: Date }[] = [];
  testNewMessage: string = '';
  isAiTyping = false;

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

  openTestModal(robot: any) {
    this.testingRobot = robot;
    this.testMessages = [
      { sender: 'ai', text: `Olá! Eu sou ${robot.name} (${robot.role}), como posso te ajudar hoje?`, time: new Date() }
    ];
    this.testNewMessage = '';
    this.showTestModal = true;
  }

  closeTestModal() {
    this.showTestModal = false;
    this.testingRobot = null;
  }

  sendMessageToTestBot() {
    if (!this.testNewMessage.trim()) return;
    
    this.testMessages.push({ sender: 'user', text: this.testNewMessage, time: new Date() });
    this.testNewMessage = '';
    
    this.isAiTyping = true;
    
    // Simula delay de digitação
    setTimeout(() => {
      this.isAiTyping = false;
      this.testMessages.push({
        sender: 'ai',
        text: `[MODO TESTE] Entendi sua mensagem. Sou o assistente de IA configurado com o tom "${this.testingRobot?.tone}". Esta é uma resposta simulada.`,
        time: new Date()
      });
    }, 1500);
  }

  ngOnInit() {
    this.chatService.loadRobots();
    this.chatService.loadConversations();
    this.chatService.loadIntegrations();
    this.chatService.loadConnectedChannels();

    // Listen to Intents to calculate active count
    this.aiIntents$.subscribe(intents => {
      this.aiActiveConversationsCount = Object.keys(intents).length;
    });




    // Quando abrir a tela, checar se tem conversa ativa e selecionar aba
    this.activeConversation$.subscribe(conv => {
      if (conv && this.activeTab !== 'live') {
        this.selectedConvId = conv.id;
        this.activeTab = 'live';
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
    const activeConv = this.chatService.getActiveConversation();
    if (activeConv) {
      this.chatService.sendMessage(this.newMessage, this.selectedConvId, activeConv.accountId);
    }
    this.newMessage = '';
  }

  private typingTimeout: any;
  onTyping(convId: string | null | undefined) {
    if (!convId) return;
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
       const activeConv = this.chatService.getActiveConversation();
       if (activeConv && activeConv.accountId) {
          this.chatService.broadcastTyping(convId, activeConv.accountId, 'Equipe de Atendimento');
       }
    }, 500); // Throttling
  }

  getChannelIcon(channel: string): string {
    if (channel === 'whatsapp') return 'pi pi-whatsapp';
    if (channel === 'facebook') return 'pi pi-facebook';
    if (channel === 'instagram') return 'pi pi-instagram';
    if (channel === 'telegram') return 'pi pi-telegram';
    return 'pi pi-comment';
  }

  // ONBOARDING ACTIONS
  openOnboarding(channel: 'whatsapp' | 'facebook' | 'instagram' | 'telegram') {
    this.targetChannel = channel;
    this.onboardingStep = 1;
    this.showOnboarding = true;
    this.whatsappConfig = { phoneId: '', token: '' };
  }

  async nextStep() {
    if (this.onboardingStep === 1) {
      this.onboardingStep = 2;
    } else if (this.onboardingStep === 2) {
      this.isVerifying = true;
      try {
        await this.chatService.saveIntegration(this.targetChannel as any, { 
          zernio_channel_id: this.whatsappConfig.phoneId,
          provider: 'zernio'
        });
        this.isVerifying = false;
        this.onboardingStep = 3;
      } catch (e: any) {
        this.isVerifying = false;
        alert('Falha na configuração: ' + e.message);
      }
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
