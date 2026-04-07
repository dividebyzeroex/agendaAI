import { Injectable, NgZone, inject } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
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
    primeiro_acesso: boolean, 
    onboarding_concluido: boolean
  } | null>(null);
  userProfile$ = this.userProfileSubject.asObservable();

  get userProfileValue() {
    return this.userProfileSubject.value;
  }
  public profile$ = this.userProfileSubject.asObservable();

  private ngZone = inject(NgZone);
  private router = inject(Router);
  private security = inject(SecurityService);

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    try {
      if (environment.supabaseUrl && environment.supabaseUrl !== 'REPLACE_WITH_YOUR_SUPABASE_URL') {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'ag-auth-token',
            storage: localStorage
          }
        });
        
        this.supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN') {
            console.log('🛡️ [Identidade] Acesso Soberano Concedido.');
            this.security.logSecurityEvent('LOGIN_SUCCESS', { method: 'automatic' });
          }
          if (event === 'TOKEN_REFRESHED') {
            console.log('🔄 [Segurança] Chave Bearer Rotacionada com Sucesso.');
            this.security.logSecurityEvent('TOKEN_REFRESHED');
          }
          
          this.ngZone.run(async () => {
            this.currentUserSubject.next(session?.user || null);
            if (session?.user) {
              await this.loadUserProfile(session.user.id);
            } else {
              this.userProfileSubject.next(null);
            }
          });
        });
      } else {
        console.warn('⚠️ [Supabase Auth] Chaves provisórias detectadas. Modo Mock (Local) Ativado.');
        // Load mock user from session
        const saved = localStorage.getItem('ag-mock-user');
        if (saved) {
          try {
            this.currentUserSubject.next(JSON.parse(saved));
          } catch (e) { localStorage.removeItem('ag-mock-user'); }
        }
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
    if (this.isAuthed_Sync) return true;

    if (!this.supabase) {
      // Check local storage for mock session
      const saved = localStorage.getItem('ag-mock-user');
      if (saved) {
        this.currentUserSubject.next(JSON.parse(saved));
        return true;
      }
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
    
    // 1. Tenta buscar pelo user_id via RPC Soberana
    let { data, error } = await this.supabase.rpc('get_user_profile_safe', { p_user_id: userId });

    // 2. Se não encontrou, tenta buscar pelo e-mail do usuário autenticado (Primeiro acesso)
    if (!data && !error) {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user?.email) {
        const { data: profByEmail, error: emailErr } = await this.supabase.rpc('get_user_profile_safe', { p_email: user.email });

        if (profByEmail && !emailErr) {
          data = profByEmail;
          // Linkage de Identidade Soberano (RPC)
          await this.supabase.rpc('link_user_to_professional', { p_professional_id: profByEmail.id, p_user_id: userId });
          console.log(`[AuthService] Identidade vinculada: ${user.email} -> ${profByEmail.role}`);
        }
      }
    }

    if (data) {
      const p = data as any;
      this.userProfileSubject.next({ 
        id: p.id,
        nome: p.nome, 
        role: p.role,
        primeiro_acesso: p.primeiro_acesso || false,
        onboarding_concluido: p.onboarding_concluido || false
      });
    } else {
      // 3. Fallback: Tenta buscar pelo Telefone do usuário autenticado
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user?.phone) {
        const { data: profByPhone, error: phoneErr } = await this.supabase.rpc('get_user_profile_safe', { p_phone: user.phone });

        if (profByPhone && !phoneErr) {
          const p = profByPhone as any;
          this.userProfileSubject.next({ 
            id: p.id,
            nome: p.nome, 
            role: p.role,
            primeiro_acesso: p.primeiro_acesso || false,
            onboarding_concluido: p.onboarding_concluido || false
          });
          // Linkage Automático (RPC)
          await this.supabase.rpc('link_user_to_professional', { p_professional_id: p.id, p_user_id: userId });
          return;
        }
      }

      // Fallback para admin genérico
      this.userProfileSubject.next({ 
        id: 'admin-legacy',
        nome: 'Admin', 
        role: 'dono',
        primeiro_acesso: false,
        onboarding_concluido: true
      });
    }
  }

  // --- Real Auth Flow ---

  async signUpWithPassword(email: string, password: string) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized.');
    }
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    if (!this.supabase) {
      // Mock Bypass for local dev
      const mockAdmin: User = { id: 'test-admin', email } as User;
      this.currentUserSubject.next(mockAdmin);
      localStorage.setItem('ag-mock-user', JSON.stringify(mockAdmin));
      return { data: { user: mockAdmin }, error: null };
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
      // Mock mode
      console.log('Mock: OTP Sent to', email);
      return;
    }
    const { error } = await this.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/admin'
      }
    });
    if (error) throw error;
  }

  async signInWithEmail(email: string, password: string) {
    if (!this.supabase) {
      // Mock mode
      if (password === 'admin123') return;
      throw new Error('Senha incorreta no modo simulado.');
    }
    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
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
    const profile = this.userProfileSubject.value;
    if (!profile) {
      this.ngZone.run(() => this.router.navigate(['/login']));
      return;
    }

    this.ngZone.run(() => {
      if (profile.role === 'dono') {
        // Se for o primeiro acesso e o onboarding não estiver feito, vai pro Dashboard que lida com o Onboarding
        this.router.navigate(['/admin/dashboard']);
      } else if (profile.role === 'financeiro') {
        this.router.navigate(['/admin/analytics']);
      } else if (profile.role === 'barbeiro' || profile.role === 'esteticista' || profile.role === 'profissional') {
        this.router.navigate(['/admin/agenda']);
      } else {
        this.router.navigate(['/admin/dashboard']);
      }
    });
  }

  async logout() {
    if (this.supabase) {
      this.security.logSecurityEvent('LOGOUT');
      await this.supabase.auth.signOut();
    }
    localStorage.removeItem('ag-mock-user');
    this.currentUserSubject.next(null);
    this.userProfileSubject.next(null);
    this.ngZone.run(() => this.router.navigate(['/login']));
  }
}
