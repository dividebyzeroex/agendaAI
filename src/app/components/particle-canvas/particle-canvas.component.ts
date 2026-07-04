import { Component, HostListener, AfterViewInit, OnDestroy, ElementRef, ViewChild, Inject, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-particle-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './particle-canvas.component.html',
  styleUrls: ['./particle-canvas.component.css']
})
export class ParticleCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('particleCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationFrameId: number = 0;
  private mouse = { x: -1000, y: -1000 };

  private interactRect: DOMRect | null = null;
  private selectionRect: DOMRect | null = null;
  private clickWaves: {x: number, y: number, radius: number}[] = [];
  private lastScrollY = 0;
  private scrollVelocity = 0;
  private idleTimer: any;
  private isIdle = false;
  private superIdleTimer: any;
  private isSuperIdle = false;
  private isMouseDown = false;
  private isBrowser = false;

  private router = inject(Router);
  public isSoftMode = false;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    
    // Listen to route changes to soften particles in logged area
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.isSoftMode = event.urlAfterRedirects.includes('/admin');
      }
    });
  }

  ngAfterViewInit() {
    if (this.isBrowser) {
      this.initCanvas();
    }
  }

  ngOnDestroy() {
    if (this.isBrowser) {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      window.removeEventListener('resize', this.resizeCanvas);
      clearTimeout(this.idleTimer);
      clearTimeout(this.superIdleTimer);
    }
  }

  private resetIdleTimer() {
    if (!this.isBrowser) return;
    this.isIdle = false;
    this.isSuperIdle = false;
    clearTimeout(this.idleTimer);
    clearTimeout(this.superIdleTimer);
    this.idleTimer = setTimeout(() => {
      this.isIdle = true;
    }, 4000);
    this.superIdleTimer = setTimeout(() => {
      this.isSuperIdle = true;
    }, 10000);
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isBrowser) return;
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
    this.resetIdleTimer();

    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (el) {
      const interactable = el.closest('.btn-primary, .btn-secondary, .niche-card, .pricing-card, .bento-card, .auth-btn');
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
    this.resetIdleTimer();
  }

  @HostListener('window:mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    this.isMouseDown = false;
    this.clickWaves.push({ x: event.clientX, y: event.clientY, radius: 0 });
    this.resetIdleTimer();
  }

  @HostListener('document:selectionchange')
  onSelectionChange() {
    if (!this.isBrowser) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      this.selectionRect = sel.getRangeAt(0).getBoundingClientRect();
    } else {
      this.selectionRect = null;
    }
    this.resetIdleTimer();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.isBrowser) return;
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const rect = activeEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      this.clickWaves.push({ x: cx, y: cy, radius: 0 });
    }
    this.resetIdleTimer();
  }

  @HostListener('window:mouseout', [])
  onMouseOut() {
    this.mouse.x = -1000;
    this.mouse.y = -1000;
    this.interactRect = null;
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (!this.isBrowser) return;
    this.resetIdleTimer();
    
    const currentScrollY = window.scrollY;
    this.scrollVelocity = currentScrollY - this.lastScrollY;
    this.lastScrollY = currentScrollY;
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
    this.resetIdleTimer();
  }

  private resizeCanvas = () => {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  private createParticles() {
    const amount = window.innerWidth < 768 ? 200 : 700;
    this.particles = [];
    for (let i = 0; i < amount; i++) {
      this.particles.push(new Particle(window.innerWidth, window.innerHeight, i, amount));
    }
  }

  private animate = () => {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    this.scrollVelocity *= 0.92;
    if (Math.abs(this.scrollVelocity) < 0.1) this.scrollVelocity = 0;

    this.clickWaves.forEach(w => w.radius += 20);
    this.clickWaves = this.clickWaves.filter(w => w.radius < 1500);

    let primaryBtnRect: DOMRect | null = null;
    if (this.isIdle) {
      const btn = document.querySelector('.btn-primary, .auth-btn');
      if (btn) primaryBtnRect = btn.getBoundingClientRect();
    }

    const riverStones = Array.from(document.querySelectorAll('.hero-title, .bento-card, .niche-card, .pricing-card, .auth-card')).map(el => el.getBoundingClientRect());

    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].update(
        this.mouse, 
        this.particles, 
        this.interactRect, 
        this.scrollVelocity, 
        this.isIdle,
        this.isSuperIdle,
        this.isMouseDown,
        this.clickWaves,
        this.selectionRect,
        primaryBtnRect,
        riverStones
      );
      this.particles[i].draw(this.ctx);
    }

    if (!this.isSuperIdle) {
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
    
    this.animationFrameId = requestAnimationFrame(this.animate);
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  baseVx: number;
  baseVy: number;
  phase: number;
  isDeserter: boolean;
  z: number;
  targetT: number;

  constructor(width: number, height: number, index: number, totalParticles: number) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.baseVx = (Math.random() - 0.5) * 2.0;
    this.baseVy = (Math.random() - 0.5) * 2.0;
    this.vx = this.baseVx;
    this.vy = this.baseVy;
    
    const layerRand = Math.random();
    if (layerRand < 0.15) this.z = 3; 
    else if (layerRand < 0.5) this.z = 2; 
    else this.z = 1; 

    this.size = (Math.random() * 1.5 + 0.5) * this.z;
    this.color = `rgba(148, 163, 184, ${Math.random() * 0.4 + 0.2})`; 
    this.phase = Math.random() * Math.PI * 2;
    this.isDeserter = Math.random() < 0.05; 
    this.targetT = (index / totalParticles) * Math.PI * 2;
  }

  update(
    mouse: {x: number, y: number}, 
    particles: Particle[], 
    interactRect: DOMRect | null, 
    scrollVelocity: number, 
    isIdle: boolean,
    isSuperIdle: boolean,
    isMouseDown: boolean,
    clickWaves: {x: number, y: number, radius: number}[],
    selectionRect: DOMRect | null,
    primaryBtnRect: DOMRect | null,
    riverStones: DOMRect[]
  ) {
    let separation = { x: 0, y: 0 };
    let alignment = { x: 0, y: 0 };
    let cohesion = { x: 0, y: 0 };
    let localCount = 0;

    const perceptionRadius = 60;
    const separationRadius = 25;

    this.vy -= scrollVelocity * 0.03 * this.z;

    if (isMouseDown) {
      const mdx = mouse.x - this.x;
      const mdy = mouse.y - this.y;
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy);
      if (mdist > 10) {
        this.vx += (mdx / mdist) * 2.0;
        this.vy += (mdy / mdist) * 2.0;
        this.vx += (-mdy / mdist) * 1.5;
        this.vy += (mdx / mdist) * 1.5;
      }
      this.applyVelocityAndBorders(15); 
      return; 
    }

    if (isSuperIdle) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const scale = Math.min(window.innerWidth, window.innerHeight) * 0.35;
      
      this.targetT += 0.01; 
      const t = this.targetT;
      const targetX = cx + (scale * Math.cos(t)) / (1 + Math.pow(Math.sin(t), 2));
      const targetY = cy + (scale * Math.cos(t) * Math.sin(t)) / (1 + Math.pow(Math.sin(t), 2));
      
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      this.vx += dx * 0.01;
      this.vy += dy * 0.01;
      
      this.vx *= 0.95; 
      this.vy *= 0.95;
      
      this.applyVelocityAndBorders(10);
      return;
    }

    clickWaves.forEach(wave => {
      const dx = this.x - wave.x;
      const dy = this.y - wave.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (Math.abs(dist - wave.radius) < 40) {
        const force = (40 - Math.abs(dist - wave.radius)) / 40;
        this.vx += (dx / dist) * force * 5.0; 
        this.vy += (dy / dist) * force * 5.0;
      }
    });

    riverStones.forEach(rect => {
      const margin = 20; 
      if (this.x > rect.left - margin && this.x < rect.right + margin && 
          this.y > rect.top - margin && this.y < rect.bottom + margin) {
        
        const cx = rect.left + rect.width/2;
        const cy = rect.top + rect.height/2;
        const dx = this.x - cx;
        const dy = this.y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0) {
          this.vx += (dx / dist) * 1.5;
          this.vy += (dy / dist) * 1.5;
        }
      }
    });

    if (selectionRect) {
      const targetY = selectionRect.bottom + 5;
      if (this.x >= selectionRect.left && this.x <= selectionRect.right) {
        const dy = this.y - targetY;
        this.vy -= dy * 0.1; 
        this.vx *= 0.9; 
      }
    }

    if (isIdle && this.isDeserter && primaryBtnRect) {
      const cx = primaryBtnRect.left + primaryBtnRect.width / 2;
      const cy = primaryBtnRect.top + primaryBtnRect.height / 2;
      const dx = cx - this.x;
      const dy = cy - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist > 50) {
        this.vx += (dx / dist) * 0.5; 
        this.vy += (dy / dist) * 0.5;
      } else {
        this.vx += -dy * 0.05;
        this.vy += dx * 0.05;
      }
      
      this.applyVelocityAndBorders(5);
      return; 
    }

    for (let i = 0; i < particles.length; i++) {
      const other = particles[i];
      if (other === this || other.isDeserter) continue;
      
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < perceptionRadius) {
        alignment.x += other.vx;
        alignment.y += other.vy;
        
        cohesion.x += other.x;
        cohesion.y += other.y;
        
        if (dist < separationRadius && dist > 0) {
          separation.x += dx / dist;
          separation.y += dy / dist;
        }
        
        localCount++;
      }
    }

    if (localCount > 0) {
      alignment.x = (alignment.x / localCount) * 0.05;
      alignment.y = (alignment.y / localCount) * 0.05;

      cohesion.x = ((cohesion.x / localCount) - this.x) * 0.01;
      cohesion.y = ((cohesion.y / localCount) - this.y) * 0.01;

      this.vx += alignment.x + cohesion.x + separation.x * 0.15;
      this.vy += alignment.y + cohesion.y + separation.y * 0.15;
    }

    if (interactRect) {
      const cx = interactRect.left + interactRect.width / 2;
      const cy = interactRect.top + interactRect.height / 2;
      const rX = interactRect.width / 2 + 15; 
      const rY = interactRect.height / 2 + 15;
      
      const dx = this.x - cx;
      const dy = this.y - cy;
      
      const distE = Math.sqrt((dx*dx)/(rX*rX) + (dy*dy)/(rY*rY));
      
      if (distE > 0) {
        const tangentX = -dy / distE;
        const tangentY = dx / distE;
        this.vx += tangentX * 0.25;
        this.vy += tangentY * 0.25;

        const force = (distE - 1) * 1.5; 
        this.vx -= (dx / distE) * force * 0.05;
        this.vy -= (dy / distE) * force * 0.05;
      }

      if (distE < 1.5) {
        this.color = `rgba(66, 133, 244, ${Math.random() * 0.6 + 0.4})`; 
      } else {
        this.color = `rgba(148, 163, 184, ${Math.random() * 0.6 + 0.3})`; 
      }
    } else if (isIdle && !isSuperIdle) {
      const mdx = this.x - mouse.x;
      const mdy = this.y - mouse.y;
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy);
      
      const time = Date.now() / 400;
      const pulseRadius = 60 + Math.sin(time) * 20; 

      if (mdist > 0) {
        const tangentX = -mdy / mdist;
        const tangentY = mdx / mdist;
        this.vx += tangentX * 0.8;
        this.vy += tangentY * 0.8;

        const force = (mdist - pulseRadius) * 0.1;
        this.vx -= (mdx / mdist) * force;
        this.vy -= (mdy / mdist) * force;
      }
    } else {
      const mdx = this.x - mouse.x;
      const mdy = this.y - mouse.y;
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy);
      
      if (mdist < 400 && mdist > 80) { 
        const mforce = (400 - mdist) / 320; 
        this.vx -= (mdx / mdist) * mforce * 0.15;
        this.vy -= (mdy / mdist) * mforce * 0.15;
      }
      else if (mdist <= 80 && mdist > 0) {
        const mforce = (80 - mdist) / 80;
        this.vx += (mdx / mdist) * mforce * 0.5;
        this.vy += (mdy / mdist) * mforce * 0.5;
      }
    }

    this.vx += this.baseVx * 0.02;
    this.vy += this.baseVy * 0.02;

    if (!interactRect) {
      this.color = `rgba(148, 163, 184, ${Math.random() * 0.6 + 0.3})`;
    }

    this.applyVelocityAndBorders(5);
  }

  private applyVelocityAndBorders(maxSpeed: number = 5) {
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    const margin = 100;
    const turnFactor = 0.2;
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
    
    let alpha = 0.3 + Math.sin(this.phase + Date.now() / 400) * 0.3; 
    
    if (this.z === 1) alpha *= 0.5;
    else if (this.z === 3) alpha = Math.min(1.0, alpha + 0.3);

    ctx.fillStyle = this.color;
    ctx.globalAlpha = alpha > 0 ? alpha : 0;
    
    if (this.z === 3) {
      ctx.shadowBlur = 4;
      ctx.shadowColor = this.color;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0; 
  }
}
