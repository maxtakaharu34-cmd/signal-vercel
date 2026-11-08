# Owner-only simple entry

- Display: https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site/
- Admin: https://signal-homepage-1105.maxtakaharu3-4.chatgpt.site/admin/
- Initial entry code: `111`.

The current native Site audience is public (observed revision 2); this release preserves that audience. The common simulated display is readable without signing in. Account/session endpoints and all management writes remain restricted. There is no additional email registration step. The server obtains the authenticated Site identity with the supported ChatGPT identity helper; only the configured owner's identity can exchange the entry code for a signed session. Knowing `111` is insufficient for another account or an anonymous caller.

The entry session lasts eight hours and is bound to the Site user ID. The server sets a Secure/HttpOnly/Partitioned cookie. An in-memory header token supports embedded browsers that block cookies; it is not saved in localStorage. Logout clears the browser entry state, while the existing Site sign-in remains active.

Updates run through same-origin server APIs backed by PostgreSQL. The browser never receives the random database bridge credential or a Supabase service-role key. Only a hash of the scoped bridge credential is stored in PostgreSQL. The bridge can read the common simulated scene or publish one validated, version-checked scene; it cannot run arbitrary SQL or manage funds/accounts.

Runtime keys are configured with native Sites environment tools: OWNER_EMAIL, SITE_ORIGIN, ADMIN_ENTRY_PIN, DEMO_BRIDGE_SECRET, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Secret values do not belong in source or the browser bundle. The publishable Supabase key is intentionally supplied to Realtime clients; it grants no administrator session or database bridge access.

Saved revisions emit a content-free Supabase Broadcast hint over WebSocket. Viewers then read the current common scene through the Site API. Fallback reads run every second without a connected channel and every five seconds while connected. Automatic apply is opt-in per administrator session and waits 700 ms after input stops; writes are serialized. Failures disable automatic apply and retain the draft. Manual mode retains changes in the preview until published. The scenario and the manual source of its signal remain visible. No real transfers, orders or customer profit balances are implemented.

The previous Supabase Auth tables and APIs remain protected for compatibility. The new simple entry uses Site identity, not a precreated Supabase user.

### Automatic simulation

No additional environment variables, schema migration, cron or secret is needed. `/api/admin/automation` shares the existing trusted Site owner + signed entry-session + same-origin requirements. Commands use the existing version-checked bridge publication and content-free refresh notification. GET `/api/scene` projects the current frame from the persisted optional checkpoint automation anchor and server time. It does not perform database writes. Disable automatic mode with its Stop button before using the older manual editing controls. Deploying the feature does not itself start an existing scene.
