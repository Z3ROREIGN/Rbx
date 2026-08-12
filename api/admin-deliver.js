import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  try{
    const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Não autenticado.'});
    const anon=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
    const {data:{user},error:authError}=await anon.auth.getUser(h.slice(7));
    if(authError||!user)return res.status(401).json({error:'Sessão inválida.'});
    const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
    const {data:allowed,error:ae}=await db.rpc('is_admin',{uid:user.id});
    if(ae)return res.status(500).json({error:'Não foi possível verificar a permissão administrativa.'});
    if(!allowed)return res.status(403).json({error:'Acesso negado.'});
    const id=String(req.body?.orderId||'').trim(),note=String(req.body?.deliveryNote||'').trim();if(!id)return res.status(400).json({error:'Pedido inválido.'});
    const {data:order,error:oe}=await db.from('orders').select('id,status').eq('id',id).single();if(oe||!order)return res.status(404).json({error:'Pedido não encontrado.'});
    if(!['PAID','PROCESSING'].includes(order.status))return res.status(409).json({error:'Somente pedidos pagos ou em processamento podem ser entregues.'});
    const now=new Date().toISOString();const {error}=await db.from('orders').update({status:'DELIVERED',delivery_note:note||null,delivered_at:now,delivered_by:user.id,updated_at:now}).eq('id',id);
    if(error)return res.status(500).json({error:error.message||'Não foi possível confirmar a entrega.'});
    return res.status(200).json({ok:true,status:'DELIVERED'});
  }catch(e){console.error('admin-deliver',e);return res.status(500).json({error:e?.message||'Erro interno.'});}
}
