import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => res.status(status).json(body);
const digits = (value = '') => String(value).replace(/\D/g, '').slice(0, 11);
function validCPF(value) {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === +d[10];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const cpf = digits(body.cpf);
    const email = String(body.email || '').trim().toLowerCase();
    const robloxUsername = String(body.robloxUsername || '').trim();
    const quantity = Number(body.quantity);
    const type = body.type === 'Robux Plus' ? 'Robux Plus' : 'Gamepass';

    if (name.split(/\s+/).length < 2) return json(res, 400, { error: 'Informe o nome completo.' });
    if (!validCPF(cpf)) return json(res, 400, { error: 'Informe um CPF válido.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Informe um e-mail válido.' });
    if (!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)) return json(res, 400, { error: 'Usuário do Roblox inválido.' });
    if (!Number.isInteger(quantity) || quantity < 1000 || quantity > 50000 || quantity % 1000 !== 0) return json(res, 400, { error: 'Quantidade inválida.' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Backend não configurado.' });

    const amount = Number((quantity / 1000 * (type === 'Gamepass' ? 26 : 40)).toFixed(2));
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.from('orders').insert({ customer_name: name, customer_cpf: cpf, customer_email: email, roblox_username: robloxUsername, quantity, product_type: type, amount, status: 'pending' }).select('id,amount,status,created_at').single();
    if (error) return json(res, 500, { error: 'Não foi possível criar o pedido.', detail: error.message });

    // The payment provider must be called here using server-only environment variables.
    // Never move these credentials into frontend code.
    return json(res, 201, { order: data, payment: null, next: 'payment_provider' });
  } catch (error) {
    return json(res, 500, { error: 'Erro interno ao criar o pedido.' });
  }
}
