import { createClient } from '@supabase/supabase-js';
import { broadcastEvent, isPublicDiscordEvent } from './_discord.js';

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
};

// These channels are public. Never forward private/admin/support/account data.
const CHANNELS_BY_EVENT = Object.freeze({
  page_view: ['updates'],
  login: ['updates'],
  logout: ['updates'],
  order_created: ['updates'],
  order_status: ['updates'],
  marketplace_product: ['marketplace', 'updates'],
  marketplace_stock: ['marketplace', 'updates'],
  marketplace_order: ['marketplace', 'updates'],
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(res, 401, { error: 'Autenticação obrigatória.' });
    if (JSON.stringify(req.body || {}).length > 12000) return json(res, 413, { error: 'Evento muito grande.' });

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return json(res, 401, { error: 'Sessão inválida.' });

    const body = req.body || {};
    const event = String(body.event || '').trim();
    if (!isPublicDiscordEvent(event) || !CHANNELS_BY_EVENT[event]) {
      return json(res, 403, { error: 'Evento não pode ser publicado nos canais públicos.' });
    }

    const fields = Array.isArray(body.fields)
      ? body.fields
          .filter(x => x && typeof x === 'object')
          .slice(0, 10)
          .map(x => ({
            name: String(x.name || 'Informação').slice(0, 80),
            value: String(x.value ?? '').slice(0, 500),
            inline: x.inline !== false,
          }))
      : [];

    const type = body.type === 'danger' ? 'danger'
      : body.type === 'warning' ? 'warning'
      : body.type === 'success' ? 'success'
      : event.startsWith('marketplace_') ? 'marketplace'
      : 'info';

    const result = await broadcastEvent({
      channels: CHANNELS_BY_EVENT[event],
      title: String(body.title || event).slice(0, 180),
      description: String(body.description || 'Atividade pública registrada no BestRobux.').slice(0, 1500),
      type,
      fields,
      url: 'https://bestrobux.vercel.app',
      thumbnail: body.thumbnail,
      image: body.image,
    });

    return json(res, 200, {
      ok: true,
      delivered: result.filter(x => x?.sent).length,
    });
  } catch (e) {
    console.error('discord-event:', e);
    return json(res, 500, { error: 'Não foi possível registrar o evento.' });
  }
}
