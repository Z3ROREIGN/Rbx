import { createClient } from '@supabase/supabase-js';
const env=n=>{if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]};
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  try{
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer '))return res.status(401).json({error:'Não autenticado.'});
    const anon=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
    const {data:{user},error:authError}=await anon.auth.getUser(h.slice(7));
    if(authError||!user)return res.status(401).json({error:'Sessão inválida.'});
    const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
    const {data:profile,error:pe}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
    if(pe){console.error('admin-orders profile:',pe);return res.status(500).json({error:'Não foi possível verificar o administrador.'});}
    if(!profile?.is_admin)return res.status(403).json({error:'Acesso negado.'});
    const {data,error}=await db.from('orders').select('id,user_id,robux,method,amount,status,roblox_username,payer_name,payer_document,gamepass_url,created_at,updated_at,delivered_at,delivered_by').order('created_at',{ascending:false}).limit(200);
    if(error){console.error('admin-orders orders:',error);return res.status(500).json({error:'Não foi possível carregar os pedidos.'});}
    return res.status(200).json({orders:Array.isArray(data)?data:[]});
  }catch(e){console.error('admin-orders:',e);return res.status(500).json({error:'Erro interno.'});}
}
