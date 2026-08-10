import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const body = req.body || {};
    const transactionId = String(body.transactionId || body?.data?.transactionId || body?.transaction?.transactionId || '');
    if (!transactionId) return res.status(400).json({ error: 'transactionId ausente.' });

    // O webhook nunca é considerado prova suficiente sozinho: o status é confirmado na API.
    const check = await fetch('https://api.misticpay.com/api/transactions/check', {
      method: 'POST',
      headers: { ci: process.env.MISTICPAY_CLIENT_ID, cs: process.env.MISTICPAY_CLIENT_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId })
    });
    const verified = await check.json();
    const tx = verified?.transaction || verified?.data;
    if (!check.ok || !tx) return res.status(400).json({ error: 'Transação não pôde ser verificada.' });

    const state = String(tx.transactionState || tx.status || '').toUpperCase();
    const nextStatus = state === 'COMPLETO' ? 'PAID' : state === 'FALHA' ? 'FAILED' : state === 'CANCELADO' ? 'CANCELLED' : 'PENDING';
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await supabase.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('payment_transaction_id', transactionId);
    if (error) throw error;
    return res.status(200).json({ received: true, status: nextStatus });
  } catch (error) {
    console.error('webhook:', error);
    return res.status(500).json({ error: 'Webhook não processado.' });
  }
}
