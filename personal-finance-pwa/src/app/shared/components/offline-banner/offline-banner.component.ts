import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SyncService } from '../../../core/services/sync.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  template: `
    @if (!syncService.isOnline()) {
      <div class="bg-yellow-500 text-white text-center py-2 px-4 text-sm" role="status" aria-live="polite">
        You are offline — entries will sync when reconnected
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineBannerComponent {
  readonly syncService = inject(SyncService);
}
