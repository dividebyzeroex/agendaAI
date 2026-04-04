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

  activeTab: 'channels' | 'history' | 'live' = 'channels';
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
      // In a real app, this redirects to Facebook. 
      // Supabase handles the session after redirect.
      await this.chatService.authenticateMeta(this.targetChannel);
      
      // Note: The redirection will happen here. 
      // After redirecting back, we'd typically have a listener or check the session.
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
