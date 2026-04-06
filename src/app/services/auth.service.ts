import { Injectable, NgZone, inject } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient | null = null;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private userProfileSubject = new BehaviorSubject<{ nome: string, role: string } | null>(null);
  
  public user$ = this.currentUserSubject.asObservable();
  public profile$ = this.userProfileSubject.asObservable();

  private ngZone = inject(NgZone);

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    try {
      if (environment.supabaseUrl && environment.supabaseUrl !== 'REPLACE_WITH_YOUR_SUPABASE_URL') {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
        
        // Listen to auth state changes
        this.supabase.auth.onAuthStateChange((event, session) => {
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
    
    // 1. Tenta buscar pelo user_id (Conexão já estabelecida)
    let { data, error } = await this.supabase
      .from('profissionais')
      .select('id, nome, role, email')
      .eq('user_id', userId)
      .maybeSingle();

    // 2. Se não encontrou, tenta buscar pelo e-mail do usuário autenticado (Primeiro acesso)
    if (!data && !error) {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user?.email) {
        const { data: profByEmail, error: emailErr } = await this.supabase
          .from('profissionais')
          .select('id, nome, role, email')
          .eq('email', user.email)
          .maybeSingle();

        if (profByEmail && !emailErr) {
          data = profByEmail;
          // Realiza o Linkage: Salva o user_id no registro do profissional
          await this.supabase
            .from('profissionais')
            .update({ user_id: userId })
            .eq('id', profByEmail.id);
          
          console.log(`[AuthService] Identidade vinculada: ${user.email} -> ${profByEmail.role}`);
        }
      }
    }

    if (data) {
      this.userProfileSubject.next({ nome: data.nome, role: data.role });
    } else {
      // Fallback para admin genérico se não for profissional listado
      // Nota: No futuro, isso pode ser movido para uma tabela de 'empresa_contas'
      this.userProfileSubject.next({ nome: 'Admin', role: 'dono' });
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
    if (!this.supabase) throw new Error('Supabase not initialized.');
    
    const { data, error } = await this.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/admin'
      }
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

  async logout() {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
    localStorage.removeItem('ag-mock-user');
    this.currentUserSubject.next(null);
  }
}
