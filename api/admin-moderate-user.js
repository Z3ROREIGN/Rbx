import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
 try{
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Não autenticado.'});
  const url=env('SUPABASE_URL');
  const anon=createClient(url,env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
  const {data:{user},error:ae}=await anon.auth.getUser(h.slice(7));
  if(ae||!user)return res.status(401).json({error:'Sessão inválida.'});
  const db=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {data:role,error:re}=await db.from('admin_roles').select('role').eq('user_id',user.id).maybeSingle();
  if(re)return res.status(500).json({error:'Não foi possível verificar o cargo.'});
  if(!role||!['LIDER','ADMINISTRADOR'].includes(role.role))return res.status(403).json({error:'Seu cargo não possui permissão para aplicar punições.'});
  const {target,new_status,reason,until_at}=req.body||{};
  if(!target||!['ACTIVE','SUSPENDED','BANNED'].includes(new_status))return res.status(400).json({error:'Dados de punição inválidos.'});
  if(new_status==='SUSPENDED'&&(!until_at||new Date(until_at)<=new Date()))return res.status(400).json({error:'A data da suspensão deve estar no futuro.'});
  if(target===user.id)return res.status(400).json({error:'Você não pode aplicar punição na própria conta.'});
  const {data:targetRole}=await db.from('admin_roles').select('role').eq('user_id',target).maybeSingle();
  if(targetRole?.role==='LIDER')return res.status(403).json({error:'A conta de um Líder não pode ser punida.'});
  const cleanReason=String(reason||'').trim().slice(0,1000)||null;
  const expires=new_status==='SUSPENDED'?new Date(until_at).toISOString():null;
  const {data:updated,error:ue}=await db.from('profiles').update({account_status:new_status,suspended_until:expires,moderation_reason:cleanReason,updated_at:new Date().toISOString()}).eq('id',target).select('id,account_status,suspended_until,moderation_reason').maybeSingle();
  if(ue)return res.status(500).json({error:ue.message});
  if(!updated)return res.status(404).json({error:'Usuário não encontrado.'});
  const action=new_status==='BANNED'?'BAN':new_status==='SUSPENDED'?'SUSPEND':'UNSUSPEND';
  const {error:ae2}=await db.from('account_actions').insert({user_id:target,action,reason:cleanReason,expires_at:expires,performed_by:user.id,created_at:new Date().toISOString()});
  if(ae2)return res.status(500).json({error:'Punição aplicada, mas não foi possível registrar a auditoria da ação.'});
  const {error:le}=await db.from('admin_audit_logs').insert({admin_id:user.id,action:'USER_STATUS_CHANGED',target_user_id:target,metadata:{status:new_status,reason:cleanReason,until_at:expires},created_at:new Date().toISOString()});
  if(le)return res.status(500).json({error:'Punição aplicada, mas não foi possível registrar o log administrativo.'});
  return res.status(200).json({ok:true,user:updated});
 }catch(e){console.error('admin-moderate-user',e);return res.status(500).json({error:e?.message||'Erro interno.'})}
}
