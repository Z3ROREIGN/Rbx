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

function field(name, value, inline = true) {
  const text = clean(value, 1024);
  return text ? { name: clean(name, 256), value: text, inline } : null;
}

export async function discordEvent({
  channel = 'updates',
  title = 'BestRobux • Atualização',
  description = '',
  type = 'info',
  fields = [],
  url,
  thumbnail,
  image,
  footer = 'BestRobux • Monitoramento em tempo real',
}) {
  const webhook = CHANNELS[channel];
  if (!webhook) return { sent: false, skipped: true };

  const safeFields = fields.map(f => field(f.name, f.value, f.inline !== false)).filter(Boolean).slice(0, 25);
  const safeUrl = validUrl(url);
  const safeThumbnail = validUrl(thumbnail);
  const safeImage = validUrl(image);

  const embed = {
    title: clean(title, 256),
    description: clean(description, 4096),
    color: COLORS[type] || COLORS.info,
    fields: safeFields,
    timestamp: new Date().toISOString(),
    footer: { text: clean(footer, 2048) },
  };
  if (safeUrl) embed.url = safeUrl;
  if (safeThumbnail) embed.thumbnail = { url: safeThumbnail };
  if (safeImage) embed.image = { url: safeImage };

  try {
    const response = await fetch(webhook, {
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
    return { sent: response.ok, status: response.status };
  } catch (error) {
    console.error('discordEvent:', error?.message || error);
    return { sent: false, error: 'discord_unavailable' };
  }
}

export async function broadcastEvent(payload) {
  const channels = payload.channels || ['updates'];
  const results = await Promise.allSettled(channels.map(channel => discordEvent({ ...payload, channel })));
  return results.map(r => r.status === 'fulfilled' ? r.value : { sent: false, error: 'dispatch_failed' });
}
