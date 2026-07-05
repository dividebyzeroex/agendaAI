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
  channel: 'whatsapp' | 'facebook' | 'instagram' | 'telegram';
  lastMessage: string;
  lastUpdate: Date;
  status: 'active' | 'completed' | 'waiting';
  messages: ChatMessage[];
  accountId?: string; // Usado para buscar mensagens na API do Zernio
}

export interface ChatbotIntegration {
  id?: string;
  establishment_id: string;
  channel: 'whatsapp' | 'facebook' | 'instagram' | 'telegram';
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
    instagram: { active: false },
    telegram: { active: false }
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

    // Chamar a Edge Function zernio-inbox para listar as conversas
    try {
      const { data, error } = await this.supabase.client.functions.invoke('zernio-inbox', {
         method: 'POST'
      });

      if (error) throw error;

      if (data && data.data && Array.isArray(data.data)) {
        const convos: Conversation[] = data.data.map((zc: any) => ({
           id: zc.participantId, // ID da conversa no frontend será o participantId
           customerName: zc.participantName || zc.participantUsername || 'Desconhecido',
           customerPhone: zc.participantId,
           channel: zc.platform || 'instagram',
           lastMessage: zc.lastMessage || '',
           lastUpdate: new Date(zc.updatedTime || new Date()),
           status: zc.status === 'active' ? 'active' : 'completed',
           messages: [],
           accountId: zc.accountId
        }));
        
        // Ordenar mais recentes primeiro
        convos.sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
        this.conversationsSubject.next(convos);
      }
    } catch (err) {
      console.error("Erro ao carregar conversas do Zernio:", err);
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
      const state: Record<string, any> = { whatsapp: { active: false }, facebook: { active: false }, instagram: { active: false }, telegram: { active: false } };
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
  async saveIntegration(channel: 'whatsapp' | 'facebook' | 'instagram' | 'telegram', config: any) {
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

  async setActiveConversation(id: string) {
    const convos = this.conversationsSubject.getValue();
    const conv = convos.find(c => c.id === id);
    if (!conv) {
      this.activeConversationSubject.next(null);
      return;
    }

    // Ao ativar a conversa, buscar as mensagens reais dela no Zernio
    try {
       const { data, error } = await this.supabase.client.functions.invoke('zernio-inbox', {
         method: 'POST',
         body: { conversation_id: conv.id, account_id: conv.accountId }
       });
       
       if (error) throw error;

       if (data && data.data && Array.isArray(data.data)) {
         conv.messages = data.data.map((zm: any) => ({
            id: zm.id,
            text: zm.message?.text || zm.text || '',
            sender: zm.fromMe ? 'bot' : 'user',
            timestamp: new Date(zm.timestamp || new Date()),
            status: 'sent'
         }));
         // As mensagens do Zernio já vêm na ordem que pedimos (asc)
       }
    } catch (e) {
       console.error("Erro ao carregar mensagens da conversa:", e);
    }

    this.activeConversationSubject.next(conv);
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
