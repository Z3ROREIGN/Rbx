const SITE_URL = process.env.SITE_URL || 'https://bestrobux.vercel.app';
const LOGO = process.env.DISCORD_WEBHOOK_AVATAR_URL || `${SITE_URL}/assets/best-robux-logo.svg`;

const CHANNELS = Object.freeze({
  updates: process.env.DISCORD_WEBHOOK_UPDATES,
  marketplace: process.env.DISCORD_WEBHOOK_MARKETPLACE,
  featured: process.env.DISCORD_WEBHOOK_FEATURED,
});

const COLORS = Object.freeze({
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  marketplace: 0x00b0f4,
  featured: 0xffb300,
});

const PUBLIC_EVENTS = new Set([
  'page_view',
  'login',
  'logout',
  'account_update',
  'order_created',
  'order_status',
  'wallet_update',
  'marketplace_product',
  'marketplace_stock',
  'marketplace_order',
]);

const PRIVATE_FIELD = /(^|_)(email|phone|token|password|secret|key|cookie|authorization|session|ip|address|discord|admin|seller|wallet|balance|chat|message|content)(_|$)/i;

function clean(value, max = 1000) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\\`*_{}[\]<>@]/g, '').slice(0, max);
}

function validUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function publicField(name, value, inline = true) {
  if (PRIVATE_FIELD.test(String(name))) return null;
  const text = clean(value, 1024);
  return text ? { name: clean(name, 256), value: text, inline } : null;
}

function buildEmbed({ title, description, type, fields, url, thumbnail, image, footer }) {
  const safeFields = fields
    .filter(f => f && !PRIVATE_FIELD.test(String(f.name || '')))
    .map(f => publicField(f.name, f.value, f.inline !== false))
    .filter(Boolean)
    .slice(0, 25);

  const embed = {
    title: clean(title || 'BestRobux • Atualização', 256),
    description: clean(description || 'Atividade pública registrada no BestRobux.', 4096),
    color: COLORS[type] || COLORS.info,
    fields: safeFields,
    timestamp: new Date().toISOString(),
    footer: { text: clean(footer || 'BestRobux • Informações públicas', 2048) },
  };

  const safeUrl = validUrl(url);
  const safeThumbnail = validUrl(thumbnail);
  const safeImage = validUrl(image);
  if (safeUrl) embed.url = safeUrl;
  if (safeThumbnail) embed.thumbnail = { url: safeThumbnail };
  if (safeImage) embed.image = { url: safeImage };
  return embed;
}

export async function discordEvent({
  channel = 'updates',
  title,
  description,
  type = 'info',
  fields = [],
  url,
  thumbnail,
  image,
  footer,
  wait = false,
}) {
  const webhook = CHANNELS[channel];
  if (!webhook) return { sent: false, skipped: true };

  const embed = buildEmbed({ title, description, type, fields, url, thumbnail, image, footer });

  try {
    const response = await fetch(`${webhook}${webhook.includes('?') ? '&' : '?'}wait=${wait ? 'true' : 'false'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BestRobux • Live',
        avatar_url: LOGO,
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(7000),
    });
    let data = null;
    if (wait && response.ok) {
      try { data = await response.json(); } catch {}
    }
    return { sent: response.ok, status: response.status, messageId: data?.id || null };
  } catch (error) {
    console.error('discordEvent:', error?.message || error);
    return { sent: false, error: 'discord_unavailable' };
  }
}

export async function updateDiscordMessage({ channel = 'updates', messageId, embed }) {
  const webhook = CHANNELS[channel];
  if (!webhook || !messageId) return { updated: false, skipped: true };
  try {
    const response = await fetch(`${webhook.split('?')[0]}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(7000),
    });
    return { updated: response.ok, status: response.status };
  } catch (error) {
    console.error('updateDiscordMessage:', error?.message || error);
    return { updated: false, error: 'discord_unavailable' };
  }
}

export async function deleteDiscordMessage({ channel = 'updates', messageId }) {
  const webhook = CHANNELS[channel];
  if (!webhook || !messageId) return { deleted: false, skipped: true };
  try {
    const response = await fetch(`${webhook.split('?')[0]}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(7000),
    });
    return { deleted: response.ok || response.status === 404, status: response.status };
  } catch (error) {
    console.error('deleteDiscordMessage:', error?.message || error);
    return { deleted: false, error: 'discord_unavailable' };
  }
}

export function isPublicDiscordEvent(event) {
  return PUBLIC_EVENTS.has(String(event || '').trim());
}

export { buildEmbed };

export async function broadcastEvent(payload) {
  const channels = payload.channels || ['updates'];
  const results = await Promise.allSettled(channels.map(channel => discordEvent({ ...payload, channel })));
  return results.map(r => r.status === 'fulfilled' ? r.value : { sent: false, error: 'dispatch_failed' });
}
