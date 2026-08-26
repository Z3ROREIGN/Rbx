import { createClient } from '@supabase/supabase-js';

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const authDb = () => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

async function getUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const { data, error } = await authDb().auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'PATCH'].includes(req.method)) {
      res.setHeader('Allow', 'GET, PATCH');
      return json(res, 405, { error: 'Método não permitido.' });
    }

    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });

    const client = db();

    if (req.method === 'GET') {
      const { data, error } = await client
        .from('notifications')
        .select('id,title,message,type,order_id,read_at,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return json(res, 200, { notifications: data || [] });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const now = new Date().toISOString();

    if (body.all === true) {
      const { data, error } = await client
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null)
        .select('id');
      if (error) throw error;
      return json(res, 200, { ok: true, updated: data?.length || 0 });
    }

    const id = String(body.id || '').trim();
    if (!id) return json(res, 400, { error: 'ID da notificação é obrigatório.' });

    const { data, error } = await client
      .from('notifications')
      .update({ read_at: now })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('read_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return json(res, 200, { ok: true, updated: Boolean(data) });
  } catch (error) {
    console.error('notifications', error);
    return json(res, 500, { error: 'Não foi possível processar as notificações.' });
  }
}
