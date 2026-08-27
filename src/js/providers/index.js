/* ============================================================
   Provider registry.

   Scenes call boot() and get a live store back. They never name a
   provider, so adding TwitchProvider below is the entire integration
   surface — no scene, widget, or stylesheet changes.
   ============================================================ */

import { Store } from '../store.js';
import { ManualProvider } from './manual.js';

/* Register future providers here:
     import { TwitchProvider } from './twitch.js';
     twitch: TwitchProvider,
   …then set `provider: 'twitch'` in config.js. Each must satisfy the
   contract in provider.js. Twitch auth/EventSub is deliberately not
   implemented yet. */
export const providers = {
  [ManualProvider.id]: ManualProvider,
};

/**
 * Construct the store, attach the configured provider, and start it.
 * @returns {Promise<Store>}
 */
export async function boot(config) {
  const Ctor = providers[config.provider];
  if (!Ctor) {
    console.error(`[providers] unknown provider "${config.provider}" — falling back to manual`);
  }
  const store = new Store(config);
  const provider = new (Ctor ?? ManualProvider)(store, config);
  await store.attach(provider);
  return store;
}
