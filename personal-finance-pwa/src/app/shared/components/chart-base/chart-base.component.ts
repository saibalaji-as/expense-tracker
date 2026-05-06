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
} from '@angular/core';
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

  private chart?: Chart;

  ngAfterViewInit(): void {
    // Merge default options with provided options
    const mergedOptions = this.getMergedOptions();
    
    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: this.type,
      data: this.data,
      options: mergedOptions,
    });
  }

  private getMergedOptions(): ChartOptions {
    // Default elegant options for line charts
    const defaultLineOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 12,
            weight: 600,
          },
          bodyFont: {
            size: 14,
            weight: 500,
          },
          displayColors: false,
        },
      },
      scales: {
        x: {
          border: {
            display: false,
          },
          grid: {
            display: false,
          },
          ticks: {
            color: 'rgba(148, 163, 184, 0.6)', // Muted text color
            font: {
              size: 11,
              weight: 500,
            },
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 20,
          },
        },
        y: {
          border: {
            display: false,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)', // Very subtle grid lines
            lineWidth: 1,
          },
          ticks: {
            color: 'rgba(148, 163, 184, 0.6)', // Muted text color
            font: {
              size: 11,
              weight: 500,
            },
            padding: 8,
            callback: function(value) {
              // Format large numbers with K suffix
              if (typeof value === 'number') {
                if (value >= 1000) {
                  return (value / 1000).toFixed(1) + 'K';
                }
                return value.toString();
              }
              return value;
            },
          },
          beginAtZero: true,
        },
      },
    };

    // Default options for doughnut charts
    const defaultDoughnutOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 12,
            weight: 600,
          },
          bodyFont: {
            size: 14,
            weight: 500,
          },
        },
      },
    };

    // Default options for bar charts
    const defaultBarOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 12,
            weight: 600,
          },
          bodyFont: {
            size: 14,
            weight: 500,
          },
        },
      },
      scales: {
        x: {
          border: {
            display: false,
          },
          grid: {
            display: false,
          },
          ticks: {
            color: 'rgba(148, 163, 184, 0.6)',
            font: {
              size: 11,
              weight: 500,
            },
          },
        },
        y: {
          border: {
            display: false,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)',
          },
          ticks: {
            color: 'rgba(148, 163, 184, 0.6)',
            font: {
              size: 11,
              weight: 500,
            },
            callback: function(value) {
              if (typeof value === 'number') {
                if (value >= 1000) {
                  return (value / 1000).toFixed(1) + 'K';
                }
                return value.toString();
              }
              return value;
            },
          },
          beginAtZero: true,
        },
      },
    };

    // Select default options based on chart type
    let defaultOptions: ChartOptions = {};
    if (this.type === 'line') {
      defaultOptions = defaultLineOptions;
    } else if (this.type === 'doughnut' || this.type === 'pie') {
      defaultOptions = defaultDoughnutOptions;
    } else if (this.type === 'bar') {
      defaultOptions = defaultBarOptions;
    }

    // Deep merge provided options with defaults (provided options take precedence)
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
    this.chart?.destroy();
  }
}
