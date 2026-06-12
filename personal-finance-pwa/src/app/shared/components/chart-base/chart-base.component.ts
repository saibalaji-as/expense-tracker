import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Chart, ChartData, ChartOptions, ChartType } from 'chart.js/auto';

@Component({
  selector: 'app-chart-base',
  standalone: true,
  template: `
    <canvas
      #canvas
      style="max-height: 100%; width: 100%;"
      [attr.aria-label]="type + ' chart'"
      role="img"
    ></canvas>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartBaseComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() type: ChartType = 'bar';
  @Input() data: ChartData = { datasets: [] };
  @Input() options: ChartOptions = {};

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly document = inject(DOCUMENT);
  private chart?: Chart;
  private observer?: MutationObserver;

  ngAfterViewInit(): void {
    this.createChart();
    this.watchTheme();
  }

  private createChart(): void {
    const mergedOptions = this.getMergedOptions();
    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: this.type,
      data: this.data,
      options: mergedOptions,
    });
  }

  private watchTheme(): void {
    const root = this.document.documentElement;
    this.observer = new MutationObserver(() => {
      if (!this.chart) return;
      this.chart.options = this.getMergedOptions();
      this.chart.update('none');
    });
    this.observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-palette'],
    });
  }

  private cssVar(name: string): string {
    return getComputedStyle(this.document.documentElement).getPropertyValue(name).trim();
  }

  private getMergedOptions(): ChartOptions {
    const tickColor = this.cssVar('--muted-foreground') || 'rgba(148, 163, 184, 0.6)';
    const gridColor = this.cssVar('--border') || 'rgba(148, 163, 184, 0.08)';
    const tooltipBg = this.cssVar('--popover') || 'rgba(0, 0, 0, 0.8)';
    const tooltipFg = this.cssVar('--popover-foreground') || '#fff';

    const makeTickOptions = () => ({
      color: tickColor,
      font: { size: 11, weight: 500 as const },
    });

    const numberFormat = (value: number | string): string => {
      if (typeof value === 'number') {
        if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
        return value.toString();
      }
      return value;
    };

    const tooltipDefaults = {
      backgroundColor: tooltipBg,
      titleColor: tooltipFg,
      bodyColor: tooltipFg,
      padding: 12,
      cornerRadius: 8,
      titleFont: { size: 12, weight: 600 as const },
      bodyFont: { size: 14, weight: 500 as const },
    };

    const defaultLineOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipDefaults, displayColors: false },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            ...makeTickOptions(),
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 20,
          },
        },
        y: {
          border: { display: false },
          grid: { color: gridColor, lineWidth: 1 },
          ticks: {
            ...makeTickOptions(),
            padding: 8,
            callback: numberFormat,
          },
          beginAtZero: true,
        },
      },
    };

    const defaultDoughnutOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipDefaults },
      },
    };

    const defaultBarOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipDefaults },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { ...makeTickOptions() },
        },
        y: {
          border: { display: false },
          grid: { color: gridColor },
          ticks: {
            ...makeTickOptions(),
            callback: numberFormat,
          },
          beginAtZero: true,
        },
      },
    };

    let defaultOptions: ChartOptions = {};
    if (this.type === 'line') {
      defaultOptions = defaultLineOptions;
    } else if (this.type === 'doughnut' || this.type === 'pie') {
      defaultOptions = defaultDoughnutOptions;
    } else if (this.type === 'bar') {
      defaultOptions = defaultBarOptions;
    }

    return this.deepMerge(defaultOptions, this.options);
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.chart) return;

    if (changes['data']) {
      this.chart.data = this.data;
      this.chart.update();
    }

    if (changes['options']) {
      this.chart.options = this.options;
      this.chart.update();
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.chart?.destroy();
  }
}
