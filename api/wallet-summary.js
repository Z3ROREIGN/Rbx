import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
};

const service = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function getUser(token) {
  if (!token || token.length > 8192) throw Error('AUTH');
  const db = service();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw Error('AUTH');
  return data.user;
}

const sum = (rows, field) => rows.reduce((n, x) => n + Number(x?.[field] || 0), 0);
const upper = x => String(x || '').toUpperCase();

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const user = await getUser(token);
    const db = service();

    // Do not call get_wallet_summary here. It depends on auth.uid() and can
    // stall/fail when invoked from a service-side connection. The account and
    // ledger are authoritative and are queried in parallel using service role,
    // always constrained to the authenticated user's id.
    const [acc, deps, withs, tx, med] = await Promise.all([
      db.from('wallet_accounts').select('balance,updated_at').eq('user_id', user.id).maybeSingle(),
      db.from('wallet_deposits').select('amount,fee,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      db.from('wallet_withdrawals').select('amount,fee,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      db.from('wallet_transactions').select('id,type,amount,fee,reference_id,description,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      db.from('med_cases').select('id,user_id,amount,status,reason,justification,review_reason,created_at,updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    ]);

    for (const q of [acc, deps, withs, tx, med]) if (q.error) throw q.error;

    const deposits = deps.data || [];
    const withdrawals = withs.data || [];
    const transactions = tx.data || [];
    const medCases = med.data || [];
    const balance = Number(acc.data?.balance || 0);
    const pendingMed = sum(medCases.filter(x => ['AWAITING_JUSTIFICATION', 'UNDER_REVIEW'].includes(upper(x.status))), 'amount');
    const pendingWithdrawals = sum(withdrawals.filter(x => ['PENDING', 'PROCESSING'].includes(upper(x.status))), 'amount');

    // Negative balances remain negative. Pending commitments reduce what can
    // be withdrawn, but never turn a real negative balance into zero/positive.
    const available = Math.min(balance, balance - pendingMed - pendingWithdrawals);
    const summary = {
      balance,
      available,
      pending_med: pendingMed,
      pending_withdrawals: pendingWithdrawals,
      total_deposits: sum(deposits.filter(x => upper(x.status) === 'PAID'), 'amount'),
      total_withdrawals: sum(withdrawals.filter(x => upper(x.status) === 'PAID'), 'amount'),
      updated_at: acc.data?.updated_at || null,
    };

    return json(res, 200, { summary, transactions, deposits, withdrawals, medCases });
  } catch (e) {
    if (e.message !== 'AUTH') console.error('wallet-summary', e);
    return json(res, e.message === 'AUTH' ? 401 : 500, {
      error: e.message === 'AUTH' ? 'Sua sessão expirou. Atualize a página ou entre novamente.' : 'Não foi possível carregar a carteira agora.'
    });
  }
}
