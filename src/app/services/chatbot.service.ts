import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject, Observable, from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';

export interface ChatMessage {
  id: string;
  sender: 'business' | 'customer';
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
  id: string;
  estabelecimento_id: string;
  provider: 'zernio';
  channel: 'whatsapp' | 'facebook' | 'instagram' | 'telegram';
  config: any;
  status: 'active' | 'inactive';
}

export interface ZernioAccount {
  id: string;
  platform: string;
  displayName: string;
  username: string;
  profilePicture: string;
  status: string;
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
  private notifService = inject(NotificationService);

  
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  conversations$ = this.conversationsSubject.asObservable();

  private aiIntentsSubject = new BehaviorSubject<{ [conversationId: string]: string }>({});
  aiIntents$ = this.aiIntentsSubject.asObservable();
  
  

  private activeConversationSubject = new BehaviorSubject<Conversation | null>(null);
  activeConversation$ = this.activeConversationSubject.asObservable();

  private integrationsSubject = new BehaviorSubject<{ [key: string]: ChatbotIntegration }>({});
  public integrations$ = this.integrationsSubject.asObservable();

  private connectedChannelsSubject = new BehaviorSubject<ZernioAccount[]>([]);
  public connectedChannels$ = this.connectedChannelsSubject.asObservable();

  private robotsSubject = new BehaviorSubject<ChatbotRobot[]>([]);
  robots$ = this.robotsSubject.asObservable();
  
  private messageSubscription: any;

  async init() {
    this.supabase.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        this.loadRobots();
        this.loadConversations();
        this.loadIntegrations();
        this.loadConnectedChannels();
      }
    });

    // Escutar eventos broadcast do zernio-webhook
    this.messageSubscription = this.supabase.client
      .channel('zernio_messages')
      
      .on('broadcast', { event: 'new_message' }, payload => {
         console.log("Recebido broadcast do zernio:", payload);
         this.loadConversations();
         const activeId = this.activeConversationSubject.getValue()?.id;
         if (activeId && payload['payload']?.userPhone === activeId) {
            this.setActiveConversation(activeId);
         }
      })
      .on('broadcast', { event: 'ai_intent' }, payload => {
         console.log("Intent da IA recebido:", payload);
         const { userPhone, intent } = payload['payload'] || {};
         if (userPhone && intent) {
            const currentIntents = this.aiIntentsSubject.getValue();
            this.aiIntentsSubject.next({ ...currentIntents, [userPhone]: intent });
            
            if (intent.includes('Agendado') || intent.includes('Venda')) {
               this.notifService.showToast({
                  type: 'AI_INSIGHT',
                  title: 'Ação do Assistente',
                  message: `🤖 IA detectou: ${intent}`,
                  icon: 'pi pi-sparkles'
               });
               setTimeout(() => {
                  const intentsAfter = this.aiIntentsSubject.getValue();
                  const newIntents = { ...intentsAfter };
                  delete newIntents[userPhone];
                  this.aiIntentsSubject.next(newIntents);
               }, 5000);
            }
         }
      })
.subscribe();
  }

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
      const data = integrations as any[];
      const integrationMap = data.reduce((acc, curr) => {
        acc[curr.channel] = curr;
        return acc;
      }, {} as { [key: string]: ChatbotIntegration });
      
      this.integrationsSubject.next(integrationMap);
    }
  }

  async loadConnectedChannels() {
    try {
      const { data, error } = await this.supabase.client.functions.invoke('zernio-accounts', {
         method: 'GET'
      });

      if (error) throw error;

      if (data && data.accounts && Array.isArray(data.accounts)) {
        const channels: ZernioAccount[] = data.accounts.map((ac: any) => ({
           id: ac._id,
           platform: ac.platform,
           displayName: ac.displayName || ac.metadata?.profileData?.displayName || '',
           username: ac.username || ac.metadata?.profileData?.username || '',
           profilePicture: ac.profilePicture || ac.metadata?.profileData?.profilePicture || '',
           status: ac.platformStatus || 'active'
        }));
        this.connectedChannelsSubject.next(channels);
      }
    } catch (err) {
      console.error("Erro ao carregar contas conectadas da Zernio:", err);
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
    if (!user) return;
    const { data: ests } = await this.supabase.client.rpc('get_estabelecimento_by_user', { p_user_id: user.id });
    const est = (ests as any)?.[0];
    if (!est) return;

    const { data, error } = await this.supabase.client
      .rpc('upsert_chatbot_integration', {
        p_data: {
          estabelecimento_id: est.id,
          channel,
          status: 'active',
          config,
          provider: 'zernio'
        }
      });

    if (error) throw error;
    
    // Update local state
    const current = this.integrationsSubject.value;
    const existing = current[channel];

    const newObj: ChatbotIntegration = {
       id: existing?.id || '',
       estabelecimento_id: est.id,
       provider: 'zernio',
       channel,
       config,
       status: 'active'
    };
    
    current[channel] = newObj;
    this.integrationsSubject.next(current);
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

       if (data && data.messages && Array.isArray(data.messages)) {
         conv.messages = data.messages.map((zm: any) => ({
            id: zm.id,
            text: typeof zm.message === 'string' ? zm.message : (zm.message?.text || zm.text || ''),
            sender: zm.direction === 'outgoing' ? 'business' : 'customer',
            timestamp: new Date(zm.createdAt || zm.timestamp || new Date()),
            status: 'sent'
         }));
         // As mensagens do Zernio já vêm na ordem que pedimos (asc)
       }
    } catch (e) {
       console.error("Erro ao carregar mensagens da conversa:", e);
    }

    this.activeConversationSubject.next(conv);
  }

  getActiveConversation(): Conversation | null {
    return this.activeConversationSubject.getValue();
  }

  async sendMessage(text: string, convId: string, accountId?: string) {
    // Add locally immediately for UX
    this.addMessage(convId, {
      id: Math.random().toString(36).substr(2, 9),
      sender: 'business',
      text,
      timestamp: new Date()
    });

    if (!accountId) return;

    try {
      const { data, error } = await this.supabase.client.functions.invoke('zernio-send', {
        method: 'POST',
        body: { channel_id: accountId, to: convId, text: text }
      });

      if (error) throw error;
      console.log('Mensagem enviada com sucesso via Zernio API:', data);
    } catch (e) {
      console.error('Erro ao enviar mensagem:', e);
    }
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
