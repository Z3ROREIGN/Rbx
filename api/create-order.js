import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').json(body);

function cpfDigits(value = '') { return String(value).replace(/\D/g, '').slice(0, 11); }
function validCPF(value) {
  const d = cpfDigits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  if (digit !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  return digit === Number(d[10]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { name, cpf, email, robloxUsername, quantity, type } = req.body || {};
  const qty = Number(quantity);
  const normalizedType = type === 'Robux Plus' ? 'Robux Plus' : 'Gamepass';

  if (!name || String(name).trim().split(/\s+/).length < 2) return json(res, 400, { error: 'Nome completo inválido.' });
  if (!validCPF(cpf)) return json(res, 400, { error: 'CPF inválido.' });
  if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return json(res, 400, { error: 'E-mail inválido.' });
  if (!robloxUsername || String(robloxUsername).trim().length < 3) return json(res, 400, { error: 'Usuário do Roblox inválido.' });
  if (!Number.isInteger(qty) || qty < 1000 || qty > 50000 || qty % 1000 !== 0) return json(res, 400, { error: 'Quantidade inválida.' });

  const unitPrice = normalizedType === 'Gamepass' ? 26 : 40;
  const amount = Number((qty / 1000 * unitPrice).toFixed(2));

  // Secret keys are read only on the server. Never expose these variables to browser code.
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Backend não configurado.' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('orders').insert({
    customer_name: String(name).trim(),
    customer_cpf: cpfDigits(cpf),
    customer_email: String(email).trim().toLowerCase(),
    roblox_username: String(robloxUsername).trim(),
    quantity: qty,
    product_type: normalizedType,
    amount,
    status: 'pending'
  }).select('id,amount,status,created_at').single();

  if (error) return json(res, 500, { error: 'Não foi possível criar o pedido.' });

  // Payment provider integration belongs here. Credentials are intentionally not stored in source control.
  // Configure MISTICPAY_CLIENT_ID / MISTICPAY_CLIENT_SECRET in the hosting environment.
  return json(res, 201, { order: data, payment: null });
}
