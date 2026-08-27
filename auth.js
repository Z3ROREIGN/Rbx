// Best Robux — shared Supabase authentication/session configuration
// Public client key only. Never put a service-role secret in browser code.
(function () {
  if (!window.supabase || window.bestRobuxSupabase) return;

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

  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_TIMEOUT')), ms))
  ]);

  async function getValidSession() {
    try {
      const current = await withTimeout(client.auth.getSession(), 5000);
      if (current.data?.session) return current.data.session;
    } catch (_) {}

    try {
      const refreshed = await withTimeout(client.auth.refreshSession(), 5000);
      return refreshed.data?.session || null;
    } catch (_) {
      return null;
    }
  }

  window.bestRobuxGetSession = getValidSession;

  // Only augment same-origin /api requests. This fixes pages that call an
  // authenticated API without manually copying the Supabase access token,
  // without interfering with normal browser fetches or third-party requests.
  const nativeFetch = window.fetch.bind(window);
  window.bestRobuxNativeFetch = nativeFetch;
  window.fetch = async function (input, init) {
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(rawUrl, location.href);
      const sameOrigin = url.origin === location.origin;
      const isApi = sameOrigin && url.pathname.startsWith('/api/');
      if (!isApi) return nativeFetch(input, init);

      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        const session = await getValidSession();
        if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
      }

      const nextInit = { ...(init || {}), headers };
      return nativeFetch(input, nextInit);
    } catch (_) {
      return nativeFetch(input, init);
    }
  };

  window.bestRobuxAuthReady = (async function () {
    const session = await getValidSession();

    if (session) {
      try {
        const { data: profile, error: profileError } = await withTimeout(
          client.from('profiles').select('account_status,suspended_until').eq('id', session.user.id).maybeSingle(),
          6000
        );
        if (!profileError && profile) {
          const banned = profile.account_status === 'BANNED';
          const suspended = profile.account_status === 'SUSPENDED' && profile.suspended_until && new Date(profile.suspended_until) > new Date();
          if (banned || suspended) {
            await client.auth.signOut();
            return null;
          }
        }
      } catch (e) {
        console.warn('[Best Robux] status da conta não pôde ser verificado:', e?.message || e);
      }
    }

    client.auth.onAuthStateChange((event, nextSession) => {
      window.dispatchEvent(new CustomEvent('bestrobux:auth', {
        detail: { event, session: nextSession }
      }));
    });
    return session;
  })();
})();
