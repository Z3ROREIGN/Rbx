export const config = { runtime: 'edge' };

export default async function handler(request) {
  const headers = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://anlwpqwjjswkqncltcdl.supabase.co';
  // Prefer the modern publishable key. Legacy anon remains a compatibility fallback.
  const supabaseAnonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_r3GoKwcOEaXySt7fFOM_0A_rNOc7Mq7';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('CONFIG_MISSING: Supabase público não configurado');
    return new Response(JSON.stringify({ error: 'Serviço de autenticação temporariamente indisponível.' }), { status: 503, headers });
  }

  return new Response(JSON.stringify({ supabaseUrl, supabaseAnonKey }), { status: 200, headers });
}