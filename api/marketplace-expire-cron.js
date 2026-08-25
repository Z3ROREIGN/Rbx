import { createClient } from '@supabase/supabase-js';

const admin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const expected = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (!expected || auth !== `Bearer ${expected}`) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const a = admin();
    const { data, error } = await a.from('marketplace_orders')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('status', 'PENDING_PAYMENT')
      .lt('created_at', cutoff)
      .select('id');
    if (error) throw error;
    return res.status(200).json({ ok: true, expired: data?.length || 0 });
  } catch (e) {
    console.error('marketplace-expire-cron', e);
    return res.status(500).json({ error: 'Expiration job failed' });
  }
}
