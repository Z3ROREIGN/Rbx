export const config = { runtime: 'nodejs' };

const json=(res,status,body)=>{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(status).json(body)};

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Método não permitido.'});
  const supabaseUrl=process.env.SUPABASE_URL||'https://anlwpqwjjswkqncltcdl.supabase.co';
  const supabaseAnonKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_r3GoKwcOEaXySt7fFOM_0A_rNOc7Mq7';
  if(!supabaseUrl||!supabaseAnonKey){console.error('CONFIG_MISSING: Supabase público não configurado');return json(res,503,{error:'Serviço temporariamente indisponível.'})}
  return json(res,200,{supabaseUrl,supabaseAnonKey});
}
