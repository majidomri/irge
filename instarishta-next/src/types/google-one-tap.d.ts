export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GsiConfig) => void;
          prompt: (callback?: (n: GsiPromptNotification) => void) => void;
          renderButton: (parent: HTMLElement, options: GsiButtonOptions) => void;
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
  itp_support?: boolean;
  ux_mode?: 'popup' | 'redirect';
}

interface GsiButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number | string;
  locale?: string;
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
