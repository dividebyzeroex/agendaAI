import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient | null = null;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  
  public user$: Observable<User | null> = this.currentUserSubject.asObservable();

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    try {
      if (environment.supabaseUrl && environment.supabaseUrl !== 'REPLACE_WITH_YOUR_SUPABASE_URL') {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
        
        // Listen to auth state changes
        this.supabase.auth.onAuthStateChange((event, session) => {
          this.currentUserSubject.next(session?.user || null);
        });
      } else {
        console.warn('⚠️ [Supabase Auth] Chaves provisórias detectadas. Modo Mock (Local) Ativado.');
      }
    } catch (e) {
      console.error('Failed to init Supabase auth', e);
    }
  }

  get isAuthed_Sync(): boolean {
    return !!this.currentUserSubject.value;
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
      const mockAdmin: unknown = { id: 'test-admin', email };
      this.currentUserSubject.next(mockAdmin as User);
      return { data: { user: mockAdmin }, error: null };
    }
    
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async logout() {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
    this.currentUserSubject.next(null);
  }
}
