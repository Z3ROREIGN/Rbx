import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
const json=(res,status,body)=>res.status(status).json(body);
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 try{
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return json(res,401,{error:'Não autenticado.'});
  const url=env('SUPABASE_URL'),anonKey=env('SUPABASE_ANON_KEY');
  const anon=createClient(url,anonKey,{auth:{persistSession:false}});
  const {data:{user},error:ae}=await anon.auth.getUser(h.slice(7));
  if(ae||!user)return json(res,401,{error:'Sessão inválida.'});
  const db=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {data:allowed,error:pe}=await db.rpc('is_admin',{uid:user.id});
  if(pe)return json(res,500,{error:`Não foi possível verificar a permissão administrativa: ${pe.message}`});
  if(!allowed)return json(res,403,{error:'Acesso negado.'});
  const id=String(req.body?.orderId||'').trim(),status=String(req.body?.status||'').toUpperCase();
  const valid=['PROCESSING','DELIVERED','CANCELLED'];if(!id||!valid.includes(status))return json(res,400,{error:'Pedido ou status inválido.'});
  const {data:order,error:oe}=await db.from('orders').select('id,user_id,status').eq('id',id).single();
  if(oe||!order)return json(res,404,{error:'Pedido não encontrado.'});
  const transitions={PROCESSING:['PAID'],DELIVERED:['PROCESSING'],CANCELLED:['PENDING','PAID','PROCESSING']};
  if(!transitions[status].includes(order.status))return json(res,409,{error:`Não é possível alterar ${order.status} para ${status}.`});
  const now=new Date().toISOString();
  const patch={status,updated_at:now};
  if(status==='DELIVERED'){patch.delivered_at=now;patch.delivered_by=user.id}
  const {error:ue}=await db.from('orders').update(patch).eq('id',id);
  if(ue)return json(res,500,{error:`Não foi possível atualizar o pedido: ${ue.message}`});
  await db.from('admin_audit_logs').insert({admin_id:user.id,action:'ORDER_STATUS_CHANGED',target_user_id:order.user_id,metadata:{order_id:id,from:order.status,to:status},created_at:now});
  const messages={PROCESSING:['Pedido em processamento','Seu pedido foi recebido e está em processamento.'],DELIVERED:['Pedido enviado','Seu pedido foi marcado como entregue.'],CANCELLED:['Pedido cancelado','Seu pedido foi cancelado.']};
  const [title,message]=messages[status];
  await db.from('notifications').insert({user_id:order.user_id,title,message,type:'order',order_id:id});
  return json(res,200,{ok:true,status});
 }catch(e){console.error('admin-order-status',e);return json(res,500,{error:e?.message||'Erro interno.'});}
}
