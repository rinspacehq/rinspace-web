export type PwaInstallOutcome = 'accepted' | 'dismissed';

export interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: PwaInstallOutcome; platform: string }>;
}

type PromptListener = () => void;

let capturedPrompt: PwaInstallPromptEvent | null = null;
let captureStarted = false;
const listeners = new Set<PromptListener>();

function notifyPromptListeners() {
  listeners.forEach((listener) => listener());
}

function capturePrompt(event: Event) {
  event.preventDefault();
  capturedPrompt = event as PwaInstallPromptEvent;
  notifyPromptListeners();
}

export function startPwaInstallPromptCapture() {
  if (captureStarted || typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', capturePrompt);
  captureStarted = true;
}

export function getCapturedPwaInstallPrompt() {
  return capturedPrompt;
}

export function subscribeToPwaInstallPrompt(listener: PromptListener) {
  startPwaInstallPromptCapture();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearCapturedPwaInstallPrompt(expectedPrompt?: PwaInstallPromptEvent) {
  if (expectedPrompt && capturedPrompt !== expectedPrompt) return;
  if (!capturedPrompt) return;
  capturedPrompt = null;
  notifyPromptListeners();
}
