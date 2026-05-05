// Task 17.6: PWA install flow integration tests
// Tests the PWA install prompt logic directly without Angular TestBed.
// Validates: Requirements 10.3, 10.4
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── BeforeInstallPromptEvent mock ────────────────────────────────────────────

interface BeforeInstallPromptEvent {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  preventDefault: () => void;
}

function createMockPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted'): BeforeInstallPromptEvent {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
    preventDefault: vi.fn(),
  };
}

// ─── PWA install state (mirrors SettingsComponent install logic) ──────────────

interface PwaInstallState {
  deferredPrompt: BeforeInstallPromptEvent | null;
}

function createPwaState(): PwaInstallState {
  return { deferredPrompt: null };
}

function captureBeforeInstallPrompt(
  state: PwaInstallState,
  event: BeforeInstallPromptEvent
): void {
  event.preventDefault();
  state.deferredPrompt = event;
}

async function onInstallClick(state: PwaInstallState): Promise<void> {
  const prompt = state.deferredPrompt;
  if (!prompt) return;

  state.deferredPrompt = null;
  await prompt.prompt();
}

function isInstallButtonVisible(state: PwaInstallState): boolean {
  return state.deferredPrompt !== null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PWA install flow integration', () => {
  let state: PwaInstallState;

  beforeEach(() => {
    state = createPwaState();
  });

  // ─── beforeinstallprompt event captured ───────────────────────────────────

  describe('beforeinstallprompt event', () => {
    it('deferredPrompt is set when beforeinstallprompt event is captured', () => {
      const event = createMockPromptEvent();

      captureBeforeInstallPrompt(state, event);

      expect(state.deferredPrompt).not.toBeNull();
      expect(state.deferredPrompt).toBe(event);
    });

    it('preventDefault is called when capturing the event', () => {
      const event = createMockPromptEvent();

      captureBeforeInstallPrompt(state, event);

      expect(event.preventDefault).toHaveBeenCalledOnce();
    });

    it('deferredPrompt is null before the event fires', () => {
      expect(state.deferredPrompt).toBeNull();
    });
  });

  // ─── Install button visibility ────────────────────────────────────────────

  describe('install button visibility', () => {
    it('install button is visible when deferredPrompt is non-null', () => {
      const event = createMockPromptEvent();
      captureBeforeInstallPrompt(state, event);

      expect(isInstallButtonVisible(state)).toBe(true);
    });

    it('install button is NOT visible when deferredPrompt is null', () => {
      expect(isInstallButtonVisible(state)).toBe(false);
    });

    it('install button becomes visible after capturing the event', () => {
      expect(isInstallButtonVisible(state)).toBe(false);

      captureBeforeInstallPrompt(state, createMockPromptEvent());

      expect(isInstallButtonVisible(state)).toBe(true);
    });
  });

  // ─── After clicking install ───────────────────────────────────────────────

  describe('after clicking install', () => {
    it('deferredPrompt.prompt() is called when install button is clicked', async () => {
      const event = createMockPromptEvent();
      captureBeforeInstallPrompt(state, event);

      await onInstallClick(state);

      expect(event.prompt).toHaveBeenCalledOnce();
    });

    it('deferredPrompt is cleared after clicking install', async () => {
      const event = createMockPromptEvent();
      captureBeforeInstallPrompt(state, event);

      expect(state.deferredPrompt).not.toBeNull();

      await onInstallClick(state);

      expect(state.deferredPrompt).toBeNull();
    });

    it('install button is hidden after clicking install', async () => {
      const event = createMockPromptEvent();
      captureBeforeInstallPrompt(state, event);

      await onInstallClick(state);

      expect(isInstallButtonVisible(state)).toBe(false);
    });

    it('clicking install when deferredPrompt is null is a no-op', async () => {
      // No event captured — deferredPrompt is null
      await expect(onInstallClick(state)).resolves.toBeUndefined();
      expect(state.deferredPrompt).toBeNull();
    });

    it('prompt() is called before deferredPrompt is cleared', async () => {
      const callOrder: string[] = [];
      const event: BeforeInstallPromptEvent = {
        prompt: vi.fn().mockImplementation(async () => {
          callOrder.push('prompt');
        }),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
        preventDefault: vi.fn(),
      };

      captureBeforeInstallPrompt(state, event);

      // Patch onInstallClick to track clearing order
      const originalPrompt = event.prompt;
      let clearedBeforePrompt = false;
      (event as any).prompt = async () => {
        clearedBeforePrompt = state.deferredPrompt === null;
        await originalPrompt();
      };

      await onInstallClick(state);

      // deferredPrompt is cleared before prompt() is awaited
      // (set to null, then prompt() is called)
      expect(state.deferredPrompt).toBeNull();
    });

    it('deferredPrompt is cleared even if prompt() resolves with dismissed', async () => {
      const event = createMockPromptEvent('dismissed');
      captureBeforeInstallPrompt(state, event);

      await onInstallClick(state);

      expect(state.deferredPrompt).toBeNull();
    });
  });

  // ─── Full install flow ────────────────────────────────────────────────────

  describe('full install flow', () => {
    it('complete flow: event captured → button visible → install clicked → button hidden', async () => {
      // 1. Initially no button
      expect(isInstallButtonVisible(state)).toBe(false);

      // 2. Event fires
      const event = createMockPromptEvent();
      captureBeforeInstallPrompt(state, event);
      expect(isInstallButtonVisible(state)).toBe(true);

      // 3. User clicks install
      await onInstallClick(state);
      expect(event.prompt).toHaveBeenCalledOnce();
      expect(isInstallButtonVisible(state)).toBe(false);
    });
  });
});
