import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
 try{
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Não autenticado.'});
  const url=env('SUPABASE_URL'),anon=createClient(url,env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
  const {data:{user},error:ae}=await anon.auth.getUser(h.slice(7));if(ae||!user)return res.status(401).json({error:'Sessão inválida.'});
  const db=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {data:allowed,error:pe}=await db.rpc('is_admin',{uid:user.id});if(pe)return res.status(500).json({error:'Não foi possível verificar a permissão administrativa.'});if(!allowed)return res.status(403).json({error:'Acesso negado.'});
  const {data,error}=await db.from('profiles').select('id,display_name,username,roblox_username,avatar_url,account_status,suspended_until,moderation_reason,created_at').order('created_at',{ascending:false}).limit(1000);if(error)return res.status(500).json({error:'Não foi possível carregar os usuários.'});
  return res.status(200).json({users:Array.isArray(data)?data:[]});
 }catch(e){console.error('admin-users',e);return res.status(500).json({error:e?.message||'Erro interno.'})}
}
