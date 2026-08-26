import { createClient } from '@supabase/supabase-js';
import { broadcastEvent } from './_discord.js';

const json=(res,status,body)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body)};
const allowed=new Set(['page_view','login','logout','account_update','order_created','order_status','wallet_update','admin_action','seller_action','marketplace_product','marketplace_stock','marketplace_order','marketplace_chat']);

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    if(!token)return json(res,401,{error:'Autenticação obrigatória.'});
    if(JSON.stringify(req.body||{}).length>12000)return json(res,413,{error:'Evento muito grande.'});
    const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
    const {data,error}=await db.auth.getUser(token);if(error||!data.user)return json(res,401,{error:'Sessão inválida.'});
    const body=req.body||{},event=String(body.event||'').trim();
    if(!allowed.has(event))return json(res,400,{error:'Evento não permitido.'});
    const isMarketplace=event.startsWith('marketplace_');
    const important=['order_status','wallet_update','admin_action','seller_action','marketplace_order','marketplace_product'].includes(event);
    const channels=isMarketplace?['marketplace','updates']:important?['updates','featured']:['updates'];
    const title=String(body.title||event).slice(0,180);
    const description=String(body.description||'Atividade registrada no BestRobux.').slice(0,1500);
    const fields=Array.isArray(body.fields)?body.fields.filter(x=>x&&typeof x==='object').slice(0,10).map(x=>({name:String(x.name||'Informação').slice(0,80),value:String(x.value??'').slice(0,500),inline:x.inline!==false})):[];
    const result=await broadcastEvent({channels,title,description,type:body.type==='danger'?'danger':body.type==='warning'?'warning':body.type==='success'?'success':isMarketplace?'marketplace':'info',fields});
    return json(res,200,{ok:true,userId:data.user.id,delivered:result.filter(x=>x?.sent).length});
  }catch(e){console.error('discord-event:',e);return json(res,500,{error:'Não foi possível registrar o evento.'})}
}
