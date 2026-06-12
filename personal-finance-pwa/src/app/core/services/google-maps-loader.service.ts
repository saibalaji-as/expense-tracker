import { Injectable } from '@angular/core';

/**
 * Minimal structural typings for the parts of the Google Maps JS API Spenza
 * uses. Avoids a @types/google.maps dependency for one feature.
 */
export interface GMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Circle: new (opts: Record<string, unknown>) => GCircle;
  event: { addListener(target: unknown, name: string, handler: (...args: unknown[]) => void): unknown };
}
export interface GMap {
  setCenter(latLng: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
  addListener(name: string, handler: (e: GMapMouseEvent) => void): unknown;
}
export interface GMarker {
  setPosition(latLng: { lat: number; lng: number }): void;
  setMap(map: GMap | null): void;
  getPosition(): { lat(): number; lng(): number } | null;
  addListener(name: string, handler: () => void): unknown;
}
export interface GCircle {
  setCenter(latLng: { lat: number; lng: number }): void;
  setRadius(meters: number): void;
  setMap(map: GMap | null): void;
}
export interface GMapMouseEvent {
  latLng?: { lat(): number; lng(): number };
}

/**
 * Lazily loads the Google Maps JavaScript API exactly once.
 *
 * The API key is injected into index.html at deploy time as
 * `window.__GOOGLE_MAPS_API_KEY__` (same pattern as the Razorpay key).
 * When the key is missing (local dev) `isConfigured()` returns false and
 * callers must fall back to the search-only location flow.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  #loadPromise: Promise<GMapsApi> | null = null;

  isConfigured(): boolean {
    const key = this.#apiKey();
    return !!key && !key.includes('PLACEHOLDER');
  }

  /** Resolves with the google.maps namespace, loading the script on first call. */
  load(): Promise<GMapsApi> {
    if (this.#loadPromise) return this.#loadPromise;

    if (!this.isConfigured()) {
      return Promise.reject(new Error('Google Maps API key not configured'));
    }

    // Already present (e.g. hot reload)
    const existing = (window as any).google?.maps;
    if (existing?.Map) {
      this.#loadPromise = Promise.resolve(existing as GMapsApi);
      return this.#loadPromise;
    }

    this.#loadPromise = new Promise<GMapsApi>((resolve, reject) => {
      const callbackName = '__spenzaMapsReady';
      (window as any)[callbackName] = () => {
        delete (window as any)[callbackName];
        resolve((window as any).google.maps as GMapsApi);
      };
      const script = document.createElement('script');
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.#apiKey())}` +
        `&callback=${callbackName}&loading=async&v=weekly`;
      script.async = true;
      script.onerror = () => {
        this.#loadPromise = null;
        delete (window as any)[callbackName];
        reject(new Error('Google Maps script failed to load'));
      };
      document.head.appendChild(script);
    });
    return this.#loadPromise;
  }

  #apiKey(): string {
    return (window as any).__GOOGLE_MAPS_API_KEY__ ?? '';
  }
}
