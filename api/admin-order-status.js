import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
 try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Não autenticado.'});
 const anon=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});const {data:{user},error:ae}=await anon.auth.getUser(h.slice(7));if(ae||!user)return res.status(401).json({error:'Sessão inválida.'});
 const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});const {data:allowed,error:pe}=await db.rpc('is_admin',{uid:user.id});if(pe)return res.status(500).json({error:'Não foi possível verificar a permissão administrativa.'});if(!allowed)return res.status(403).json({error:'Acesso negado.'});
 const id=String(req.body?.orderId||'').trim(),status=String(req.body?.status||'').toUpperCase();if(!id||!['PROCESSING','CANCELLED'].includes(status))return res.status(400).json({error:'Pedido ou status inválido.'});
 const {data:order,error:oe}=await db.from('orders').select('id,user_id,status').eq('id',id).single();if(oe||!order)return res.status(404).json({error:'Pedido não encontrado.'});
 const allowedTransitions={PROCESSING:['PAID'],CANCELLED:['PENDING','PAID','PROCESSING']};if(!allowedTransitions[status].includes(order.status))return res.status(409).json({error:`Não é possível alterar ${order.status} para ${status}.`});
 const now=new Date().toISOString();const {error}=await db.from('orders').update({status,updated_at:now}).eq('id',id);if(error)return res.status(500).json({error:error.message||'Não foi possível atualizar o pedido.'});
 await db.from('admin_audit_logs').insert({admin_id:user.id,action:'ORDER_STATUS_CHANGED',target_user_id:order.user_id,metadata:{order_id:id,from:order.status,to:status},created_at:now});
 await db.from('notifications').insert({user_id:order.user_id,title:status==='CANCELLED'?'Pedido cancelado':'Pedido em processamento',message:status==='CANCELLED'?'Seu pedido foi cancelado.':'Seu pedido foi recebido e está em processamento.',type:'order',order_id:id});
 return res.status(200).json({ok:true,status});
 }catch(e){console.error('admin-order-status',e);return res.status(500).json({error:e?.message||'Erro interno.'});}
}
