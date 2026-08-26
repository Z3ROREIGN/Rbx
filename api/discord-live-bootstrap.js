import { createClient } from '@supabase/supabase-js';

const BOOTSTRAP_TOKEN = 'iOPZFe2cyb0_jpszv3YS5affNGRWgXnCyBFaX2NSgQk';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  if (String(req.query?.token || '') !== BOOTSTRAP_TOKEN) return res.status(404).json({ error: 'Não encontrado.' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.CRON_SECRET) {
    return res.status(500).json({ error: 'Configuração incompleta.' });
  }

  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: state, error: readError } = await db
      .from('discord_live_bootstrap_state')
      .select('used_at')
      .eq('id', true)
      .maybeSingle();

    if (readError) throw readError;
    if (state?.used_at) return res.status(410).json({ error: 'Bootstrap já utilizado.' });

    const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bestrobux.vercel.app';
    const response = await fetch(`${origin}/api/discord-live`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('discord-live-bootstrap: live endpoint failed', response.status, body);
      return res.status(502).json({ error: 'Falha no endpoint Live.', status: response.status, details: body });
    }

    const { error: writeError } = await db
      .from('discord_live_bootstrap_state')
      .update({ used_at: new Date().toISOString() })
      .eq('id', true)
      .is('used_at', null);

    if (writeError) throw writeError;
    return res.status(200).json({ ok: true, live: body });
  } catch (error) {
    console.error('discord-live-bootstrap:', error?.message || error);
    return res.status(500).json({ error: 'Falha no bootstrap.' });
  }
}
