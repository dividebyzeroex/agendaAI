import { Injectable, NgZone, inject } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';
import { SecurityService } from './security.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient | null = null;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  userProfileSubject = new BehaviorSubject<{
    id: string,
    nome: string,
    role: string,
    email?: string,
    primeiro_acesso: boolean,
    onboarding_concluido: boolean
  } | null>(null);
  userProfile$ = this.userProfileSubject.asObservable();

  get userProfileValue() {
    return this.userProfileSubject.value;
  }
  public profile$ = this.userProfileSubject.asObservable();

  private sharedSupabase = inject(SupabaseService);
  private ngZone = inject(NgZone);
  private router = inject(Router);
  private security = inject(SecurityService);

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    try {
      if (environment.supabaseUrl && environment.supabaseUrl !== 'REPLACE_WITH_YOUR_SUPABASE_URL') {
        this.supabase = this.sharedSupabase.client;

        this.supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN') {
            console.log('🛡️ [Identidade] Acesso Soberano Concedido.');
            this.security.logSecurityEvent('LOGIN_SUCCESS', { method: 'automatic' });
          }
          if (event === 'TOKEN_REFRESHED') {
            console.log('🔄 [Segurança] Chave Bearer Rotacionada com Sucesso.');
            this.security.logSecurityEvent('TOKEN_REFRESHED');
          }

          setTimeout(() => this.ngZone.run(async () => {
            this.currentUserSubject.next(session?.user || null);
            if (session?.user) {
              await this.loadUserProfile(session.user.id);
            } else {
              this.userProfileSubject.next(null);
            }
          }), 0);
        });
      } else {
        console.error('⛔ [Supabase Auth] Credenciais ausentes. Impossível iniciar sessão.');
      }
    } catch (e) {
      console.error('Failed to init Supabase auth', e);
    }
  }

  get isAuthed_Sync(): boolean {
    return !!this.currentUserSubject.value;
  }

  async checkSession(): Promise<boolean> {
    // If we already have a user in memory (or mock), it's authed
    if (this.isAuthed_Sync && this.userProfileValue) return true;

    if (!this.supabase) {
      return false;
    }

    // O getSession await aguarda o parse de #access_token da URL após redirects do Magic Link
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session) {
      this.currentUserSubject.next(session.user);
      await this.loadUserProfile(session.user.id);
      return true;
    }
    return false;
  }

  private async loadUserProfile(userId: string) {
    if (!this.supabase) return;
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user || user.id !== userId) { this.userProfileSubject.next(null); return; }
    const { data: isOwner, error: ownerError } = await this.supabase.rpc('is_platform_owner');
    if (!ownerError && isOwner === true) {
      this.userProfileSubject.next({id:user.id,nome:'Proprietário AgendaAI',role:'superadmin',email:user.email,primeiro_acesso:false,onboarding_concluido:true});
      return;
    }
    let { data, error } = await this.supabase.rpc('get_user_profile_safe', { p_user_id: user.id });
    if (error) throw new Error('Não foi possível verificar suas permissões. Tente novamente.');
    if (!data && (user.email_confirmed_at || user.phone_confirmed_at)) {
      const lookup = user.email_confirmed_at ? {p_email:user.email} : {p_phone:user.phone};
      const result = await this.supabase.rpc('get_user_profile_safe', lookup);
      if (result.error) throw result.error;
      if (result.data) {
        const linked = await this.supabase.rpc('link_user_to_professional', {p_professional_id:result.data.id,p_user_id:user.id});
        if (linked.error) throw linked.error;
        data = result.data;
      }
    }
    this.userProfileSubject.next(data ? {
      id:data.id,nome:data.nome,role:data.role,email:user.email,
      primeiro_acesso:!!data.primeiro_acesso,onboarding_concluido:!!data.onboarding_concluido
    } : {id:user.id,nome:'Novo negócio',role:'new',email:user.email,primeiro_acesso:false,onboarding_concluido:false});
  }

  // --- Real Auth Flow ---

  async signUpWithPassword(email: string, password: string) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized.');
    }
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/admin',
        data: { terms_version: '2026-10-04', terms_accepted: localStorage.getItem('ag_terms_accepted') === 'true', marketing_consent: localStorage.getItem('ag_marketing_consent') === 'true' }
      }
    });
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    if (!this.supabase) {
      return { data: null, error: new Error('Supabase Client not initialized (check env)') };
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signInWithOtp(email: string) {
    if (!this.supabase) {
      return { data: null, error: new Error('Supabase not initialized') };
    }
    const { data, error } = await this.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/admin',
        data: { terms_version: '2026-10-04', terms_accepted: localStorage.getItem('ag_terms_accepted') === 'true', marketing_consent: localStorage.getItem('ag_marketing_consent') === 'true' }
      }
    });
    if (error) throw error;
    return { data, error };
  }

  async signInWithEmail(email: string, password: string) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized.');
    }
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return { data, error };
  }

  async signInWithPhone(phone: string) {
    if (!this.supabase) throw new Error('Supabase not initialized.');
    const { data, error } = await this.supabase.auth.signInWithOtp({
      phone: phone.startsWith('+') ? phone : `+55${phone.replace(/\D/g, '')}`
    });
    if (error) throw error;
    return data;
  }

  async verifyOtp(phone: string, token: string) {
    if (!this.supabase) throw new Error('Supabase not initialized.');
    const { data, error } = await this.supabase.auth.verifyOtp({
      phone: phone.startsWith('+') ? phone : `+55${phone.replace(/\D/g, '')}`,
      token,
      type: 'sms'
    });
    if (error) throw error;
    return data;
  }

  async signInWithGoogle() {
    if (!this.supabase) throw new Error('Supabase not initialized.');
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/admin'
      }
    });
    if (error) throw error;
    return data;
  }

  async getSessionToken(): Promise<string> {
    if (!this.supabase) return '';
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async updateUserProfileLocal(changes: any) {
    const current = this.userProfileSubject.value;
    if (current) {
      this.userProfileSubject.next({ ...current, ...changes });
    }
  }

  async redirectAfterLogin() {
    // 🔗 Inteligência de Redirecionamento de Identidade
    if (this.currentUserSubject.value) await this.loadUserProfile(this.currentUserSubject.value.id);
    const profile = this.userProfileSubject.value;
    if (!profile) {
      this.ngZone.run(() => this.router.navigate(['/login']));
      return;
    }

    this.ngZone.run(() => {
      if (profile.role === 'superadmin') {
        this.router.navigate(['/platform-admin/dashboard']);
      } else if (profile.role === 'new') {
        this.router.navigate(['/onboarding']);
      } else if (profile.role === 'dono') {
        this.router.navigate(['/admin/dashboard']);
      } else if (profile.role === 'secretaria') {
        this.router.navigate(['/admin/agenda']);
      } else if (profile.role === 'operacional') {
        this.router.navigate(['/admin/agenda']);
      } else {
        // Fallback genérico para roles antigas
        this.router.navigate(['/admin/agenda']);
      }
    });
  }

  async logout() {
    if (this.supabase) {
      this.security.logSecurityEvent('LOGOUT');
      await this.supabase.auth.signOut();
    }
    this.currentUserSubject.next(null);
    this.userProfileSubject.next(null);
    this.ngZone.run(() => this.router.navigate(['/login']));
  }
}
