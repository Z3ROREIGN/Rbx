// Best Robux — cliente Supabase centralizado e resiliente.
// Somente chave publishable no navegador. Nunca coloque secret/service_role aqui.
(function () {
  const URL = 'https://anlwpqwjjswkqncltcdl.supabase.co';
  const KEY = 'sb_publishable_r3GoKwcOEaXySt7fFOM_0A_rNOc7Mq7';
  const TIMEOUT = 8000;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.bestRobuxAuthReady = Promise.resolve(null);
    window.bestRobuxGetSession = async () => null;
    console.error('[Best Robux] Supabase JS não foi carregado.');
    return;
  }

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  const client = originalCreateClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'bestrobux-auth',
      storage: window.localStorage,
      flowType: 'pkce',
      lock: false
    },
    global: {
      headers: { 'x-client-info': 'bestrobux-web' }
    }
  });

  window.bestRobuxSupabase = client;
  window.supabase.createClient = function () { return client; };

  function timeout(promise, ms = TIMEOUT) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), ms))
    ]);
  }

  async function getValidSession() {
    try {
      const current = await timeout(client.auth.getSession());
      if (current.data?.session) return current.data.session;
      return null;
    } catch (error) {
      console.warn('[Best Robux] sessão indisponível:', error?.message || error);
      return null;
    }
  }

  window.bestRobuxGetSession = getValidSession;
  window.bestRobuxAuthReady = (async function () {
    const session = await getValidSession();

    if (session) {
      try {
        const result = await timeout(client
          .from('profiles')
          .select('account_status,suspended_until')
          .eq('id', session.user.id)
          .maybeSingle());
        const profile = result.data;
        if (profile) {
          const banned = profile.account_status === 'BANNED';
          const suspended = profile.account_status === 'SUSPENDED' && profile.suspended_until && new Date(profile.suspended_until) > new Date();
          if (banned || suspended) {
            await timeout(client.auth.signOut());
            return null;
          }
        }
      } catch (error) {
        // O status da conta não pode impedir o site de abrir se o banco estiver temporariamente lento.
        console.warn('[Best Robux] verificação de status indisponível:', error?.message || error);
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