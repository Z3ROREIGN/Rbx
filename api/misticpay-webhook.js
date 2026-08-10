import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const transactionId = String(body.transactionId || '').trim();
    if (!transactionId) return res.status(400).json({ error: 'transactionId ausente' });

    // Verify the webhook against MisticPay before changing the order.
    const check = await fetch('https://api.misticpay.com/api/transactions/check', {
      method: 'POST',
      headers: { ci: process.env.MISTICPAY_CLIENT_ID || '', cs: process.env.MISTICPAY_CLIENT_SECRET || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId })
    });
    const verified = await check.json().catch(() => ({}));
    const tx = verified?.transaction;
    if (!check.ok || !tx) return res.status(202).json({ ok: true, ignored: true });

    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: order, error: findError } = await admin.from('orders').select('id,amount,status,payment_transaction_id').eq('payment_transaction_id', transactionId).maybeSingle();
    if (findError) return res.status(500).json({ error: 'Não foi possível localizar o pedido.' });
    if (!order) return res.status(200).json({ ok: true, ignored: true });

    const paidAmount = Number(tx.value);
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(order.amount)) > 0.009) return res.status(409).json({ error: 'Valor da transação não corresponde ao pedido.' });

    const state = String(tx.transactionState || body.status || '').toUpperCase();
    const nextStatus = state === 'COMPLETO' ? 'PAID' : state === 'FALHA' ? 'FAILED' : state === 'CANCELADO' ? 'CANCELLED' : 'PENDING';
    if (nextStatus !== order.status) {
      const { error } = await admin.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (error) return res.status(500).json({ error: 'Não foi possível atualizar o pedido.' });
    }
    return res.status(200).json({ ok: true, status: nextStatus });
  } catch (error) {
    console.error('misticpay-webhook:', error);
    return res.status(500).json({ error: 'Webhook error' });
  }
}
