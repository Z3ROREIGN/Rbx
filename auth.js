// Best Robux — cliente Supabase centralizado, resiliente e sem carregamentos infinitos.
// Somente chave publishable no navegador. Nunca coloque secret/service_role aqui.
(function () {
  const URL = 'https://anlwpqwjjswkqncltcdl.supabase.co';
  const KEY = 'sb_publishable_r3GoKwcOEaXySt7fFOM_0A_rNOc7Mq7';
  const TIMEOUT = 10000;

  function loadCore(){try{if(window.__BR_CORE_LOADER__)return;window.__BR_CORE_LOADER__=true;const s=document.createElement('script');s.src='/site-core.js';s.async=false;(document.head||document.documentElement).appendChild(s)}catch{}}
  loadCore();

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.bestRobuxAuthReady = Promise.resolve(null);
    window.bestRobuxGetSession = async () => null;
    console.error('[Best Robux] Supabase JS não foi carregado.');
    return;
  }

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  const supabaseFetch = async (input, init = {}) => {
    const controller = new AbortController();
    const externalSignal = init.signal;
    let timer;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    try {
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort(externalSignal.reason);
        else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
      }
      timer = setTimeout(() => controller.abort(new Error('Supabase request timeout')), TIMEOUT);
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
  };

  const client = originalCreateClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'bestrobux-auth',
      storage: window.localStorage,
      flowType: 'pkce'
    },
    global: {
      headers: { 'x-client-info': 'bestrobux-web' },
      fetch: supabaseFetch
    }
  });

  window.bestRobuxSupabase = client;
  window.supabase.createClient = function () { return client; };

  function timeout(promise, ms = TIMEOUT) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Supabase timeout')), ms);
      })
    ]).finally(() => clearTimeout(timer));
  }

  async function getValidSession() {
    try {
      const current = await timeout(client.auth.getSession());
      return current.data?.session || null;
    } catch (error) {
      console.warn('[Best Robux] sessão indisponível:', error?.message || error);
      return null;
    }
  }

  window.bestRobuxGetSession = getValidSession;
  window.bestRobuxAuthReady = (async function () {
    const session = await getValidSession();
    if (session?.user?.id) {
      try {
        const result = await timeout(client.from('profiles').select('account_status,suspended_until').eq('id', session.user.id).maybeSingle());
        const profile = result.data;
        if (profile) {
          const banned = profile.account_status === 'BANNED';
          const suspended = profile.account_status === 'SUSPENDED' && profile.suspended_until && new Date(profile.suspended_until) > new Date();
          if (banned || suspended) { await timeout(client.auth.signOut()); return null; }
        }
      } catch (error) { console.warn('[Best Robux] verificação de status indisponível:', error?.message || error); }
    }
    client.auth.onAuthStateChange((event, nextSession) => window.dispatchEvent(new CustomEvent('bestrobux:auth',{detail:{event,session:nextSession}})));
    return session;
  })();
})();