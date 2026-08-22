import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SITE_URL = 'https://bestrobux.vercel.app';
type Product = { id:string; name:string; method:string; robux:number; price:number; description?:string; image_url?:string; featured?:boolean; badge?:string };

let sb: SupabaseClient | null = null;
async function getClient(){
  if(sb) return sb;
  const r = await fetch(`${SITE_URL}/api/config`, {cache:'no-store'});
  const c = await r.json();
  if(!c.supabaseUrl || !c.supabaseAnonKey) throw new Error('Supabase não configurado.');
  sb = createClient(c.supabaseUrl,c.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'bestrobux-mobile-auth'}});
  return sb;
}

export default function App(){
  const [loading,setLoading]=useState(true); const [user,setUser]=useState<any>(null); const [products,setProducts]=useState<Product[]>([]); const [search,setSearch]=useState(''); const [tab,setTab]=useState('Todos'); const [error,setError]=useState('');
  useEffect(()=>{boot()},[]);
  async function boot(){try{const c=await getClient(); const s=(await c.auth.getSession()).data.session; setUser(s?.user||null); await loadProducts(c); c.auth.onAuthStateChange((_e,session)=>setUser(session?.user||null));}catch(e:any){setError(e.message||'Não foi possível conectar.')}finally{setLoading(false)}}
  async function loadProducts(c=sb!){const r=await c.from('products').select('id,name,method,robux,price,description,image_url,featured,badge').eq('active',true).order('featured',{ascending:false}).order('sort_order');if(r.error)throw r.error;setProducts(r.data||[])}
  const visible=products.filter(p=>{const t=`${p.name} ${p.method} ${p.robux} ${p.description||''}`.toLowerCase();return t.includes(search.toLowerCase()) && (tab==='Todos'||tab==='Destaques'?(tab==='Todos'||!!p.featured):p.method===tab)});
  if(loading)return <Screen><ActivityIndicator size="large"/><Text style={s.muted}>Carregando BestRobux...</Text></Screen>;
  return <SafeAreaView style={s.safe}><StatusBar style="light"/><View style={s.header}><View><Text style={s.logo}>BEST<span>ROBUX</span></Text><Text style={s.muted}>Loja oficial</Text></View><Pressable style={s.account} onPress={()=>{}}><Text style={s.accountText}>{user?'Conta':'Entrar'}</Text></Pressable></View>
    <FlatList data={visible} keyExtractor={x=>x.id} ListHeaderComponent={<><View style={s.hero}><Text style={s.h1}>Robux, sem enrolação.</Text><Text style={s.heroText}>Compre seus Robux e acompanhe seus pedidos pelo mesmo sistema do site.</Text></View><TextInput value={search} onChangeText={setSearch} placeholder="Pesquisar produtos..." placeholderTextColor="#747a82" style={s.input}/><View style={s.tabs}>{['Todos','Gamepass','Robux Plus','Destaques'].map(x=><Pressable key={x} onPress={()=>setTab(x)} style={[s.tab,tab===x&&s.tabOn]}><Text style={[s.tabText,tab===x&&s.tabTextOn]}>{x}</Text></Pressable>)}</View>{error?<Text style={s.error}>{error}</Text>:null}</>} renderItem={({item})=><ProductCard p={item}/>} contentContainerStyle={s.list} ListEmptyComponent={<Text style={s.empty}>Nenhum produto encontrado.</Text>}/>
  </SafeAreaView>
}
function ProductCard({p}:{p:Product}){return <View style={s.card}>{p.image_url?<Image source={{uri:p.image_url}} style={s.productImage}/>:<View style={s.icon}><Text style={s.iconText}>{p.method==='Gamepass'?'R':'+'}</Text></View>}<View style={{flex:1}}><Text style={s.badge}>{p.badge||p.method}</Text><Text style={s.title}>{p.name}</Text><Text style={s.muted}>{p.description||`${Number(p.robux).toLocaleString('pt-BR')} Robux`}</Text><Text style={s.price}>R$ {Number(p.price).toFixed(2).replace('.',',')}</Text><Pressable style={s.buy} onPress={()=>{}}><Text style={s.buyText}>Comprar</Text></Pressable></View></View>}
function Screen({children}:{children:React.ReactNode}){return <SafeAreaView style={s.safe}><View style={s.center}>{children}</View></SafeAreaView>}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#090a0b'},header:{padding:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#25292d'},logo:{fontSize:18,fontWeight:'900',color:'#fff'},account:{borderWidth:1,borderColor:'#34383e',borderRadius:7,paddingHorizontal:14,paddingVertical:9},accountText:{color:'#fff',fontWeight:'800'},hero:{padding:20},h1:{fontSize:30,fontWeight:'900',color:'#fff',marginBottom:8},heroText:{color:'#9298a0',lineHeight:20},input:{marginHorizontal:18,marginBottom:10,padding:13,borderRadius:7,borderWidth:1,borderColor:'#30343a',backgroundColor:'#0f1113',color:'#fff'},tabs:{flexDirection:'row',paddingHorizontal:12,marginBottom:8},tab:{paddingHorizontal:10,paddingVertical:10,borderBottomWidth:2,borderBottomColor:'transparent'},tabOn:{borderBottomColor:'#e3343f'},tabText:{color:'#7f868e',fontWeight:'800',fontSize:12},tabTextOn:{color:'#fff'},list:{paddingBottom:30},card:{marginHorizontal:18,marginVertical:5,padding:14,borderWidth:1,borderColor:'#282d32',borderRadius:8,backgroundColor:'#151719',flexDirection:'row',gap:14},productImage:{width:58,height:58,borderRadius:7,backgroundColor:'#25292d'},icon:{width:58,height:58,borderRadius:7,backgroundColor:'#32171b',alignItems:'center',justifyContent:'center'},iconText:{color:'#ffadb4',fontSize:24,fontWeight:'900'},badge:{fontSize:10,color:'#ffadb4',fontWeight:'900',marginBottom:5},title:{fontSize:16,color:'#fff',fontWeight:'900'},muted:{color:'#9298a0',marginTop:4},price:{fontSize:21,color:'#fff',fontWeight:'900',marginTop:10,marginBottom:10},buy:{backgroundColor:'#e3343f',borderRadius:6,paddingVertical:11,alignItems:'center'},buyText:{color:'#fff',fontWeight:'900'},empty:{color:'#9298a0',textAlign:'center',padding:30},error:{color:'#ff8b93',padding:18},center:{flex:1,alignItems:'center',justifyContent:'center',gap:10}});
