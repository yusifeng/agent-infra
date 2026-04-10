import {
  AppStorage,
  CustomProvidersStore,
  IndexedDBStorageBackend,
  ProviderKeysStore,
  SessionsStore,
  SettingsStore,
  setAppStorage
} from './vendor';

export type PiNarrowStorageContext = {
  storage: AppStorage;
  settings: SettingsStore;
  providerKeys: ProviderKeysStore;
  sessions: SessionsStore;
  customProviders: CustomProvidersStore;
  backend: IndexedDBStorageBackend;
};

const PI_DB_NAME = 'agent-infra-pi-web-ui';
const FAUX_PROVIDER = 'faux';
const FAUX_PROVIDER_KEY = 'local-demo-key';

let storagePromise: Promise<PiNarrowStorageContext> | null = null;

export async function initializePiNarrowStorage(): Promise<PiNarrowStorageContext> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    throw new Error('The pi-web-ui experiment requires a browser with IndexedDB support.');
  }

  if (!storagePromise) {
    storagePromise = (async () => {
      const settings = new SettingsStore();
      const providerKeys = new ProviderKeysStore();
      const sessions = new SessionsStore();
      const customProviders = new CustomProvidersStore();

      const backend = new IndexedDBStorageBackend({
        dbName: PI_DB_NAME,
        version: 1,
        stores: [
          settings.getConfig(),
          providerKeys.getConfig(),
          sessions.getConfig(),
          SessionsStore.getMetadataConfig(),
          customProviders.getConfig()
        ]
      });

      settings.setBackend(backend);
      providerKeys.setBackend(backend);
      sessions.setBackend(backend);
      customProviders.setBackend(backend);

      const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
      setAppStorage(storage);

      if (!(await providerKeys.has(FAUX_PROVIDER))) {
        await providerKeys.set(FAUX_PROVIDER, FAUX_PROVIDER_KEY);
      }

      return {
        storage,
        settings,
        providerKeys,
        sessions,
        customProviders,
        backend
      };
    })();
  }

  try {
    return await storagePromise;
  } catch (error) {
    storagePromise = null;
    throw error;
  }
}
