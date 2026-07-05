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

export interface ChatbotRobot {
  id?: string;
  estabelecimento_id?: string;
  name: string;
  role: string;
  avatar: string;
  tone: string;
  active: boolean;
  channel?: string; // Optional field mapping to integration if needed
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

  private integrationsSubject = new BehaviorSubject<Record<string, any>>({
    whatsapp: { active: false },
    facebook: { active: false },
    instagram: { active: false }
  });
  integrations$ = this.integrationsSubject.asObservable();

  private robotsSubject = new BehaviorSubject<ChatbotRobot[]>([]);
  robots$ = this.robotsSubject.asObservable();

  constructor() {
    this.loadIntegrations();
    this.loadRobots();
    this.loadConversations();
  }

  async loadConversations() {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) return;

    const { data: ests } = await this.supabase.client.rpc('get_estabelecimento_by_user', { p_user_id: user.id });
    const est = (ests as any)?.[0];
    if (!est) return;

    const { data: messages, error } = await this.supabase.client
      .from('chatbot_messages')
      .select('*')
      .eq('estabelecimento_id', est.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading conversations:', error);
      return;
    }

    if (messages) {
      // Agrupar mensagens por customer_phone
      const convosMap = new Map<string, Conversation>();

      messages.forEach((msg: any) => {
        const phone = msg.customer_phone || 'Desconhecido';
        if (!convosMap.has(phone)) {
          convosMap.set(phone, {
            id: `conv_${phone}`,
            customerName: phone, // Nome real poderia vir de outra tabela
            customerPhone: phone,
            channel: msg.channel as any || 'whatsapp',
            lastMessage: '',
            lastUpdate: new Date(msg.created_at),
            status: 'active',
            messages: []
          });
        }
        
        const conv = convosMap.get(phone)!;
        conv.messages.push({
          id: msg.id,
          sender: msg.sender,
          text: msg.message,
          timestamp: new Date(msg.created_at)
        });
        
        conv.lastMessage = msg.message;
        conv.lastUpdate = new Date(msg.created_at);
      });

      // Converter map para array e ordenar por lastUpdate (mais recentes primeiro)
      const convosArray = Array.from(convosMap.values()).sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
      
      this.conversationsSubject.next(convosArray);

      // Se houver uma conversa ativa, atualizar ela
      if (this.activeConversationSubject.value) {
        const updatedActive = convosArray.find(c => c.id === this.activeConversationSubject.value!.id);
        if (updatedActive) {
          this.activeConversationSubject.next(updatedActive);
        }
      }
    }
  }

  /**
   * Loads real integration status from Supabase
   */
  async loadIntegrations() {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) return;

    // Get establishment ID using safe RPC
    const { data: ests } = await this.supabase.client
      .rpc('get_estabelecimento_by_user', { p_user_id: user.id });

    const est = (ests as any)?.[0];
    if (!est) return;

    const { data: integrations } = await this.supabase.client
      .rpc('get_chatbot_integrations_by_estab', { p_estab_id: est.id });

    if (integrations) {
      const state: Record<string, any> = { whatsapp: { active: false }, facebook: { active: false }, instagram: { active: false } };
      (integrations as any[]).forEach((inc: any) => {
        state[inc.channel] = { 
          active: inc.status === 'active',
          profileName: inc.config?.profileName || this.getMockProfileName(inc.channel)
        };
      });
      this.integrationsSubject.next(state);
    }
  }

  async loadRobots() {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) return;

    const { data: ests } = await this.supabase.client.rpc('get_estabelecimento_by_user', { p_user_id: user.id });
    const est = (ests as any)?.[0];
    if (!est) return;

    const { data: robots } = await this.supabase.client.rpc('get_chatbot_robots', { p_estab_id: est.id });
    
    if (robots) {
      // Map to frontend interface
      const mappedRobots = (robots as any[]).map(r => ({
        ...r,
        channel: 'WhatsApp' // We default to WA display for now
      }));
      this.robotsSubject.next(mappedRobots);
    }
  }

  async saveRobot(robot: ChatbotRobot) {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: ests } = await this.supabase.client.rpc('get_estabelecimento_by_user', { p_user_id: user.id });
    const est = (ests as any)?.[0];
    if (!est) throw new Error('Establishment not found');

    const { data, error } = await this.supabase.client.rpc('upsert_chatbot_robot_safe', {
      p_data: {
        id: robot.id,
        estabelecimento_id: est.id,
        name: robot.name,
        role: robot.role,
        avatar: robot.avatar,
        tone: robot.tone,
        active: robot.active
      }
    });

    if (error) throw error;
    await this.loadRobots();
    return data;
  }

  async deleteRobot(id: string) {
    const { error } = await this.supabase.client.from('chatbot_robots').delete().eq('id', id);
    if (error) throw error;
    await this.loadRobots();
  }

  private getMockProfileName(channel: string): string {
    if (channel === 'whatsapp') return '+55 11 98765-4321';
    if (channel === 'instagram') return '@barbearia.elite';
    return 'Barbearia Elite';
  }

  /**
   * Persists a new integration config
   */
  async saveIntegration(channel: 'whatsapp' | 'facebook' | 'instagram', config: any) {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get establishment ID using safe RPC
    const { data: ests } = await this.supabase.client
      .rpc('get_estabelecimento_by_user', { p_user_id: user.id });

    const est = (ests as any)?.[0];
    if (!est) throw new Error('Establishment not found');

    const { error } = await this.supabase.client
      .rpc('upsert_chatbot_integration_safe', {
        p_data: {
          establishment_id: est.id,
          channel,
          status: 'active',
          config
        }
      });

    if (error) throw error;
    
    // Update local state
    const current = this.integrationsSubject.value;
    current[channel] = { active: true, profileName: config?.profileName || this.getMockProfileName(channel) };
    this.integrationsSubject.next({ ...current });
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
        text: "Assistente Inteligente em ação. Como posso ajudar com seu agendamento?",
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

  // Removido getMockConversations()
}
