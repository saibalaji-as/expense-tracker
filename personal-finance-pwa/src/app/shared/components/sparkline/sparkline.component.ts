import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';

export interface SparklineDataPoint {
  date: string;
  value: number;
}

@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sparkline-container" [style.width]="width" [style.height]="height">
      <canvas #canvas></canvas>
    </div>
  `,
  styles: [`
    .sparkline-container {
      position: relative;
      display: inline-block;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
})
export class SparklineComponent implements OnChanges, AfterViewInit {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() data: SparklineDataPoint[] = [];
  @Input() width = '100px';
  @Input() height = '32px';
  @Input() lineColor = '';
  @Input() fillColor = '';
  @Input() strokeWidth = 2;
  @Input() showTrend = true; // Show trend indicator color

  private readonly dataSignal = signal<SparklineDataPoint[]>([]);
  
  private readonly trend = computed(() => {
    const data = this.dataSignal();
    if (data.length < 2) return 'stable';
    
    const firstValue = data[0].value;
    const lastValue = data[data.length - 1].value;
    
    if (firstValue === 0) return lastValue > 0 ? 'up' : 'stable';
    
    const change = ((lastValue - firstValue) / firstValue) * 100;
    
    if (change > 5) return 'up';
    if (change < -5) return 'down';
    return 'stable';
  });

  ngAfterViewInit(): void {
    this.draw();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.dataSignal.set(this.data);
      if (this.canvasRef) {
        this.draw();
      }
    }
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.data || this.data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const root = document.documentElement;
    const primaryColor = getComputedStyle(root).getPropertyValue('--primary').trim() || 'oklch(0.55 0.22 280)';
    const destructiveColor = getComputedStyle(root).getPropertyValue('--destructive').trim() || 'oklch(0.62 0.23 25)';
    const successColor = getComputedStyle(root).getPropertyValue('--success').trim() || 'oklch(0.65 0.17 155)';
    const mutedColor = getComputedStyle(root).getPropertyValue('--muted-foreground').trim() || 'oklch(0.50 0.03 260)';
    // Determine color based on trend if showTrend is enabled
    let color = this.lineColor || primaryColor;
    let fillColor = this.fillColor || `color-mix(in oklab, ${primaryColor} 15%, transparent)`;
    
    if (this.showTrend) {
      const trendValue = this.trend();
      if (trendValue === 'up') {
        color = destructiveColor;
        fillColor = `color-mix(in oklab, ${destructiveColor} 10%, transparent)`;
      } else if (trendValue === 'down') {
        color = successColor;
        fillColor = `color-mix(in oklab, ${successColor} 10%, transparent)`;
      } else {
        color = mutedColor;
        fillColor = `color-mix(in oklab, ${mutedColor} 10%, transparent)`;
      }
    }

    // Find min and max values for scaling
    const values = this.data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1; // Avoid division by zero

    // Calculate points
    const padding = 2;
    const usableWidth = width - padding * 2;
    const usableHeight = height - padding * 2;
    const stepX = usableWidth / (this.data.length - 1 || 1);

    const points: { x: number; y: number }[] = this.data.map((d, i) => {
      const x = padding + i * stepX;
      const normalizedValue = (d.value - minValue) / valueRange;
      const y = padding + usableHeight - normalizedValue * usableHeight;
      return { x, y };
    });

    // Draw filled area
    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, height);
      ctx.lineTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      
      ctx.lineTo(points[points.length - 1].x, height);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    // Draw line
    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      
      ctx.strokeStyle = color;
      ctx.lineWidth = this.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
}
