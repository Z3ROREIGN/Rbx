import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const webhookStatus = String(body.status || '').toUpperCase();
    const transactionId = String(body.transactionId || '').trim();
    if (!transactionId) return res.status(400).json({ error: 'transactionId ausente' });

    const check = await fetch('https://api.misticpay.com/api/transactions/check', {
      method: 'POST',
      headers: { ci: process.env.MISTICPAY_CLIENT_ID || '', cs: process.env.MISTICPAY_CLIENT_SECRET || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId })
    });
    const verified = await check.json().catch(() => ({}));
    const verifiedState = String(verified?.transaction?.transactionState || '').toUpperCase();
    if (!check.ok || !verified?.transaction) return res.status(202).json({ ok: true, ignored: true });

    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: order } = await admin.from('orders').select('id,amount,status,payment_transaction_id').eq('payment_transaction_id', transactionId).maybeSingle();
    if (!order) return res.status(200).json({ ok: true, ignored: true });

    const amount = Number(verified.transaction.value);
    if (!Number.isFinite(amount) || Math.abs(amount - Number(order.amount)) > 0.009) return res.status(409).json({ error: 'Valor da transação não corresponde ao pedido.' });

    let nextStatus = order.status;
    if (verifiedState === 'COMPLETO' && webhookStatus !== 'FALHA') nextStatus = 'PAID';
    else if (verifiedState === 'FALHA') nextStatus = 'FAILED';
    else if (verifiedState === 'CANCELADO') nextStatus = 'CANCELLED';
    if (nextStatus !== order.status) await admin.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Webhook error' });
  }
}
