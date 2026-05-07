// Type declarations for extended browser APIs

export {};

declare global {
  /**
   * Extend NotificationOptions to include vibrate property
   * which is supported by browsers but not in default TypeScript DOM types
   */
  interface NotificationOptions {
    vibrate?: number[] | number;
  }
}
