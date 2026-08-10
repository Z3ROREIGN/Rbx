import { createClient } from '@supabase/supabase-js';
const PRICES = { Gamepass: 26, 'Robux Plus': 40 };
const digits = v => String(v ?? '').replace(/\D/g, '').slice(0, 11);
function validCPF(v) { const d=digits(v); if(d.length!==11||/^(\d)\1+$/.test(d))return false; let s=0; for(let i=0;i<9;i++)s+=+d[i]*(10-i); let r=(s*10)%11;if(r===10)r=0;if(r!==+d[9])return false;s=0;for(let i=0;i<10;i++)s+=+d[i]*(11-i);r=(s*10)%11;if(r===10)r=0;return r===+d[10]; }
const json=(res,status,body)=>res.status(status).json(body);
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 try{
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!token)return json(res,401,{error:'Faça login para continuar.'});
  const publicClient=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  const {data:authData,error:authError}=await publicClient.auth.getUser(token); if(authError||!authData.user)return json(res,401,{error:'Sessão inválida.'});
  const {robux,method,robloxUsername,payerName,payerDocument}=req.body||{}; const qty=Number(robux); const cpf=digits(payerDocument);
  if(!Number.isInteger(qty)||qty<1000||qty>50000||qty%1000!==0)return json(res,400,{error:'Quantidade inválida.'});
  if(!Object.prototype.hasOwnProperty.call(PRICES,method))return json(res,400,{error:'Tipo de produto inválido.'});
  if(!/^[A-Za-z0-9_]{3,20}$/.test(String(robloxUsername||'')))return json(res,400,{error:'Usuário do Roblox inválido.'});
  if(String(payerName||'').trim().split(/\s+/).length<2)return json(res,400,{error:'Informe o nome completo.'});
  if(!validCPF(cpf))return json(res,400,{error:'CPF inválido.'});
  const amount=Number((qty/1000*PRICES[method]).toFixed(2)); const orderId=crypto.randomUUID(); const clientTransactionId=`BR-${orderId}`;
  const ci=process.env.MISTICPAY_CLIENT_ID,cs=process.env.MISTICPAY_CLIENT_SECRET;if(!ci||!cs)return json(res,500,{error:'Pagamento não configurado no servidor.'});
  const mp=await fetch('https://api.misticpay.com/api/transactions/create',{method:'POST',headers:{ci,cs,'Content-Type':'application/json'},body:JSON.stringify({amount,payerName:String(payerName).trim().slice(0,100),payerDocument:cpf,transactionId:clientTransactionId,description:`Best Robux - ${qty} Robux - ${method}`,projectWebhook:process.env.MISTICPAY_WEBHOOK_URL||`${process.env.SITE_URL}/api/misticpay-webhook`})});
  const result=await mp.json().catch(()=>({})); if(!mp.ok||!result?.data)return json(res,502,{error:result?.message||'Não foi possível criar o PIX.'});
  const d=result.data; const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const {error}=await admin.from('orders').insert({id:orderId,user_id:authData.user.id,robux:qty,method,amount,roblox_username:String(robloxUsername).trim(),payer_name:String(payerName).trim(),payer_document:cpf,status:d.transactionState==='COMPLETO'?'PAID':'PENDING',payment_transaction_id:String(d.transactionId||clientTransactionId),pix_copy_paste:d.copyPaste||null,pix_qr_code:d.qrCodeBase64||d.qrcodeUrl||null});
  if(error)return json(res,500,{error:'Pagamento criado, mas não foi possível salvar o pedido.'});
  return json(res,201,{orderId,transactionId:d.transactionId||clientTransactionId,amount,status:d.transactionState||'PENDENTE',copyPaste:d.copyPaste||null,qrCode:d.qrCodeBase64||d.qrcodeUrl||null});
 }catch(e){console.error(e);return json(res,500,{error:'Erro interno ao criar pagamento.'});}
}
