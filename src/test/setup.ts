import '@testing-library/jest-dom/vitest';

// Recharts mesure ses conteneurs via ResizeObserver, absent de jsdom.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
