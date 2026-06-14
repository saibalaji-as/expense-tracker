import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Mic,
  MapPin,
  Clock,
  Save,
  ArrowLeft,
  Loader,
  AlertTriangle,
  Lock,
  Check,
} from 'lucide-angular';
import { ReminderService, ReminderLocation } from '../../core/services/reminder.service';
import { GoogleMapsLoaderService, GMap, GMarker, GCircle } from '../../core/services/google-maps-loader.service';
import { AiVoiceReminderService } from '../../core/services/ai-voice-reminder.service';
import { AuthService } from '../../core/services/auth.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { I18nService } from '../../core/services/i18n.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TranslatePipe } from '../../shared/pipes';

interface GeocodingResult {
  name: string;
  lat: number;
  lng: number;
  displayName: string;
}

@Component({
  selector: 'app-reminder-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Mic, MapPin, Clock, Save, ArrowLeft, Loader, AlertTriangle, Lock, Check }),
    },
  ],
  template: `
    <div class="mx-auto max-w-lg space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <button (click)="goBack()" class="rounded-xl p-2 text-muted-foreground hover:bg-accent">
          <lucide-icon name="arrow-left" class="h-5 w-5" />
        </button>
        <h1 class="text-xl font-bold tracking-tight">
          {{ (isEditMode() ? 'reminders.form.editTitle' : 'reminders.form.newTitle') | translate }}
        </h1>
      </div>

      <!-- Voice input -->
      <div class="glass-card rounded-xl p-4 space-y-3">
        <p class="text-sm font-semibold">{{ 'reminders.form.voice.title' | translate }}</p>
        <p class="text-xs text-muted-foreground">{{ 'reminders.form.voice.hint' | translate }}</p>
        <button
          (click)="isRecording() ? stopVoice() : startVoice()"
          [disabled]="isParsing()"
          class="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          @if (isParsing()) {
            <lucide-icon name="loader" class="h-4 w-4 animate-spin" />
            {{ 'reminders.form.voice.parsing' | translate }}
          } @else {
            <lucide-icon name="mic" [class]="isRecording() ? 'h-4 w-4 text-destructive animate-pulse' : 'h-4 w-4'" />
            {{ (isRecording() ? 'reminders.form.voice.stop' : 'reminders.form.voice.start') | translate }}
          }
        </button>

        @if (clarification()) {
          <div class="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
            <p class="text-xs font-medium text-amber-600 dark:text-amber-400">
              <lucide-icon name="alert-triangle" class="inline h-3.5 w-3.5 mr-1" />
              {{ clarification() }}
            </p>
          </div>
        }
      </div>

      <!-- Form -->
      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-5">

        <!-- Title -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ 'reminders.form.title' | translate }}</label>
          <input
            formControlName="title"
            type="text"
            [placeholder]="'reminders.form.titlePlaceholder' | translate"
            class="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <!-- Type toggle -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ 'reminders.form.type' | translate }}</label>
          <div class="flex rounded-xl bg-muted p-1 gap-1">
            <button
              type="button"
              (click)="setType('datetime')"
              [class]="form.get('type')?.value === 'datetime'
                ? 'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium bg-background text-foreground shadow-sm transition-all'
                : 'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-all'"
            >
              <lucide-icon name="clock" class="h-4 w-4" />
              {{ 'reminders.form.type.datetime' | translate }}
            </button>
            <button
              type="button"
              (click)="setType('location')"
              [disabled]="!isPro()"
              [class]="form.get('type')?.value === 'location'
                ? 'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium bg-background text-foreground shadow-sm transition-all'
                : 'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-all disabled:opacity-50'"
            >
              <lucide-icon name="map-pin" class="h-4 w-4" />
              {{ 'reminders.form.type.location' | translate }}
              @if (!isPro()) {
                <lucide-icon name="lock" class="h-3 w-3 text-muted-foreground" />
              }
            </button>
          </div>
          @if (!isPro() && form.get('type')?.value === 'location') {
            <p class="text-xs text-muted-foreground">{{ 'reminders.form.locationProHint' | translate }}</p>
          }
        </div>

        <!-- Date/time picker -->
        @if (form.get('type')?.value === 'datetime') {
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ 'reminders.form.remindAt' | translate }}</label>
            <input
              formControlName="remindAt"
              type="datetime-local"
              [min]="minDateTime()"
              class="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        }

        <!-- Location picker -->
        @if (form.get('type')?.value === 'location' && isPro()) {
          <div class="space-y-3">
            <div class="space-y-1.5">
              <label class="text-sm font-medium">{{ 'reminders.form.locationSearch' | translate }}</label>
              <div class="flex gap-2">
                <input
                  [value]="locationQuery()"
                  (input)="locationQuery.set($any($event.target).value)"
                  (keydown.enter)="$event.preventDefault(); searchLocation()"
                  type="text"
                  [placeholder]="'reminders.form.locationPlaceholder' | translate"
                  class="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  (click)="searchLocation()"
                  [disabled]="isSearching()"
                  class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  {{ 'reminders.form.locationSearchBtn' | translate }}
                </button>
              </div>
            </div>

            <!-- Search results -->
            @if (geocodeResults().length > 0) {
              <div class="rounded-xl border border-border overflow-hidden divide-y divide-border">
                @for (result of geocodeResults(); track result.lat + result.lng) {
                  <button
                    type="button"
                    (click)="confirmLocation(result)"
                    class="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  >
                    <lucide-icon name="map-pin" class="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span class="text-sm truncate">{{ result.displayName }}</span>
                  </button>
                }
              </div>
            }

            <!-- Map picker -->
            @if (mapsAvailable()) {
              <div class="space-y-1.5">
                <div #mapHost class="h-60 w-full rounded-xl border border-border overflow-hidden"></div>
                <p class="text-xs text-muted-foreground">{{ 'reminders.form.mapHint' | translate }}</p>
              </div>
            }

            <!-- Confirmed location -->
            @if (confirmedLocation()) {
              <div class="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2">
                <lucide-icon name="check" class="h-4 w-4 shrink-0 text-green-600" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-green-700 dark:text-green-400 truncate">{{ confirmedLocation()!.name }}</p>
                  <p class="text-xs text-green-600/70 dark:text-green-500/70">{{ confirmedLocation()!.lat.toFixed(4) }}, {{ confirmedLocation()!.lng.toFixed(4) }}</p>
                </div>
              </div>
            }

            <!-- Radius -->
            @if (confirmedLocation()) {
              <div class="space-y-1.5">
                <label class="text-sm font-medium flex justify-between">
                  <span>{{ 'reminders.form.radius' | translate }}</span>
                  <span class="text-muted-foreground">{{ radiusKm() }} km</span>
                </label>
                <input
                  type="range"
                  min="1" max="10" step="1"
                  [value]="radiusKm()"
                  (input)="radiusKm.set(+$any($event.target).value)"
                  class="w-full accent-primary"
                />
              </div>
            }
          </div>
        }

        <!-- Save button -->
        <button
          type="submit"
          [disabled]="isSaving() || form.invalid || !canSave()"
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          @if (isSaving()) {
            <lucide-icon name="loader" class="h-4 w-4 animate-spin" />
          } @else {
            <lucide-icon name="save" class="h-4 w-4" />
          }
          {{ 'reminders.form.save' | translate }}
        </button>

      </form>
    </div>
  `,
})
export class ReminderFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reminderService = inject(ReminderService);
  private readonly aiVoiceReminder = inject(AiVoiceReminderService);
  private readonly authService = inject(AuthService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly i18n = inject(I18nService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);

  readonly isEditMode = signal(false);
  readonly editId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isRecording = signal(false);
  readonly isParsing = signal(false);
  readonly isSearching = signal(false);
  readonly clarification = signal<string | null>(null);
  readonly locationQuery = signal('');
  readonly geocodeResults = signal<GeocodingResult[]>([]);
  readonly confirmedLocation = signal<GeocodingResult | null>(null);
  readonly radiusKm = signal(5);
  readonly mapsAvailable = signal(this.mapsLoader.isConfigured());

  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('mapHost');
  #map: GMap | null = null;
  #marker: GMarker | null = null;
  #circle: GCircle | null = null;
  #mapInitStarted = false;

  constructor() {
    // Initialize (or tear down) the map when its host element enters/leaves the DOM.
    effect(() => {
      const host = this.mapHost();
      if (!host) {
        this.#map = null;
        this.#marker = null;
        this.#circle = null;
        this.#mapInitStarted = false;
        return;
      }
      if (!this.#mapInitStarted) {
        this.#mapInitStarted = true;
        void this.#initMap(host.nativeElement);
      }
    });

    // Keep pin + radius circle in sync with the confirmed location.
    effect(() => {
      const loc = this.confirmedLocation();
      const radius = this.radiusKm();
      this.#syncMapPin(loc, radius);
    });
  }

  readonly isPro = computed(() => this.subscriptionService.isPro());

  readonly minDateTime = computed(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    type: ['datetime' as 'datetime' | 'location'],
    remindAt: [''],
  });

  // Mirror reactive-form state into a signal so computed()s recompute on input.
  // (Reactive form `.value` is NOT a signal — reading it inside computed() does
  // not register a dependency, so canSave() would stay stuck at its first value.)
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  readonly canSave = computed(() => {
    const v = this.formValue();
    if (this.formStatus() === 'INVALID') return false;
    if (v.type === 'datetime') return !!v.remindAt;
    if (v.type === 'location') return this.confirmedLocation() !== null;
    return false;
  });

  private recognition: any = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEditMode.set(true);
      this.editId.set(id);
      this.#prefillFromExisting(id);
    }
  }

  #prefillFromExisting(id: string): void {
    const reminder = this.reminderService.reminders().find((r) => r.id === id);
    if (!reminder) return;

    this.form.patchValue({ title: reminder.title, type: reminder.type });

    if (reminder.type === 'datetime' && reminder.remindAt) {
      const local = new Date(reminder.remindAt);
      local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
      this.form.patchValue({ remindAt: local.toISOString().slice(0, 16) });
    }

    if (reminder.type === 'location' && reminder.location) {
      this.confirmedLocation.set({
        name: reminder.location.name,
        lat: reminder.location.lat,
        lng: reminder.location.lng,
        displayName: reminder.location.name,
      });
      this.radiusKm.set(reminder.location.radiusKm);
      this.locationQuery.set(reminder.location.name);
    }
  }

  setType(type: 'datetime' | 'location'): void {
    if (type === 'location' && !this.isPro()) {
      this.feedback.info(
        this.i18n.t('reminders.form.locationProHint'),
        this.i18n.t('subscribe.title')
      );
      return;
    }
    this.form.patchValue({ type });
    this.geocodeResults.set([]);
  }

  // ─── Voice ───────────────────────────────────────────────────────────────

  startVoice(): void {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.feedback.warning(this.i18n.t('daily.voiceUnsupportedTitle'), this.i18n.t('daily.voice.unsupportedBrowser'));
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = this.i18n.speechRecognitionLang();
    this.recognition.onstart = () => this.isRecording.set(true);
    this.recognition.onend = () => this.isRecording.set(false);
    this.recognition.onerror = () => this.isRecording.set(false);
    this.recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript ?? '').trim();
      if (transcript) void this.applyVoiceTranscript(transcript);
    };
    this.recognition.start();
  }

  stopVoice(): void {
    this.recognition?.stop();
  }

  private async applyVoiceTranscript(transcript: string): Promise<void> {
    this.isParsing.set(true);
    this.clarification.set(null);
    try {
      const attempt = await this.aiVoiceReminder.parse(transcript);

      if (!attempt.reminder) {
        this.feedback.info(this.i18n.t('reminders.form.voice.fallback'), attempt.fallbackReason ?? '');
        this.form.patchValue({ title: transcript });
        return;
      }

      const r = attempt.reminder;

      if (r.ambiguous) {
        this.clarification.set(r.clarification ?? this.i18n.t('reminders.form.voice.ambiguous'));
        this.form.patchValue({ title: r.title || transcript });
        return;
      }

      this.form.patchValue({ title: r.title });

      if (r.type === 'location') {
        if (!this.isPro()) {
          this.feedback.info(this.i18n.t('reminders.form.locationProHint'));
          this.form.patchValue({ type: 'datetime' });
        } else {
          this.form.patchValue({ type: 'location' });
          this.locationQuery.set(r.locationName ?? '');
          if (r.locationName) await this.searchLocation();
        }
        return;
      }

      // datetime
      this.form.patchValue({ type: 'datetime' });
      if (r.remindAt) {
        const parsed = new Date(r.remindAt);
        if (!isNaN(parsed.getTime())) {
          const local = new Date(parsed);
          local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
          this.form.patchValue({ remindAt: local.toISOString().slice(0, 16) });
        }
      }
    } catch {
      this.feedback.error(this.i18n.t('reminders.form.voice.fallback'));
      this.form.patchValue({ title: transcript });
    } finally {
      this.isParsing.set(false);
    }
  }

  // ─── Location ────────────────────────────────────────────────────────────

  async searchLocation(): Promise<void> {
    const query = this.locationQuery().trim();
    if (!query) return;
    this.isSearching.set(true);
    this.geocodeResults.set([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
      const res = await fetch(url, { headers: { 'Accept-Language': this.i18n.locale() } });
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json() as Array<{ display_name: string; lat: string; lon: string }>;
      this.geocodeResults.set(
        data.map((item) => ({
          name: query,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          displayName: item.display_name,
        }))
      );
    } catch {
      this.feedback.warning(this.i18n.t('reminders.form.geocodeError'));
    } finally {
      this.isSearching.set(false);
    }
  }

  confirmLocation(result: GeocodingResult): void {
    this.confirmedLocation.set({ ...result, name: this.locationQuery().trim() || result.displayName.split(',')[0] });
    this.geocodeResults.set([]);
    this.#map?.setZoom(15);
  }

  // ─── Map picker ──────────────────────────────────────────────────────────

  async #initMap(el: HTMLElement): Promise<void> {
    try {
      const maps = await this.mapsLoader.load();
      const loc = this.confirmedLocation();
      const center = loc ? { lat: loc.lat, lng: loc.lng } : { lat: 20.5937, lng: 78.9629 };

      this.#map = new maps.Map(el, {
        center,
        zoom: loc ? 15 : 4,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
      });
      this.#marker = new maps.Marker({ position: center, draggable: true });
      this.#circle = new maps.Circle({
        center,
        radius: this.radiusKm() * 1000,
        fillColor: '#7c3aed',
        fillOpacity: 0.12,
        strokeColor: '#7c3aed',
        strokeOpacity: 0.6,
        strokeWeight: 1.5,
      });

      this.#map.addListener('click', (e) => {
        const ll = e.latLng;
        if (ll) this.#onMapPick(ll.lat(), ll.lng());
      });
      this.#marker.addListener('dragend', () => {
        const p = this.#marker?.getPosition();
        if (p) this.#onMapPick(p.lat(), p.lng());
      });

      this.#syncMapPin(loc, this.radiusKm());
    } catch {
      // No key configured or script blocked — search-only flow still works.
      this.mapsAvailable.set(false);
    }
  }

  #onMapPick(lat: number, lng: number): void {
    const fallbackName = this.locationQuery().trim() || this.i18n.t('reminders.form.pinnedLocation');
    this.confirmedLocation.set({ name: fallbackName, lat, lng, displayName: fallbackName });
    this.geocodeResults.set([]);
    void this.#reverseGeocodeName(lat, lng);
  }

  /** Resolve a human-readable name for a map-picked point (free Nominatim reverse lookup). */
  async #reverseGeocodeName(lat: number, lng: number): Promise<void> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const res = await fetch(url, { headers: { 'Accept-Language': this.i18n.locale() } });
      if (!res.ok) return;
      const data = await res.json() as { display_name?: string };
      const current = this.confirmedLocation();
      // Only apply if the user has not picked a different point meanwhile.
      if (data.display_name && current && current.lat === lat && current.lng === lng) {
        const name = data.display_name.split(',')[0]?.trim() || current.name;
        this.confirmedLocation.set({ ...current, name, displayName: data.display_name });
        this.locationQuery.set(name);
      }
    } catch { /* keep fallback name */ }
  }

  #syncMapPin(loc: GeocodingResult | null, radiusKm: number): void {
    if (!this.#map || !this.#marker || !this.#circle) return;
    if (!loc) {
      this.#marker.setMap(null);
      this.#circle.setMap(null);
      return;
    }
    const center = { lat: loc.lat, lng: loc.lng };
    this.#marker.setMap(this.#map);
    this.#marker.setPosition(center);
    this.#circle.setMap(this.#map);
    this.#circle.setCenter(center);
    this.#circle.setRadius(radiusKm * 1000);
    this.#map.setCenter(center);
  }

  // ─── Save ────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (this.form.invalid || !this.canSave()) return;
    const uid = this.authService.firebaseUid();
    if (!uid) return;

    const notifGranted = await this.reminderService.requestNotificationPermission();
    if (!notifGranted && this.form.get('type')?.value === 'datetime') {
      this.feedback.warning(this.i18n.t('reminders.form.notifDenied'));
    }

    this.isSaving.set(true);
    try {
      const type = this.form.get('type')!.value as 'datetime' | 'location';
      const title = this.form.get('title')!.value!.trim();
      let remindAt: Date | null = null;
      let location: ReminderLocation | null = null;

      if (type === 'datetime') {
        const raw = this.form.get('remindAt')!.value;
        remindAt = raw ? new Date(raw) : null;
      } else {
        const loc = this.confirmedLocation()!;
        location = { name: loc.name, lat: loc.lat, lng: loc.lng, radiusKm: this.radiusKm() };
      }

      if (this.isEditMode() && this.editId()) {
        await this.reminderService.updateReminder(uid, this.editId()!, { title, type, remindAt, location });
        this.feedback.success(this.i18n.t('reminders.feedback.updated'));
      } else {
        await this.reminderService.createReminder(uid, { title, type, remindAt, location, linkedExpenseId: null });
        this.feedback.success(this.i18n.t('reminders.feedback.created'));
      }

      void this.router.navigate(['/reminders']);
    } catch {
      this.feedback.error(this.i18n.t('reminders.feedback.error'));
    } finally {
      this.isSaving.set(false);
    }
  }

  goBack(): void {
    void this.router.navigate(['/reminders']);
  }
}
