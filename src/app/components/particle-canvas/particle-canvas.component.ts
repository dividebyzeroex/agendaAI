import { Component, HostListener, AfterViewInit, OnDestroy, ElementRef, ViewChild, Inject, PLATFORM_ID, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-particle-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './particle-canvas.component.html',
  styleUrls: ['./particle-canvas.component.css']
})
export class ParticleCanvasComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('particleCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  @Input() hasWaitlist: boolean = false;
  @Input() hasNoShows: boolean = false;

  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationFrameId: number = 0;
  private mouse = { x: -1000, y: -1000 };
  
  private interactRect: DOMRect | null = null;
  private primaryBtnRect: DOMRect | null = null;
  private clickWaves: {x: number, y: number, radius: number}[] = [];
  
  private isMouseDown = false;
  private isBrowser = false;
  private isMobile = false;
  private isBatterySaver = false;
  private panicMode = false;
  private clickCount = 0;
  private clickTimer: any;

  private router = inject(Router);

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit() {
    if (this.isBrowser) {
      this.checkEnvironment();
      this.initCanvas();
      
      // Monitor visibility for battery saving
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['hasNoShows'] && this.hasNoShows) {
      this.triggerNoShowPanic();
    }
  }

  ngOnDestroy() {
    if (this.isBrowser) {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      window.removeEventListener('resize', this.resizeCanvas);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private checkEnvironment() {
    this.isMobile = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
    this.isBatterySaver = this.isMobile; // Mobile defaults to fewer updates
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.isBatterySaver = true;
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    } else {
      this.isBatterySaver = this.isMobile; 
      this.animate();
    }
  }

  private triggerNoShowPanic() {
    this.panicMode = true;
    setTimeout(() => this.panicMode = false, 5000);
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isBrowser) return;
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;

    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (el) {
      const interactable = el.closest('.bento-card, .btn-primary, .auth-btn');
      if (interactable) {
        this.interactRect = interactable.getBoundingClientRect();
      } else {
        this.interactRect = null;
      }
    } else {
      this.interactRect = null;
    }
  }

  @HostListener('window:mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    this.isMouseDown = true;
    
    // Panic on multiple clicks
    this.clickCount++;
    clearTimeout(this.clickTimer);
    if (this.clickCount > 3) {
      this.panicMode = true;
      setTimeout(() => this.panicMode = false, 3000);
      this.clickCount = 0;
    } else {
      this.clickTimer = setTimeout(() => this.clickCount = 0, 1000);
    }
  }

  @HostListener('window:mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    this.isMouseDown = false;
    this.clickWaves.push({ x: event.clientX, y: event.clientY, radius: 0 });
  }

  @HostListener('window:mouseout', [])
  onMouseOut() {
    this.mouse.x = -1000;
    this.mouse.y = -1000;
    this.interactRect = null;
  }

  private initCanvas() {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    
    this.resizeCanvas = this.resizeCanvas.bind(this);
    window.addEventListener('resize', this.resizeCanvas);
    this.resizeCanvas();
    
    this.createParticles();
    this.animate();
  }

  private resizeCanvas = () => {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.checkEnvironment();
  }

  private createParticles() {
    const amount = this.isMobile ? 100 : 400; // Less particles on mobile
    this.particles = [];
    for (let i = 0; i < amount; i++) {
      this.particles.push(new Particle(window.innerWidth, window.innerHeight, i, amount));
    }
  }

  private animate = () => {
    if (!this.ctx || (this.isBatterySaver && document.visibilityState === 'hidden')) return;
    
    // Slight trail effect
    this.ctx.fillStyle = 'rgba(248, 250, 252, 0.4)';
    this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    this.clickWaves.forEach(w => w.radius += 20);
    this.clickWaves = this.clickWaves.filter(w => w.radius < 1500);

    const btn = document.querySelector('.btn-primary');
    if (btn) this.primaryBtnRect = btn.getBoundingClientRect();

    const riverStones = Array.from(document.querySelectorAll('.bento-card')).map(el => el.getBoundingClientRect());

    // Update and Draw Particles
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].update(
        this.mouse, 
        this.particles, 
        this.interactRect, 
        this.isMouseDown,
        this.clickWaves,
        this.primaryBtnRect,
        riverStones,
        this.hasWaitlist,
        this.hasNoShows,
        this.panicMode
      );
      this.particles[i].draw(this.ctx);
    }

    // Connect close particles (only if not in battery saver or not panic)
    if (!this.isMobile && !this.panicMode) {
      this.ctx.lineWidth = 0.5;
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const p1 = this.particles[i];
          const p2 = this.particles[j];
          if (p1.z !== p2.z) continue;
          
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < 40) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = `rgba(148, 163, 184, ${(40 - dist) / 40 * 0.4})`;
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
          }
        }
      }
    }
    
    if (this.isBatterySaver) {
      setTimeout(() => {
        this.animationFrameId = requestAnimationFrame(this.animate);
      }, 1000 / 30); // Cap at 30fps for battery saver
    } else {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }
}

enum ParticleRole {
  EXPLORER,
  PROTECTOR,
  MESSENGER
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  role: ParticleRole;
  z: number;

