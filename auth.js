// Best Robux — shared Supabase authentication/session configuration
// This file contains only the public Supabase client key. Never put service-role secrets here.
(function () {
  const URL = 'https://anlwpqwjjswkqncltcdl.supabase.co';
  const KEY = 'sb_publishable_r3GoKwcOEaXySt7fFOM_0A_rNOc7Mq7';

  window.bestRobuxSupabase = window.supabase.createClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'bestrobux-auth',
      storage: window.localStorage,
      flowType: 'pkce'
    }
  });

  window.bestRobuxAuthReady = (async function () {
    const client = window.bestRobuxSupabase;
    const { data, error } = await client.auth.getSession();
    if (error) console.warn('[Best Robux] sessão:', error.message);
    client.auth.onAuthStateChange((event, session) => {
      window.dispatchEvent(new CustomEvent('bestrobux:auth', { detail: { event, session } }));
    });
    return data && data.session ? data.session : null;
  })();
})();
