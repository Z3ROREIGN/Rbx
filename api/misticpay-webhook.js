import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const status = String(body.status || '').toUpperCase();
    const transactionId = String(body.transactionId || '');
    if (!transactionId) return res.status(400).json({ error: 'transactionId ausente' });

    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: order } = await admin.from('orders').select('id,amount,status,payment_transaction_id').or(`payment_transaction_id.eq.${transactionId},payment_transaction_id.eq.${body.clientTransactionId || transactionId}`).maybeSingle();
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    let nextStatus = order.status;
    if (status === 'COMPLETO') nextStatus = 'PAID';
    else if (['FALHA','CANCELADO'].includes(status)) nextStatus = status === 'FALHA' ? 'FAILED' : 'CANCELLED';
    await admin.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Webhook error' });
  }
}
