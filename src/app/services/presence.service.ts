import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface OnlineUser {
  id: string;
  nome: string;
  role: string;
  last_active: string;
}

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);

  private onlineUsersSubject = new BehaviorSubject<OnlineUser[]>([]);
  public onlineUsers$ = this.onlineUsersSubject.asObservable();

  private channel: any;

  constructor() {
    this.initPresence();
  }

  private initPresence() {
    // Escuta mudanças de perfil para iniciar ou reiniciar a presença
    this.auth.userProfile$.subscribe(profile => {
      if (profile) {
        this.joinPresence(profile);
      } else {
        this.leavePresence();
      }
    });
  }

  private async joinPresence(profile: any) {
    if (this.channel) this.channel.unsubscribe();

    this.channel = this.supabase.channel('presence:equipe', {
      config: { presence: { key: profile.id } }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        this.updateOnlineUsers(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        console.log('[Presence] Novo colega entrou:', key);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
        console.log('[Presence] Um colega saiu:', key);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await this.channel.track({
            id: profile.id,
            nome: profile.nome,
            role: profile.role,
            last_active: new Date().toISOString()
          });
        }
      });
  }

  private updateOnlineUsers(state: any) {
    const list: OnlineUser[] = [];
    Object.keys(state).forEach(key => {
      // Supabase Presence pode ter multiplas sessões para a mesma chave (ex: 2 abas)
      // Pegamos apenas a informação da primeira sessão ativa
      const userState = state[key][0];
      if (userState) {
        list.push({
          id: userState.id,
          nome: userState.nome,
          role: userState.role,
          last_active: userState.last_active
        });
      }
    });
    this.onlineUsersSubject.next(list);
  }

  private leavePresence() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.onlineUsersSubject.next([]);
  }
}
