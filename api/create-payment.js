import { createClient } from '@supabase/supabase-js';

const PRICES = { 'Gamepass': 26, 'Robux Plus': 40 };
const json = (res, status, body) => res.status(status).setHeader('Content-Type','application/json').json(body);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(res, 401, { error: 'Sessão não encontrada.' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json(res, 401, { error: 'Sessão inválida.' });

    const { robux, method, robloxUsername, payerName, payerDocument } = req.body || {};
    const qty = Number(robux);
    if (!Number.isInteger(qty) || qty < 1000 || qty > 50000 || qty % 1000 !== 0) return json(res, 400, { error: 'Quantidade inválida.' });
    if (!Object.prototype.hasOwnProperty.call(PRICES, method)) return json(res, 400, { error: 'Método inválido.' });
    if (!robloxUsername || !payerName || !payerDocument) return json(res, 400, { error: 'Preencha usuário Roblox, nome e CPF.' });

    const amount = Number(((qty / 1000) * PRICES[method]).toFixed(2));
    const orderId = crypto.randomUUID();
    const transactionId = `BR-${orderId}`;

    const payment = await fetch('https://api.misticpay.com/api/transactions/create', {
      method: 'POST',
      headers: { ci: process.env.MISTICPAY_CLIENT_ID, cs: process.env.MISTICPAY_CLIENT_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payerName: String(payerName).slice(0, 100),
        payerDocument: String(payerDocument).replace(/\D/g, ''),
        transactionId,
        description: `Best Robux - ${qty} Robux - ${method}`,
        projectWebhook: process.env.MISTICPAY_WEBHOOK_URL
      })
    });
    const data = await payment.json();
    if (!payment.ok || !data?.data) return json(res, 502, { error: data?.message || 'Não foi possível criar o PIX.' });

    const d = data.data;
    const { error: insertError } = await supabase.from('orders').insert({
      id: orderId,
      user_id: authData.user.id,
      robux: qty,
      method,
      amount,
      roblox_username: String(robloxUsername).slice(0, 50),
      status: d.transactionState === 'COMPLETO' ? 'PAID' : 'PENDING',
      payment_transaction_id: String(d.transactionId),
      pix_copy_paste: d.copyPaste || null,
      pix_qr_code: d.qrCodeBase64 || d.qrcodeUrl || null
    });
    if (insertError) return json(res, 500, { error: 'Pagamento criado, mas não foi possível salvar o pedido.' });

    return json(res, 200, { orderId, transactionId: d.transactionId, amount, status: d.transactionState, copyPaste: d.copyPaste, qrCode: d.qrCodeBase64 || d.qrcodeUrl });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Erro interno ao criar pagamento.' });
  }
}
