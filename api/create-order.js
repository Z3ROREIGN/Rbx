import { createClient } from '@supabase/supabase-js';

const json=(res,status,body)=>res.status(status).json(body);
const digits=v=>String(v||'').replace(/\D/g,'').slice(0,11);
function validCPF(v){const d=digits(v);if(d.length!==11||/^(\d)\1+$/.test(d))return false;let s=0;for(let i=0;i<9;i++)s+=+d[i]*(10-i);let r=(s*10)%11;if(r===10)r=0;if(r!==+d[9])return false;s=0;for(let i=0;i<10;i++)s+=+d[i]*(11-i);r=(s*10)%11;if(r===10)r=0;return r===+d[10]}
function env(name){const v=process.env[name];if(!v)throw new Error(`Missing ${name}`);return v}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 try{
  const body=req.body||{}; const name=String(body.name||'').trim(); const cpf=digits(body.cpf); const email=String(body.email||'').trim().toLowerCase(); const robloxUsername=String(body.robloxUsername||'').trim(); const quantity=Number(body.quantity); const type=body.type==='Robux Plus'?'Robux Plus':'Gamepass';
  if(name.split(/\s+/).length<2)return json(res,400,{error:'Informe o nome completo.'}); if(!validCPF(cpf))return json(res,400,{error:'Informe um CPF válido.'}); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Informe um e-mail válido.'}); if(!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername))return json(res,400,{error:'Usuário do Roblox inválido.'}); if(!Number.isInteger(quantity)||quantity<1000||quantity>50000||quantity%1000!==0)return json(res,400,{error:'Quantidade inválida.'});
  const supabase=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const amount=Number((quantity/1000*(type==='Gamepass'?26:40)).toFixed(2));
  const {data:order,error}=await supabase.from('orders').insert({robux:quantity,method:type,amount,roblox_username:robloxUsername,payer_name:name,payer_document:cpf,status:'PENDING'}).select('id,amount,status,created_at').single();
  if(error)return json(res,500,{error:'Não foi possível criar o pedido.'});
  const clientId=env('MISTICPAY_CLIENT_ID'),secret=env('MISTICPAY_CLIENT_SECRET');
  const origin=process.env.SITE_URL||`https://${req.headers.host}`;
  const response=await fetch('https://api.misticpay.com/api/transactions/create',{method:'POST',headers:{'Content-Type':'application/json',ci:clientId,cs:secret},body:JSON.stringify({amount,payer:{name,email,cpf},description:`Best Robux - ${quantity} Robux - ${type}`,external_id:order.id,webhook_url:process.env.MISTICPAY_WEBHOOK_URL||`${origin}/api/misticpay-webhook`})});
  const payment=await response.json().catch(()=>({}));
  if(!response.ok){await supabase.from('orders').update({status:'FAILED'}).eq('id',order.id);return json(res,502,{error:'Não foi possível gerar o pagamento.',orderId:order.id})}
  const transactionId=payment.id||payment.transaction_id||payment.data?.id||payment.data?.transaction_id; const pix=payment.pix||payment.data?.pix||payment.payment||payment.data?.payment||{}; const copy=pix.copy_paste||pix.copyPaste||pix.qr_code||payment.copy_paste||payment.data?.copy_paste; const qr=pix.qr_code_base64||pix.qr_code||payment.qr_code||payment.data?.qr_code;
  await supabase.from('orders').update({payment_transaction_id:transactionId?String(transactionId):null,pix_copy_paste:copy?String(copy):null,pix_qr_code:qr?String(qr):null}).eq('id',order.id);
  return json(res,201,{order:{...order,id:order.id},payment:{transaction_id:transactionId,copy_paste:copy,qr_code:qr}});
 }catch(e){return json(res,500,{error:'Erro interno ao criar o pedido.'})}
}
