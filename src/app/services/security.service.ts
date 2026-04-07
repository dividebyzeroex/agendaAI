import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';

/**
 * SecurityEngine: Implementação de Criptografia de Ponta-a-Ponta (AES-GCM 256-bit).
 * Integração com Supabase Vault via RPC personalizada.
 */
@Injectable({ providedIn: 'root' })
export class SecurityService {
  private supabase = inject(SupabaseService).client;
  private estService = inject(EstabelecimentoService);

  private cachedKey: CryptoKey | null = null;
  private estId: string | null = null;

  constructor() {
    this.estService.activeId$.subscribe(id => {
      this.estId = id;
      this.cachedKey = null; // Invalida cache ao trocar estabelecimento
    });
  }

  /**
   * Obtém a chave mestra do estabelecimento no Supabase Vault
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.cachedKey) return this.cachedKey;
    if (!this.estId) throw new Error('Contexto de estabelecimento não identificado.');

    // RPC: get_or_create_establishment_key (Definida no SQL do Plano de Implementação)
    const { data: b64Key, error } = await this.supabase.rpc('get_or_create_establishment_key', {
      p_establishment_id: this.estId
    });

    if (error || !b64Key) {
      const msg = error?.message || 'Chave não encontrada no Vault.';
      console.warn(`[SecurityService] Falha ao recuperar chave (Pode ser um erro de infraestrutura SQL): ${msg}`);
      throw new Error(`Falha de segurança: ${msg}`);
    }

    // Importar a chave Base64 para o formato de CryptoKey do navegador
    const rawKey = Uint8Array.from(atob(b64Key), c => c.charCodeAt(0));
    this.cachedKey = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return this.cachedKey;
  }

  /**
   * Criptografa um texto plano
   * Retorna: IV (12 bytes) + Ciphertext (Base64)
   */
  async encryptData(text: string): Promise<string> {
    if (!text) return '';
    const key = await this.getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Geração de IV único (Initialization Vector) para cada cifra
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Concatenar IV + Encrypted Data para transporte único
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...result));
  }

  /**
   * Descriptografa um Ciphertext (Base64)
   */
  async decryptData(cipherText: string): Promise<string> {
    if (!cipherText || cipherText.length < 16) return cipherText; // Provável dado não criptografado

    try {
      const key = await this.getEncryptionKey();
      const binary = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
      
      const iv = binary.slice(0, 12);
      const data = binary.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (e) {
      // Se falhar, retorna o original (pode ser dado novo ainda não provisionado ou erro SQL)
      if (typeof cipherText === 'string' && cipherText.length > 50) {
        console.warn('[SecurityService] Falha na descriptografia de dado longo. Verifique extensões SQL:', e);
      }
      return cipherText;
    }
  }

  /**
   * Helper para criptografar objetos em massa
   */
  async encryptObject<T>(obj: T, fields: (keyof T)[]): Promise<T> {
    const cloned = { ...obj };
    for (const field of fields) {
      if (cloned[field] && typeof cloned[field] === 'string') {
        cloned[field] = await this.encryptData(cloned[field] as string) as any;
      }
    }
    return cloned;
  }

  /**
   * Helper para descriptografar objetos em massa
   */
  async decryptObject<T>(obj: T, fields: (keyof T)[]): Promise<T> {
    if (!obj) return obj;
    const cloned = { ...obj };
    for (const field of fields) {
      if (cloned[field] && typeof cloned[field] === 'string') {
        cloned[field] = await this.decryptData(cloned[field] as string) as any;
      }
    }
    return cloned;
  }
  /**
   * Registra um evento de segurança via RPC (Soberania de Auditoria)
   */
  async logSecurityEvent(acao: string, detalhes: any = {}): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      await this.supabase.rpc('log_security_event', {
        p_user_id: user?.id || null,
        p_estabelecimento_id: this.estId,
        p_acao: acao,
        p_detalhes: detalhes
      });
    } catch (e) {
      // Falha silenciosa no log para não interromper o fluxo principal, mas reportada no console de dev
      console.warn('[SecurityService] Falha ao registrar evento de segurança:', e);
    }
  }
}