  constructor(width: number, height: number, index: number, totalParticles: number) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    
    // Distribute roles
    const r = Math.random();
    if (r < 0.1) this.role = ParticleRole.MESSENGER;
    else if (r < 0.4) this.role = ParticleRole.PROTECTOR;
    else this.role = ParticleRole.EXPLORER;

    // Distribute depth
    const layerRand = Math.random();
    if (layerRand < 0.2) this.z = 3; 
    else if (layerRand < 0.6) this.z = 2; 
    else this.z = 1; 

    this.size = (Math.random() * 1.5 + 0.5) * this.z;
    this.color = `rgba(99, 102, 241, ${Math.random() * 0.4 + 0.2})`; // Base Indigo
  }

  update(
    mouse: {x: number, y: number}, 
    particles: Particle[], 
    interactRect: DOMRect | null, 
    isMouseDown: boolean,
    clickWaves: {x: number, y: number, radius: number}[],
    primaryBtnRect: DOMRect | null,
    riverStones: DOMRect[],
    hasWaitlist: boolean,
    hasNoShows: boolean,
    panicMode: boolean
  ) {
    let maxSpeed = 3;

    // 1. STATE OVERRIDES (Panic & Business Logic)
    if (panicMode || hasNoShows) {
      // Panic / NoShow alert: Move fast, turn red, erratic behavior
      maxSpeed = 8;
      this.color = `rgba(239, 68, 68, ${Math.random() * 0.6 + 0.4})`; // Red
      this.vx += (Math.random() - 0.5) * 2;
      this.vy += (Math.random() - 0.5) * 2;
    } else {
      this.color = `rgba(99, 102, 241, ${Math.random() * 0.4 + 0.2})`; // Indigo
    }

    // 2. WAITLIST BEHAVIOR (Flock around primary button)
    if (hasWaitlist && primaryBtnRect && !panicMode) {
      const cx = primaryBtnRect.left + primaryBtnRect.width / 2;
      const cy = primaryBtnRect.top + primaryBtnRect.height / 2;
      const dx = cx - this.x;
      const dy = cy - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist > 60) {
        this.vx += (dx / dist) * 0.8; 
        this.vy += (dy / dist) * 0.8;
      } else {
        // Orbit
        this.vx += -dy * 0.1;
        this.vy += dx * 0.1;
      }
      this.color = `rgba(16, 185, 129, ${Math.random() * 0.6 + 0.4})`; // Green to signify opportunity
    }

    // 3. WAVES REACTION (Click repulsion)
    clickWaves.forEach(wave => {
      const dx = this.x - wave.x;
      const dy = this.y - wave.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (Math.abs(dist - wave.radius) < 40) {
        const force = (40 - Math.abs(dist - wave.radius)) / 40;
        this.vx += (dx / dist) * force * 10.0; 
        this.vy += (dy / dist) * force * 10.0;
      }
    });

    // 4. MOUSE INTERACTION (Curiosity vs Repulsion)
    if (!panicMode && !hasWaitlist) {
      const mdx = mouse.x - this.x;
      const mdy = mouse.y - this.y;
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy);
      
      if (mdist < 100 && mdist > 0) {
        if (this.role === ParticleRole.EXPLORER) {
          // Explorers are curious, follow cursor gently
          this.vx += (mdx / mdist) * 0.2;
          this.vy += (mdy / mdist) * 0.2;
        } else {
          // Others move away
          const force = (100 - mdist) / 100;
          this.vx -= (mdx / mdist) * force * 0.5;
          this.vy -= (mdy / mdist) * force * 0.5;
        }
      }
    }

    // 5. ROLE BEHAVIORS (Boids & Avoidance)
    if (!panicMode) {
      if (this.role === ParticleRole.PROTECTOR) {
        // Protectors avoid cards and stay in gaps
        riverStones.forEach(rect => {
          const cx = rect.left + rect.width/2;
          const cy = rect.top + rect.height/2;
          const dx = this.x - cx;
          const dy = this.y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 0 && dist < (rect.width/2 + 50)) {
            this.vx += (dx / dist) * 1.5;
            this.vy += (dy / dist) * 1.5;
          }
        });
      }

      if (this.role === ParticleRole.MESSENGER) {
        maxSpeed = 6;
        // Messengers occasionally speed up randomly to simulate data transfer
        if (Math.random() < 0.01) {
          this.vx *= 2;
          this.vy *= 2;
        }
      }

      // Flock basics (Cohesion, Separation)
      let sepX = 0, sepY = 0;
      let count = 0;
      for (let i = 0; i < Math.min(particles.length, 50); i++) { // Sample subset for perf
        const other = particles[i];
        if (other === this) continue;
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dist = dx*dx + dy*dy; // avoid sqrt for perf
        if (dist < 400 && dist > 0) { // 20px radius
          sepX += dx / dist;
          sepY += dy / dist;
          count++;
        }
      }
      if (count > 0) {
        this.vx += sepX * 1.5;
        this.vy += sepY * 1.5;
      }
    }

    // 6. KINEMATICS & BORDERS
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    const margin = 20;
    const turnFactor = 0.5;
    if (this.x < margin) this.vx += turnFactor;
    if (this.x > window.innerWidth - margin) this.vx -= turnFactor;
    if (this.y < margin) this.vy += turnFactor;
    if (this.y > window.innerHeight - margin) this.vy -= turnFactor;

    this.x += this.vx;
    this.y += this.vy;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}
