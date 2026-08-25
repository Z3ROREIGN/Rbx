import { createClient } from '@supabase/supabase-js';

const out = (res, status, body) => res.status(status).json(body);
const admin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function getUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Error('AUTH');
  const a = authClient();
  const { data, error } = await a.auth.getUser(token);
  if (error || !data.user) throw Error('AUTH');
  return data.user;
}

async function requireAdmin(req) {
  const user = await getUser(req);
  const a = admin();
  const { data: role, error } = await a.from('admin_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  const normalizedRole = String(role?.role || '').toUpperCase();
  if (!['LIDER', 'ADMINISTRADOR'].includes(normalizedRole)) throw Error('FORBIDDEN');
  return { user, a, role: normalizedRole };
}

// Seller application contains sensitive personal data. Only the leader receives
// the original values. Administrators can still approve/reject/manage the request,
// but the API never sends CPF, birth date, e-mail or phone to them.
function sanitizeApplications(rows, role) {
  if (role === 'LIDER') return rows || [];
  return (rows || []).map(x => ({
    id: x.id,
    user_id: x.user_id,
    full_name: x.full_name ? String(x.full_name).replace(/(^|\s)(\S)(\S+)/g, (_, p, a, b) => `${p}${a}${'*'.repeat(Math.max(2, Math.min(4, b.length)))}`) : 'Solicitante',
    birth_date: null,
    cpf: null,
    email: null,
    phone: null,
    status: x.status,
    reviewed_by: x.reviewed_by,
    reviewed_at: x.reviewed_at,
    rejection_reason: x.rejection_reason,
    created_at: x.created_at,
    updated_at: x.updated_at,
    sensitive_data_hidden: true
  }));
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return out(res, 405, { error: 'Método não permitido.' });
    const { user, a, role } = await requireAdmin(req);
    const action = String(req.body?.action || (req.method === 'GET' ? 'dashboard' : ''));

    if (action === 'dashboard') {
      const [apps, withdrawals, orders, archives, products] = await Promise.all([
        a.from('seller_applications').select('*').order('created_at', { ascending: false }).limit(500),
        a.from('wallet_withdrawals').select('*').order('created_at', { ascending: false }).limit(500),
        a.from('marketplace_orders').select('*, marketplace_products(title,image_url)').order('created_at', { ascending: false }).limit(500),
        a.from('marketplace_chat_archives').select('id,order_id,ciphertext,archived_at,archived_by_system').order('archived_at', { ascending: false }).limit(500),
        a.from('marketplace_products').select('*').order('created_at', { ascending: false }).limit(500)
      ]);
      for (const q of [apps, withdrawals, orders, archives, products]) if (q.error) throw q.error;
      return out(res, 200, {
        role,
        applications: sanitizeApplications(apps.data, role),
        withdrawals: withdrawals.data || [],
        orders: orders.data || [],
        archives: archives.data || [],
        products: products.data || []
      });
    }

    if (action === 'review-seller') {
      const id = String(req.body.id || '');
      const status = String(req.body.status || '').toUpperCase();
      if (!id || !['APPROVED', 'REJECTED'].includes(status)) return out(res, 400, { error: 'Dados da análise inválidos.' });
      const { data: application, error: findError } = await a.from('seller_applications').select('id,status').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!application) return out(res, 404, { error: 'Solicitação não encontrada.' });
      const { error } = await a.from('seller_applications').update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: status === 'REJECTED' ? String(req.body.reason || 'Não aprovado pela equipe.') : null,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
      return out(res, 200, { ok: true });
    }

    if (action === 'update-product') {
      const id = String(req.body.id || '');
      if (!id) return out(res, 400, { error: 'Produto inválido.' });
      const patch = {};
      if (req.body.title !== undefined) patch.title = String(req.body.title).trim();
      if (req.body.description !== undefined) patch.description = String(req.body.description).trim();
      if (req.body.category !== undefined) patch.category = String(req.body.category).trim() || 'Outros';
      if (req.body.price !== undefined) { const price = Number(req.body.price); if (!Number.isFinite(price) || price <= 0) return out(res, 400, { error: 'Preço inválido.' }); patch.price = Math.round(price * 100) / 100; }
      if (req.body.quantity !== undefined) { const quantity = Number(req.body.quantity); if (!Number.isInteger(quantity) || quantity < 0) return out(res, 400, { error: 'Quantidade inválida.' }); patch.quantity = quantity; if (quantity === 0) patch.active = false; }
      if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
      if (req.body.image_url !== undefined) patch.image_url = req.body.image_url ? String(req.body.image_url) : null;
      if (req.body.delivery_type !== undefined) patch.delivery_type = req.body.delivery_type === 'DIGITAL' ? 'DIGITAL' : 'CHAT';
      patch.updated_at = new Date().toISOString();
      const { data, error } = await a.from('marketplace_products').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return out(res, 200, { product: data });
    }

    if (action === 'delete-product') {
      const id = String(req.body.id || '');
      if (!id) return out(res, 400, { error: 'Produto inválido.' });
      const { count, error: countError } = await a.from('marketplace_orders').select('id', { count: 'exact', head: true }).eq('product_id', id).in('status', ['PAID', 'DELIVERING', 'BUYER_CONFIRMED', 'SELLER_CONFIRMED']);
      if (countError) throw countError;
      if ((count || 0) > 0) return out(res, 409, { error: 'Este produto possui pedidos ativos e não pode ser excluído. Desative-o.' });
      const { error } = await a.from('marketplace_products').delete().eq('id', id);
      if (error) throw error;
      return out(res, 200, { ok: true });
    }

    if (action === 'withdrawal') {
      const id = String(req.body.id || '');
      const status = String(req.body.status || '').toUpperCase();
      if (!id || !['PROCESSING', 'PAID', 'REJECTED'].includes(status)) return out(res, 400, { error: 'Status de saque inválido.' });
      const { data: w, error: findError } = await a.from('wallet_withdrawals').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!w) return out(res, 404, { error: 'Saque não encontrado.' });
      if (w.status === 'PAID' && status !== 'PAID') return out(res, 409, { error: 'Um saque já pago não pode voltar de status.' });
      const { data: updated, error } = await a.from('wallet_withdrawals').update({ status, reviewed_by: user.id, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      if (status === 'REJECTED' && w.status !== 'REJECTED') {
        const { count, error: txError } = await a.from('wallet_transactions').select('id', { count: 'exact', head: true }).eq('reference_id', id).eq('type', 'REFUND');
        if (txError) throw txError;
        if ((count || 0) === 0) {
          const refund = Number(w.amount) + Number(w.fee || 0);
          const { data: acc, error: accError } = await a.from('wallet_accounts').select('balance').eq('user_id', w.user_id).maybeSingle();
          if (accError) throw accError;
          if (acc) {
            const { error: balanceError } = await a.from('wallet_accounts').update({ balance: Number(acc.balance) + refund, updated_at: new Date().toISOString() }).eq('user_id', w.user_id);
            if (balanceError) throw balanceError;
          } else {
            const { error: createError } = await a.from('wallet_accounts').insert({ user_id: w.user_id, balance: refund });
            if (createError) throw createError;
          }
          const { error: refundError } = await a.from('wallet_transactions').insert({ user_id: w.user_id, type: 'REFUND', amount: refund, fee: 0, reference_id: id, description: 'Estorno de saque recusado' });
          if (refundError) throw refundError;
        }
      }
      return out(res, 200, { withdrawal: updated });
    }

    if (action === 'order-status') {
      const id = String(req.body.id || '');
      const status = String(req.body.status || '').toUpperCase();
      const allowed = ['PENDING_PAYMENT', 'PAID', 'DELIVERING', 'BUYER_CONFIRMED', 'SELLER_CONFIRMED', 'COMPLETED', 'CANCELLED', 'DISPUTED'];
      if (!id || !allowed.includes(status)) return out(res, 400, { error: 'Status de pedido inválido.' });
      const { data, error } = await a.from('marketplace_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('*, marketplace_products(title,image_url)').single();
      if (error) throw error;
      return out(res, 200, { order: data });
    }

    if (action === 'orders') {
      const { data, error } = await a.from('marketplace_orders').select('*, marketplace_products(title,image_url)').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return out(res, 200, { orders: data || [] });
    }

    if (action === 'archives') {
      const { data, error } = await a.from('marketplace_chat_archives').select('id,order_id,ciphertext,archived_at,archived_by_system').order('archived_at', { ascending: false }).limit(500);
      if (error) throw error;
      return out(res, 200, { archives: data || [] });
    }

    return out(res, 400, { error: 'Ação inválida.' });
  } catch (e) {
    console.error('admin-marketplace', e);
    return out(res, e.message === 'AUTH' ? 401 : e.message === 'FORBIDDEN' ? 403 : 500, { error: e.message === 'AUTH' ? 'Faça login.' : e.message === 'FORBIDDEN' ? 'Sem permissão.' : e.message || 'Erro interno.' });
  }
}
