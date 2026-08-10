import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const body = req.body || {};
    const transactionId = String(body.transactionId || '');
    if (!transactionId) return res.status(400).json({ error: 'transactionId ausente.' });

    // Confirma o status diretamente na MisticPay antes de liberar o pedido.
    const check = await fetch('https://api.misticpay.com/api/transactions/check', {
      method: 'POST',
      headers: { ci: process.env.MISTICPAY_CLIENT_ID, cs: process.env.MISTICPAY_CLIENT_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId })
    });
    const verified = await check.json();
    const tx = verified?.transaction || verified?.data;
    if (!check.ok || !tx) return res.status(400).json({ error: 'Transação não pôde ser verificada.' });

    const status = tx.transactionState || tx.status;
    const nextStatus = status === 'COMPLETO' ? 'PAID' : status === 'FALHA' ? 'FAILED' : status === 'CANCELADO' ? 'CANCELLED' : 'PENDING';
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('payment_transaction_id', transactionId);
    if (error) throw error;
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Webhook não processado.' });
  }
}
