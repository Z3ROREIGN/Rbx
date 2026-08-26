import { createClient } from '@supabase/supabase-js';
import { discordEvent, updateDiscordMessage, deleteDiscordMessage, buildEmbed } from './_discord.js';

export const config = { runtime: 'edge' };

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.status(status).json(body);
};

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function hasServerConfig() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.DISCORD_WEBHOOK_UPDATES &&
    process.env.DISCORD_WEBHOOK_MARKETPLACE &&
    process.env.DISCORD_WEBHOOK_FEATURED
  );
}

async function publicSnapshot(db) {
  const [products, marketplace, recentOrders] = await Promise.all([
    db.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
    db.from('marketplace_products').select('id, title, price, quantity, image_url, delivery_type, updated_at').eq('active', true).order('updated_at', { ascending: false }).limit(5),
    db.from('marketplace_orders').select('id, status, quantity, subtotal, created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  if (products.error) throw new Error(`products: ${products.error.message}`);
  if (marketplace.error) throw new Error(`marketplace_products: ${marketplace.error.message}`);
  if (recentOrders.error) throw new Error(`marketplace_orders: ${recentOrders.error.message}`);

  const availableStock = (marketplace.data || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
  return {
    productCount: products.count || 0,
    marketplaceCount: marketplace.data?.length || 0,
    availableStock,
    latest: marketplace.data?.[0] || null,
    latestOrder: recentOrders.data?.[0] || null,
  };
}

function snapshotEmbed(snapshot, channel) {
  const title = channel === 'marketplace'
    ? '🛍️ BestRobux • Marketplace ao vivo'
    : channel === 'featured'
      ? '⭐ BestRobux • Destaques ao vivo'
      : '📡 BestRobux • Site ao vivo';

  const fields = [
    { name: 'Produtos ativos', value: String(snapshot.productCount), inline: true },
    { name: 'Anúncios Marketplace', value: String(snapshot.marketplaceCount), inline: true },
    { name: 'Estoque disponível', value: String(snapshot.availableStock), inline: true },
  ];

  if (channel !== 'updates' && snapshot.latest) {
    fields.push(
      { name: 'Produto recente', value: String(snapshot.latest.title || 'Produto'), inline: false },
      { name: 'Preço', value: money(snapshot.latest.price), inline: true },
      { name: 'Entrega', value: String(snapshot.latest.delivery_type || 'Digital'), inline: true },
    );
  }

  if (channel === 'featured' && snapshot.latest) {
    fields.unshift({ name: 'Último destaque', value: String(snapshot.latest.title || 'Produto'), inline: false });
  }

  if (channel === 'updates' && snapshot.latestOrder) {
    fields.push({ name: 'Última atividade pública', value: `Pedido Marketplace • ${String(snapshot.latestOrder.status || 'atualizado')}`, inline: false });
  }

  return buildEmbed({
    title,
    description: 'Painel público atualizado automaticamente. Nenhuma informação privada de compradores, vendedores ou administradores é exibida.',
    type: channel === 'marketplace' ? 'marketplace' : channel === 'featured' ? 'featured' : 'info',
    fields,
    url: 'https://bestrobux.vercel.app',
    thumbnail: snapshot.latest?.image_url,
    footer: 'BestRobux • Live público • atualização automática',
  });
}

async function getState(db, channel) {
  const { data, error } = await db.from('discord_live_message_state').select('message_id').eq('channel', channel).maybeSingle();
  if (error) throw new Error(`discord_live_message_state read: ${error.message}`);
  return data?.message_id || null;
}

async function saveState(db, channel, messageId) {
  const { error } = await db.from('discord_live_message_state').upsert({
    channel,
    message_id: messageId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'channel' });
  if (error) throw new Error(`discord_live_message_state write: ${error.message}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

  const cronSecret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) return json(res, 401, { error: 'Não autorizado.' });

  if (!hasServerConfig()) {
    console.error('discord-live: configuração do servidor incompleta', {
      supabaseUrl: Boolean(process.env.SUPABASE_URL),
      supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      updatesWebhook: Boolean(process.env.DISCORD_WEBHOOK_UPDATES),
      marketplaceWebhook: Boolean(process.env.DISCORD_WEBHOOK_MARKETPLACE),
      featuredWebhook: Boolean(process.env.DISCORD_WEBHOOK_FEATURED),
    });
    return json(res, 500, { error: 'Configuração do servidor incompleta.' });
  }

  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const snapshot = await publicSnapshot(db);
    const channels = ['updates', 'marketplace', 'featured'];
    const results = {};

    for (const channel of channels) {
      const embed = snapshotEmbed(snapshot, channel);
      let messageId = await getState(db, channel);

      if (messageId) {
        const updated = await updateDiscordMessage({ channel, messageId, embed });
        if (updated.updated) {
          results[channel] = { status: 'updated', discordStatus: updated.status };
          await saveState(db, channel, messageId);
          continue;
        }
        await deleteDiscordMessage({ channel, messageId });
        messageId = null;
      }

      const sent = await discordEvent({
        channel,
        title: embed.title,
        description: embed.description,
        type: channel === 'marketplace' ? 'marketplace' : channel === 'featured' ? 'featured' : 'info',
        fields: embed.fields,
        url: embed.url,
        thumbnail: embed.thumbnail?.url,
        footer: embed.footer?.text,
        wait: true,
      });

      if (sent.messageId) {
        await saveState(db, channel, sent.messageId);
        results[channel] = { status: 'created', discordStatus: sent.status };
      } else {
        results[channel] = { status: 'failed', discordStatus: sent.status || null, error: sent.error || null };
      }
    }

    return json(res, 200, { ok: true, results, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('discord-live:', error?.message || error);
    return json(res, 500, { error: 'Falha ao atualizar o painel público do Discord.' });
  }
}
