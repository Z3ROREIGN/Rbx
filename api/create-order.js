import { createClient } from '@supabase/supabase-js';

const json=(res,status,body)=>res.status(status).json(body);
const digits=v=>String(v||'').replace(/\D/g,'').slice(0,11);
function validCPF(v){const d=digits(v);if(d.length!==11||/^(\d)\1+$/.test(d))return false;let s=0;for(let i=0;i<9;i++)s+=+d[i]*(10-i);let r=(s*10)%11;if(r===10)r=0;if(r!==+d[9])return false;s=0;for(let i=0;i<10;i++)s+=+d[i]*(11-i);r=(s*10)%11;if(r===10)r=0;return r===+d[10]}
function env(n){if(!process.env[n])throw Error(`Missing ${n}`);return process.env[n]}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 try{
  const auth=req.headers.authorization||'';if(!auth.startsWith('Bearer '))return json(res,401,{error:'Faça login para continuar.'});
  const token=auth.slice(7);const anon=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});const {data:{user},error:authError}=await anon.auth.getUser(token);if(authError||!user)return json(res,401,{error:'Sessão inválida. Entre novamente.'});
  const b=req.body||{};const name=String(b.name||'').trim(),cpf=digits(b.cpf),email=String(b.email||'').trim().toLowerCase(),robloxUsername=String(b.robloxUsername||'').trim(),quantity=Number(b.quantity),type=b.type==='Robux Plus'?'Robux Plus':'Gamepass';
  if(name.split(/\s+/).length<2)return json(res,400,{error:'Informe o nome completo.'});if(!validCPF(cpf))return json(res,400,{error:'Informe um CPF válido.'});if(email!==String(user.email||'').toLowerCase())return json(res,400,{error:'O e-mail do pedido deve ser o da conta.'});if(!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername))return json(res,400,{error:'Usuário do Roblox inválido.'});if(!Number.isInteger(quantity)||quantity<1000||quantity>50000||quantity%1000!==0)return json(res,400,{error:'Quantidade inválida.'});
  const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});const amount=Number((quantity/1000*(type==='Gamepass'?26:40)).toFixed(2));
  const {data:order,error}=await admin.from('orders').insert({user_id:user.id,robux:quantity,method:type,amount,roblox_username:robloxUsername,payer_name:name,payer_document:cpf,status:'PENDING'}).select('id,amount,status,created_at').single();if(error)return json(res,500,{error:'Não foi possível criar o pedido.'});
  const transactionId=String(order.id);const projectWebhook=process.env.MISTICPAY_WEBHOOK_URL||`https://${req.headers.host}/api/misticpay-webhook`;
  const response=await fetch('https://api.misticpay.com/api/transactions/create',{method:'POST',headers:{'Content-Type':'application/json',ci:env('MISTICPAY_CLIENT_ID'),cs:env('MISTICPAY_CLIENT_SECRET')},body:JSON.stringify({amount,payerName:name,payerDocument:cpf,transactionId,description:`Best Robux - ${quantity} Robux - ${type}`,projectWebhook})});
  const payment=await response.json().catch(()=>({}));
  if(!response.ok){await admin.from('orders').update({status:'FAILED'}).eq('id',order.id);return json(res,502,{error:'Não foi possível gerar o pagamento.',orderId:order.id});}
  const data=payment?.data||payment;const gatewayId=data.transactionId||data.id;const copy=data.copyPaste||data.copy_paste;const qr=data.qrCodeBase64||data.qr_code_base64||data.qrcodeUrl||data.qr_code;
  if(!gatewayId||(!copy&&!qr)){await admin.from('orders').update({status:'FAILED'}).eq('id',order.id);return json(res,502,{error:'A cobrança foi criada sem dados PIX válidos.',orderId:order.id});}
  const {error:updateError}=await admin.from('orders').update({payment_transaction_id:String(gatewayId),pix_copy_paste:copy?String(copy):null,pix_qr_code:qr?String(qr):null}).eq('id',order.id);if(updateError)return json(res,500,{error:'Pagamento criado, mas não foi possível salvar o pedido.'});
  return json(res,201,{order,payment:{transaction_id:String(gatewayId),copy_paste:copy?String(copy):null,qr_code:qr?String(qr):null}});
 }catch(e){console.error('create-order:',e);return json(res,500,{error:'Erro interno ao criar o pedido.'})}
}
