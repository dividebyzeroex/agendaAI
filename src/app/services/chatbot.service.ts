import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  channel: 'whatsapp' | 'facebook' | 'instagram';
  lastMessage: string;
  lastUpdate: Date;
  status: 'active' | 'completed' | 'waiting';
  messages: ChatMessage[];
}

export interface ChatbotIntegration {
  id?: string;
  establishment_id: string;
  channel: 'whatsapp' | 'facebook' | 'instagram';
  status: 'active' | 'inactive' | 'error';
  config: any;
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private supabase = inject(SupabaseService);

  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  conversations$ = this.conversationsSubject.asObservable();

  private activeConversationSubject = new BehaviorSubject<Conversation | null>(null);
  activeConversation$ = this.activeConversationSubject.asObservable();

  private integrationsSubject = new BehaviorSubject<Record<string, boolean>>({
    whatsapp: false,
    facebook: false,
    instagram: false
  });
  integrations$ = this.integrationsSubject.asObservable();

  constructor() {
    this.loadIntegrations();
    this.conversationsSubject.next(this.getMockConversations());
  }

  /**
   * Loads real integration status from Supabase
   */
  async loadIntegrations() {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) return;

    // Get establishment ID (simplified assumption: 1 establishment per user)
    const { data: est } = await this.supabase.client
      .from('estabelecimento')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!est) return;

    const { data: integrations } = await this.supabase.client
      .from('chatbot_integrations')
      .select('channel, status')
      .eq('establishment_id', est.id);

    if (integrations) {
      const state: Record<string, boolean> = { whatsapp: false, facebook: false, instagram: false };
      integrations.forEach(inc => {
        state[inc.channel] = inc.status === 'active';
      });
      this.integrationsSubject.next(state);
    }
  }

  /**
   * Persists a new integration config
   */
  async saveIntegration(channel: 'whatsapp' | 'facebook' | 'instagram', config: any) {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: est } = await this.supabase.client
      .from('estabelecimento')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!est) throw new Error('Establishment not found');

    const { error } = await this.supabase.client
      .from('chatbot_integrations')
      .upsert({
        establishment_id: est.id,
        channel,
        status: 'active',
        config,
        updated_at: new Date()
      }, { onConflict: 'establishment_id,channel' });

    if (error) throw error;
    
    // Update local state
    const current = this.integrationsSubject.value;
    this.integrationsSubject.next({ ...current, [channel]: true });
  }

  /**
   * Facebook/Instagram OAuth Flow via Supabase
   */
  async authenticateMeta(channel: 'facebook' | 'instagram') {
    const { data, error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        scopes: 'pages_messaging,instagram_basic,pages_show_list,manage_pages',
        redirectTo: window.location.origin + '/admin/chatbots'
      }
    });

    if (error) throw error;
    return data;
  }

  setActiveConversation(convId: string) {
    const conv = this.conversationsSubject.value.find(c => c.id === convId);
    if (conv) this.activeConversationSubject.next(conv);
  }

  async processSimulatedMessage(text: string, convId: string) {
    this.addMessage(convId, {
      id: Math.random().toString(36).substr(2, 9),
      sender: 'user',
      text,
      timestamp: new Date()
    });

    setTimeout(() => {
      this.addMessage(convId, {
        id: Math.random().toString(36).substr(2, 9),
        sender: 'bot',
        text: "Assistente Elite em ação. Como posso ajudar com seu agendamento?",
        timestamp: new Date()
      });
    }, 1500);
  }

  private addMessage(convId: string, msg: ChatMessage) {
    const current = this.conversationsSubject.value;
    const index = current.findIndex(c => c.id === convId);
    if (index !== -1) {
      current[index].messages.push(msg);
      current[index].lastMessage = msg.text;
      current[index].lastUpdate = new Date();
      this.conversationsSubject.next([...current]);
      
      if (this.activeConversationSubject.value?.id === convId) {
        this.activeConversationSubject.next({ ...current[index] });
      }
    }
  }

  private getMockConversations(): Conversation[] {
    return [
      {
        id: 'conv_1',
        customerName: 'Ricardo Oliveira',
        customerPhone: '(11) 98765-4321',
        channel: 'whatsapp',
        lastMessage: 'Vou querer o corte degradê para as 15h.',
        lastUpdate: new Date(),
        status: 'active',
        messages: [
          { id: 'm1', sender: 'bot', text: 'Olá Ricardo! Como posso ajudar?', timestamp: new Date(Date.now() - 360000) },
          { id: 'm4', sender: 'user', text: 'Vou querer o corte degradê para as 15h.', timestamp: new Date() },
        ]
      },
      {
        id: 'conv_2',
        customerName: 'Amanda Silva',
        customerPhone: '(11) 91234-5678',
        channel: 'instagram',
        lastMessage: 'Obrigada, agendado!',
        lastUpdate: new Date(Date.now() - 86400000),
        status: 'completed',
        messages: []
      }
    ];
  }
}
