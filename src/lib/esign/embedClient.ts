const SCRIPT_SRC = 'https://static.signwell.com/assets/embedded.js';

export interface SignWellEmbedInstance {
  open(): void;
  close(): void;
}

export interface SignWellEmbedOptions {
  url: string;
  events?: {
    completed?: (e: { id: string }) => void;
    declined?: (e: { id: string; declineReason?: string }) => void;
    closed?: (e: { id: string }) => void;
    error?: (e: unknown) => void;
  };
}

export type SignWellEmbedConstructor = new (opts: SignWellEmbedOptions) => SignWellEmbedInstance;

declare global {
  interface Window {
    SignWellEmbed?: SignWellEmbedConstructor;
  }
}

let loader: Promise<SignWellEmbedConstructor> | null = null;

/** Loads SignWell's embed script once and resolves its constructor. Rejects on script failure. */
export function loadSignWellEmbed(): Promise<SignWellEmbedConstructor> {
  if (window.SignWellEmbed) return Promise.resolve(window.SignWellEmbed);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        if (window.SignWellEmbed) resolve(window.SignWellEmbed);
        else reject(new Error('SignWellEmbed missing after script load'));
      };
      script.onerror = () => {
        loader = null;
        reject(new Error('failed to load SignWell embed script'));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}
