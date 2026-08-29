/* ============================================================
   credentials.mjs — token storage, deliberately apart from state.

   Tokens live in credentials.json, never in state.json. Three
   consequences, all of them the point:

     - "Reset everything" cannot log you out of Twitch.
     - Tokens are never in the document broadcast over SSE, so they
       never reach a scene, a browser, or an OBS dock.
     - The file can be deleted on its own to sign out of everything.

   The file is written 0600 where the platform supports it. On
   Windows that is a no-op, which is why the file also never leaves
   the machine: the server binds to 127.0.0.1 unless deliberately
   told otherwise.
   ============================================================ */

import { readFile, writeFile, chmod, unlink } from 'node:fs/promises';

export class CredentialStore {
  #file;
  #all = null;

  constructor(file) { this.#file = file; }

  async #load() {
    if (this.#all) return this.#all;
    try {
      this.#all = JSON.parse(await readFile(this.#file, 'utf8'));
    } catch {
      this.#all = {};
    }
    return this.#all;
  }

  async #save() {
    await writeFile(this.#file, JSON.stringify(this.#all, null, 2));
    try { await chmod(this.#file, 0o600); } catch { /* not POSIX */ }
  }

  /** A view scoped to one integration, which is all a provider ever gets. */
  scope(id) {
    return {
      get: async () => (await this.#load())[id] ?? null,
      set: async (value) => {
        await this.#load();
        this.#all[id] = value;
        await this.#save();
      },
      clear: async () => {
        await this.#load();
        delete this.#all[id];
        await this.#save();
      },
    };
  }

  /** Which integrations have stored credentials. Never the values. */
  async linked() { return Object.keys(await this.#load()); }

  async wipe() {
    this.#all = {};
    try { await unlink(this.#file); } catch { /* already gone */ }
  }
}
