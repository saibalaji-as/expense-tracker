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
    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: this.type,
      data: this.data,
      options: this.options,
    });
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
