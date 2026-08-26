import { createClient } from '@supabase/supabase-js';

const json=(res,status,body)=>{res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body)};
const client=(key,token)=>createClient(process.env.SUPABASE_URL,key,{auth:{persistSession:false},global:token?{headers:{Authorization:`Bearer ${token}`}}:undefined});
async function getUser(token){if(!token||token.length>8192)throw Error('AUTH');const {data,error}=await client(process.env.SUPABASE_ANON_KEY,token).auth.getUser(token);if(error||!data.user)throw Error('AUTH');return data.user}
const sum=(rows,field)=>rows.reduce((n,x)=>n+Number(x?.[field]||0),0);
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Método não permitido.'});try{
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 const user=await getUser(token);const userDb=client(process.env.SUPABASE_ANON_KEY,token);const adminDb=client(process.env.SUPABASE_SERVICE_ROLE_KEY);
 let summary=null;
 const rpc=await userDb.rpc('get_wallet_summary');
 if(!rpc.error&&rpc.data)summary=Array.isArray(rpc.data)?rpc.data[0]||{}:rpc.data;
 const [acc,deps,withs,tx,med]=await Promise.all([
  adminDb.from('wallet_accounts').select('balance,updated_at').eq('user_id',user.id).maybeSingle(),
  adminDb.from('wallet_deposits').select('amount,fee,status').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
  adminDb.from('wallet_withdrawals').select('amount,fee,status').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
  adminDb.from('wallet_transactions').select('id,type,amount,fee,reference_id,description,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
  adminDb.from('wallet_med_cases').select('id,amount,status,reason,justification,decision_reason,created_at,updated_at,blocked_amount,outstanding_amount').eq('claimant_id',user.id).order('created_at',{ascending:false}).limit(100)
 ]);
 for(const q of [acc,deps,withs,tx,med])if(q.error)throw q.error;
 const deposits=deps.data||[],withdrawals=withs.data||[],transactions=tx.data||[],medCases=med.data||[];
 if(!summary){const balance=Number(acc.data?.balance||0),pendingMed=sum(medCases.filter(x=>['awaiting_justification','under_review','approved'].includes(x.status)),'blocked_amount');const pendingWithdrawals=sum(withdrawals.filter(x=>['PENDING','PROCESSING','UNDER_REVIEW'].includes(String(x.status).toUpperCase())),'amount');summary={balance,available:Math.max(0,balance-pendingMed-pendingWithdrawals),pending_med:pendingMed,pending_withdrawals:pendingWithdrawals,total_deposits:sum(deposits.filter(x=>String(x.status).toUpperCase()==='PAID'),'amount'),total_withdrawals:sum(withdrawals.filter(x=>['PAID','COMPLETED','DELIVERED'].includes(String(x.status).toUpperCase())),'amount')};}
 return json(res,200,{summary:summary||{},transactions,deposits,withdrawals,medCases});
}catch(e){if(e.message!=='AUTH')console.error('wallet-summary',e);return json(res,e.message==='AUTH'?401:500,{error:e.message==='AUTH'?'Sua sessão expirou. Atualize a página ou entre novamente.':'Não foi possível carregar a carteira agora.'})}}