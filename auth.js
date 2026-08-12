// Best Robux — shared Supabase authentication/session configuration
// Public client key only. Never put a service-role secret in browser code.
(function () {
  const URL = 'https://anlwpqwjjswkqncltcdl.supabase.co';
  const KEY = 'sb_publishable_r3GoKwcOEaXySt7fFOM_0A_rNOc7Mq7';
  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  const client = originalCreateClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'bestrobux-auth',
      storage: window.localStorage,
      flowType: 'pkce'
    }
  });
  window.bestRobuxSupabase = client;
  // Pages that create a client inline now share this persistent session.
  window.supabase.createClient = function () { return client; };
  window.bestRobuxAuthReady = (async function () {
    const { data, error } = await client.auth.getSession();
    if (error) console.warn('[Best Robux] sessão:', error.message);
    client.auth.onAuthStateChange((event, session) => {
      window.dispatchEvent(new CustomEvent('bestrobux:auth', { detail: { event, session } }));
    });
    return data && data.session ? data.session : null;
  })();
})();
