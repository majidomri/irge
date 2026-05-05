export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GsiConfig) => void;
          prompt: (callback?: (n: GsiPromptNotification) => void) => void;
          cancel: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

interface GsiConfig {
  client_id: string;
  callback: (response: GsiCredentialResponse) => void;
  nonce?: string;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: 'signin' | 'signup' | 'use';
  use_fedcm_for_prompt?: boolean;
}

interface GsiCredentialResponse {
  credential: string;
  select_by: string;
}

interface GsiPromptNotification {
  isDisplayed: () => boolean;
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => string;
}
