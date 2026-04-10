'use client';

export type PiStorageBundle = {
  appStorage: unknown;
};

type PiWebUiModule = Record<string, unknown>;

function asConstructor<T>(value: unknown, name: string): new (...args: any[]) => T {
  if (typeof value !== 'function') {
    throw new Error(`[pi] Missing ${name} export from @mariozechner/pi-web-ui`);
  }
  return value as new (...args: any[]) => T;
}

export function initPiStorage(piWebUi: PiWebUiModule): PiStorageBundle {
  const IndexedDBStorageBackend = asConstructor(piWebUi.IndexedDBStorageBackend, 'IndexedDBStorageBackend');
  const SettingsStore = asConstructor(piWebUi.SettingsStore, 'SettingsStore');
  const ProviderKeysStore = asConstructor(piWebUi.ProviderKeysStore, 'ProviderKeysStore');
  const SessionsStore = asConstructor(piWebUi.SessionsStore, 'SessionsStore');
  const AppStorage = asConstructor(piWebUi.AppStorage, 'AppStorage');

  const backend = new IndexedDBStorageBackend('agent-infra-pi-experiment');
  const settingsStore = new SettingsStore(backend);
  const providerKeysStore = new ProviderKeysStore(backend);
  const sessionsStore = new SessionsStore(backend);

  const CustomProvidersStoreCtor = piWebUi.CustomProvidersStore as (new (...args: any[]) => unknown) | undefined;
  const customProvidersStore =
    typeof CustomProvidersStoreCtor === 'function' ? new CustomProvidersStoreCtor(backend) : undefined;

  const appStorage = new AppStorage({
    backend,
    settingsStore,
    providerKeysStore,
    sessionsStore,
    ...(customProvidersStore ? { customProvidersStore } : {})
  });

  const setAppStorage = piWebUi.setAppStorage as ((storage: unknown) => void) | undefined;
  if (typeof setAppStorage === 'function') {
    setAppStorage(appStorage);
  }

  return { appStorage };
}
