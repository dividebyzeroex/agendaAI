import { Injectable, inject, signal } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import {
  createDisplayCipher, DisplayPacket, DisplaySnapshot, openDisplayPacket,
  SealedPacket, sealDisplayPacket, validDisplaySecret
} from '../core/pay-display-protocol';

/**
 * Ephemeral, end-to-end encrypted POS ↔ customer display pairing.
 *
 * No permanent display credentials, schema migration or Vercel function.
 * Cross-device updates use public Supabase Realtime topics containing ONLY
 * ciphertext. Same-origin tabs additionally use BroadcastChannel.
 */
@Injectable({providedIn:'root'})
export class PayDisplayService {
  private db = inject(SupabaseService).client;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private local: BroadcastChannel | null = null;
  private key: CryptoKey | null = null;
  private secret = '';
  private generation = 0;
  private role: 'host' | 'viewer' | '' = '';
  private lastSnapshot: DisplaySnapshot | null = null;
  private lastIncomingRevision = -1;
  private outgoingRevision = 0;
  private lastHelloAt = 0;
  readonly connected = signal(false);
  readonly viewerConnected = signal(false);
  readonly lastReceivedAt = signal(0);
  readonly packets$ = new Subject<DisplayPacket>();

  get activeHost(): boolean { return this.role === 'host' && !!this.key; }
  get pairingSecret(): string { return this.activeHost ? this.secret : ''; }

  async host(secret: string): Promise<void> { await this.join(secret,'host'); }
  async view(secret: string): Promise<void> { await this.join(secret,'viewer'); }

  private async join(secret: string, role: 'host' | 'viewer'): Promise<void> {
    if (!validDisplaySecret(secret)) throw Error('Link de pareamento inválido.');
    if (this.secret === secret && this.role === role && this.key) return;
    this.leave();
    const generation = this.generation;
    this.role = role;
    this.secret = secret;
    const {topic,key} = await createDisplayCipher(secret);
    if (generation !== this.generation) return;
    this.key = key;
    if (typeof BroadcastChannel !== 'undefined') {
      this.local = new BroadcastChannel(topic);
      this.local.onmessage = event => {
        const message = event.data as {event?:string;payload?:unknown};
        if (message?.event && message.payload) void this.receive(message.event,message.payload,generation);
      };
    }
    const channel = this.db.channel(topic, {config:{broadcast:{ack:true}}});
    this.channel = channel;
    channel
      .on('broadcast',{event:'state'}, ({payload})=>void this.receive('state',payload,generation))
      .on('broadcast',{event:'hello'}, ({payload})=>void this.receive('hello',payload,generation))
      .on('broadcast',{event:'shutdown'}, ({payload})=>void this.receive('shutdown',payload,generation))
      .subscribe(status=>{
        if (generation !== this.generation) return;
        this.connected.set(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          if (this.role === 'viewer') void this.hello();
          else void this.heartbeat();
        }
      });
    if (role === 'viewer') void this.hello();
  }
  private async receive(event: string, raw: unknown, generation: number): Promise<void> {
    if (generation !== this.generation || !this.key) return;
    const message = await openDisplayPacket(this.key,raw);
    if (!message || generation !== this.generation) return;
    if (event === 'hello' && message.type === 'hello' && this.role === 'host') {
      this.lastHelloAt = Date.now();
      this.viewerConnected.set(true);
      void this.heartbeat();
      return;
    }
    if (event === 'shutdown' && message.type === 'shutdown' && this.role === 'viewer') {
      this.packets$.next(message);
      this.leave();
      return;
    }
    if (event !== 'state' || message.type !== 'snapshot' || this.role !== 'viewer') return;
    if (message.snapshot.revision < this.lastIncomingRevision) return;
    // A long-lived cashier can stay idle for hours; heartbeats are authenticated
    // and may legitimately repeat that older snapshot for a newly paired device.
    if (message.snapshot.issuedAt > Date.now() + 300000) return;
    this.lastIncomingRevision = message.snapshot.revision;
    this.lastReceivedAt.set(Date.now());
    this.packets$.next(message);
  }
  private async send(message: DisplayPacket): Promise<void> {
    const generation = this.generation;
    const key = this.key;
    if (!key) return;
    const event = message.type === 'snapshot' ? 'state' : message.type;
    let payload: SealedPacket;
    try { payload = await sealDisplayPacket(key,message); }
    catch { return; }
    if (generation !== this.generation) return;
    try { this.local?.postMessage({event,payload}); } catch { /* Browser private mode. */ }
    try {
      if (this.connected() && this.channel)
        await this.channel.send({type:'broadcast',event,payload});
    } catch {
      this.connected.set(false);
    }
  }
  async hello(): Promise<void> {
    if (this.role === 'viewer') await this.send({type:'hello'});
  }
  async publish(snapshot: DisplaySnapshot): Promise<void> {
    if (!this.activeHost) return;
    this.outgoingRevision++;
    const latest: DisplaySnapshot = { ...snapshot, revision:this.outgoingRevision };
    this.lastSnapshot = latest;
    await this.send({type:'snapshot',snapshot:latest});
  }
  async heartbeat(): Promise<void> {
    if (!this.activeHost) return;
    if (this.lastHelloAt && Date.now()-this.lastHelloAt > 30000)
      this.viewerConnected.set(false);
    if (this.lastSnapshot) await this.send({type:'snapshot',snapshot:this.lastSnapshot});
  }
  async stopHost(): Promise<void> {
    if (this.activeHost) await this.send({type:'shutdown'});
    this.leave();
  }
  leave(): void {
    this.generation++;
    if (this.channel) void this.db.removeChannel(this.channel);
    this.channel = null;
    this.local?.close();
    this.local = null;
    this.key = null;
    this.secret = '';
    this.role = '';
    this.lastSnapshot = null;
    this.outgoingRevision = 0;
    this.lastIncomingRevision = -1;
    this.lastHelloAt = 0;
    this.connected.set(false);
    this.viewerConnected.set(false);
    this.lastReceivedAt.set(0);
  }
}