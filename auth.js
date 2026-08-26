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
  window.supabase.createClient = function () { return client; };
  async function getValidSession() {
    const first = await client.auth.getSession();
    if (first.error) throw first.error;
    if (first.data?.session) return first.data.session;
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) return null;
    return refreshed.data?.session || null;
  }
  window.bestRobuxGetSession = getValidSession;
  window.bestRobuxAuthReady = (async function () {
    let session = await getValidSession();
    if (session) {
      try {
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('account_status,suspended_until')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!profileError && profile) {
          const banned = profile.account_status === 'BANNED';
          const suspended = profile.account_status === 'SUSPENDED' && profile.suspended_until && new Date(profile.suspended_until) > new Date();
          if (banned || suspended) {
            await client.auth.signOut();
            return null;
          }
        }
      } catch (e) {
        console.warn('[Best Robux] não foi possível verificar status da conta:', e.message);
      }
    }
    client.auth.onAuthStateChange((event, nextSession) => {
      window.dispatchEvent(new CustomEvent('bestrobux:auth', { detail: { event, session: nextSession } }));
    });
    return session;
  })();
})();
