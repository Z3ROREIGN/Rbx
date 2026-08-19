import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
const allowed=new Set(['profiles','direct_conversations','direct_messages','reports','support_tickets','support_messages','admin_audit_logs','admin_roles','site_settings','products','coupons']);
const filterable=['id','user_id','user_a','user_b','sender_id','ticket_id','conversation_id'];
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
 try{
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Não autenticado.'});
  const url=env('SUPABASE_URL'),anon=createClient(url,env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
  const {data:{user},error:ae}=await anon.auth.getUser(h.slice(7));if(ae||!user)return res.status(401).json({error:'Sessão inválida.'});
  const db=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {data:ok,error:pe}=await db.rpc('is_admin',{uid:user.id});if(pe)return res.status(500).json({error:'Não foi possível verificar a permissão administrativa.'});if(!ok)return res.status(403).json({error:'Acesso negado.'});
  const resource=String(req.query.resource||'');if(!allowed.has(resource))return res.status(400).json({error:'Recurso administrativo inválido.'});
  const limit=Math.min(Math.max(Number(req.query.limit)||500,1),1000);let q=db.from(resource).select('*');
  for(const key of filterable)if(req.query[key])q=q.eq(key,String(req.query[key]));
  if(req.query.ids){const ids=String(req.query.ids).split(',').filter(Boolean).slice(0,1000);if(ids.length)q=q.in('id',ids)}
  if(req.query.user_ids){const ids=String(req.query.user_ids).split(',').filter(Boolean).slice(0,1000);if(ids.length)q=q.in('user_id',ids)}
  if(req.query.sender_ids){const ids=String(req.query.sender_ids).split(',').filter(Boolean).slice(0,1000);if(ids.length)q=q.in('sender_id',ids)}
  const order=String(req.query.order||'created_at'),ascending=String(req.query.asc||'false')==='true';q=q.order(order,{ascending}).limit(limit);
  const {data,error}=await q;if(error)return res.status(500).json({error:error.message});
  return res.status(200).json({data:Array.isArray(data)?data:[]});
 }catch(e){console.error('admin-data',e);return res.status(500).json({error:e?.message||'Erro interno.'})}
}
