import { createClient } from '@supabase/supabase-js';
const out=(res,status,body)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body)};
const publicDb=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const adminDb=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function getUser(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();if(!token||token.length>8192)throw Error('AUTH');const {data,error}=await publicDb().auth.getUser(token);if(error||!data.user)throw Error('AUTH');return data.user}
export default async function handler(req,res){if(req.method!=='GET')return out(res,405,{error:'Método não permitido.'});try{const user=await getUser(req),db=adminDb();const {data:summary,error:se}=await db.rpc('get_wallet_summary');if(se)throw se;const [{data:tx,error:te},{data:deps,error:de},{data:withs,error:we},{data:med,error:me}]=await Promise.all([
 db.from('wallet_transactions').select('id,type,amount,fee,reference_id,description,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
 db.from('wallet_deposits').select('id,amount,fee,status,payment_transaction_id,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
 db.from('wallet_withdrawals').select('id,amount,fee,status,pix_key,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
 db.from('med_cases').select('id,amount,status,reason,justification,review_reason,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20)
]);if(te)throw te;if(de)throw de;if(we)throw we;if(me)throw me;return out(res,200,{summary:summary||{},transactions:tx||[],deposits:deps||[],withdrawals:withs||[],medCases:med||[]})}catch(e){console.error('wallet-summary',e);return out(res,e.message==='AUTH'?401:500,{error:e.message==='AUTH'?'Faça login novamente.':'Não foi possível carregar a carteira agora.'})}}
