import type { AtriumAPI } from '../../shared/types';

declare global {
  interface Window {
    api: AtriumAPI;
  }
}

export {};
