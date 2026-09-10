// Consumer declarations for the pinned, inspected JavaScript APIs. Runtime
// behavior stays in Dust Wave Platform; these mirror only the used exports.
declare module "@dustwave/admin-shell/api-client" {
  export class AdminApiClient {
    constructor(options: {
      baseUrl: string;
      credentials?: RequestCredentials;
      csrfHeader?: string;
      fetchImpl?: typeof fetch;
    });
    request(
      path: string,
      options?: {
        method?: string;
        body?: unknown;
        headers?: HeadersInit;
        signal?: AbortSignal;
        csrf?: boolean;
      },
    ): Promise<unknown>;
  }
}
declare module "@dustwave/admin-shell/tabs" {
  export function mountAccessibleTabs(
    root: HTMLElement,
    options?: {
      initialTab?: string;
      responsiveSelect?: {
        label?: string;
        wrapperClass?: string;
        labelClass?: string;
        selectClass?: string;
      };
      storageKey?: string;
      storage?: Pick<Storage, "getItem" | "setItem">;
      onSelect?: (name: string, tab: HTMLElement) => void;
    },
  ): {
    select: (
      name: string,
      options?: { focus?: boolean; persist?: boolean },
    ) => string;
  };
}
declare module "@dustwave/admin-shell/dirty-controls" {
  export function setDirtyButtonState(
    button: HTMLElement,
    dirty: boolean,
    cleanText?: string,
    dirtyText?: string,
    options?: { disableWhenClean?: boolean; forceDisabled?: boolean },
  ): boolean;
}
declare module "@dustwave/admin-shell/unsaved-changes" {
  export function mountUnsavedChangesGuard(options: {
    hasUnsavedChanges: () => boolean;
    confirmDiscard?: (message: string) => boolean;
  }): {
    confirmTransition: (message?: string) => boolean;
    disconnect: () => void;
  };
}
declare module "@dustwave/admin-shell/turnstile" {
  export function responsiveTurnstileSize(
    el: HTMLElement,
  ): "flexible" | "compact";
}
