import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import { SvgXml } from 'react-native-svg';

const SITE = 'https://bestrobux.vercel.app';
const C = { bg:'#08090a', panel:'#101214', card:'#15181b', line:'#292e34', red:'#e3343f', red2:'#b91f2a', text:'#fff', muted:'#969da5', green:'#45d483', soft:'#1b1f23' };
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#08090a"/><rect x="48" y="48" width="416" height="416" rx="92" fill="#e3343f"/><path d="M183 126h126c58 0 91 31 91 76 0 27-13 49-36 62 31 12 48 36 48 67 0 51-39 81-103 81H183V126Zm62 52v65h58c23 0 35-12 35-33s-12-32-35-32h-58Zm0 117v65h68c25 0 38-12 38-33s-13-32-38-32h-68Z" fill="#fff"/></svg>';
const money = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
const Logo = ({ size=54 }) => <SvgXml xml={LOGO} width={size} height={size} />;
let dbCache = null;

async function getDb() {
  if (dbCache) return dbCache;
  const r = await fetch(`${SITE}/api/config?mobile=1`, { cache:'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Não foi possível conectar ao servidor.');
  const url = data.supabaseUrl || data.url || data.SUPABASE_URL;
  const key = data.supabaseAnonKey || data.anonKey || data.SUPABASE_ANON_KEY || data.publicKey;
  if (!url || !key) throw new Error('Configuração do aplicativo não encontrada no servidor.');
  dbCache = createClient(url, key, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:'bestrobux-mobile' } });
  return dbCache;
}

async function openUrl(path) {
  const url = path.startsWith('http') ? path : `${SITE}${path}`;
  try { await Linking.openURL(url); } catch { Alert.alert('Best Robux', 'Não foi possível abrir esta página.'); }
}

export default function App() {
  const [db, setDb] = useState(null), [session, setSession] = useState(null), [booting, setBooting] = useState(true), [error, setError] = useState('');
  const boot = useCallback(async () => {
    setBooting(true); setError('');
    try { const d = await getDb(); setDb(d); const r = await d.auth.getSession(); if (r.error) throw r.error; setSession(r.data.session || null); }
    catch (e) { setError(e?.message || 'Falha ao iniciar.'); }
    finally { setBooting(false); }
  }, []);
  useEffect(() => { boot(); }, [boot]);
  useEffect(() => { if (!db) return; const sub = db.auth.onAuthStateChange((_event, s) => setSession(s)); return () => sub.data.subscription.unsubscribe(); }, [db]);
  if (booting) return <Center><Logo size={92}/><Text style={S.brandBig}>BEST ROBUX</Text><ActivityIndicator size="large" color={C.red}/><Text style={S.muted}>Carregando...</Text></Center>;
  if (error) return <Center><Logo size={82}/><Text style={S.h1}>Best Robux</Text><Text style={S.error}>{error}</Text><Button title="Tentar novamente" onPress={boot}/><Button title="Abrir site" secondary onPress={() => openUrl('/')}/></Center>;
  return session ? <Store db={db} session={session}/> : <Auth db={db}/>;
}

function Auth({ db }) {
  const [signup,setSignup]=useState(false), [email,setEmail]=useState(''), [password,setPassword]=useState(''), [busy,setBusy]=useState(false);
  const submit = async () => {
    const e=email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return Alert.alert('Atenção','Digite um e-mail válido.');
    if (password.length < 6) return Alert.alert('Atenção','A senha precisa ter pelo menos 6 caracteres.');
    setBusy(true);
    try { const r=signup?await db.auth.signUp({email:e,password}):await db.auth.signInWithPassword({email:e,password}); if(r.error) throw r.error; if(signup&&!r.data.session) Alert.alert('Conta criada','Confira seu e-mail para confirmar a conta.'); }
    catch(e){ Alert.alert('Erro',e.message||'Não foi possível continuar.'); }
    finally{ setBusy(false); }
  };
  const reset = async () => { if(!email.trim()) return Alert.alert('Recuperar senha','Digite seu e-mail.'); setBusy(true); try { const r=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${SITE}/reset-password.html`}); if(r.error) throw r.error; Alert.alert('Pronto','Enviamos as instruções para seu e-mail.'); } catch(e){ Alert.alert('Erro',e.message||'Não foi possível enviar.'); } finally{setBusy(false);} };
  return <SafeAreaView style={S.safe}><StatusBar barStyle="light-content" backgroundColor={C.bg}/><KeyboardAvoidingView style={S.flex} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView contentContainerStyle={S.auth} keyboardShouldPersistTaps="handled"><Logo size={92}/><Text style={S.brandBig}>BEST ROBUX</Text><Text style={S.muted}>Sua loja de Robux no celular.</Text><View style={S.authBox}><Text style={S.h1}>{signup?'Criar conta':'Entrar'}</Text><Text style={S.label}>E-MAIL</Text><Input value={email} onChangeText={setEmail} placeholder="seu@email.com" keyboardType="email-address"/><Text style={S.label}>SENHA</Text><Input value={password} onChangeText={setPassword} placeholder="Sua senha" secureTextEntry/><Button title={busy?'Aguarde...':signup?'Criar conta':'Entrar'} disabled={busy} onPress={submit}/>{!signup&&<Link title="Esqueci minha senha" onPress={reset}/>}<Link title={signup?'Já tenho uma conta':'Criar uma conta'} onPress={()=>setSignup(v=>!v)}/><Button title="Continuar pelo site" secondary onPress={()=>openUrl('/login.html')}/></View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Store({ db, session }) {
  const { width } = useWindowDimensions();
  const columns = width >= 760 ? 2 : 1;
  const [tab,setTab]=useState('home'), [products,setProducts]=useState([]), [orders,setOrders]=useState([]), [favs,setFavs]=useState(new Set()), [query,setQuery]=useState(''), [filter,setFilter]=useState('all'), [loading,setLoading]=useState(true), [refreshing,setRefreshing]=useState(false), [selected,setSelected]=useState(null), [brand,setBrand]=useState({name:'Best Robux',description:'Escolha seu pacote e compre com segurança.',logo:null,banner:null});
  const load = useCallback(async (refresh=false) => {
    if(refresh) setRefreshing(true); else setLoading(true);
    try {
      const [settings, productsRes, favoritesRes] = await Promise.all([
        db.from('site_settings').select('*').limit(1).maybeSingle(),
        db.from('products').select('*').eq('active',true).order('featured',{ascending:false}).order('sort_order',{ascending:true}),
        db.from('product_favorites').select('product_id').eq('user_id',session.user.id),
      ]);
      if(productsRes.error) throw productsRes.error;
      setProducts(productsRes.data || []);
      if(settings.data) { const x=settings.data; setBrand({name:x.site_name||'Best Robux',description:x.site_description||'Escolha seu pacote e compre com segurança.',logo:x.logo_url||null,banner:x.banner_url||null}); }
      if(!favoritesRes.error) setFavs(new Set((favoritesRes.data||[]).map(x=>String(x.product_id))));
    } catch(e) { Alert.alert('Loja',e.message||'Não foi possível carregar os produtos.'); }
    finally { setLoading(false); setRefreshing(false); }
  },[db,session.user.id]);
  const loadOrders = useCallback(async()=>{const r=await db.from('orders').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(50); if(r.error) Alert.alert('Pedidos',r.error.message); else setOrders(r.data||[]);},[db,session.user.id]);
  useEffect(()=>{load();},[load]); useEffect(()=>{if(tab==='orders') loadOrders();},[tab,loadOrders]);
  const shown=useMemo(()=>products.filter(p=>{const method=String(p.method||'').toLowerCase();const ok=filter==='all'||(filter==='featured'&&!!p.featured)||method===filter.toLowerCase();const q=query.trim().toLowerCase();return ok&&(!q||[p.name,p.method,p.description,p.badge,p.robux].filter(Boolean).join(' ').toLowerCase().includes(q));}),[products,filter,query]);
  const toggleFavorite=async id=>{const key=String(id),was=favs.has(key),next=new Set(favs);was?next.delete(key):next.add(key);setFavs(next);try{if(was){const r=await db.from('product_favorites').delete().eq('user_id',session.user.id).eq('product_id',id);if(r.error)throw r.error;}else{const r=await db.from('product_favorites').insert({user_id:session.user.id,product_id:id});if(r.error)throw r.error;}}catch(e){setFavs(favs);Alert.alert('Favoritos',e.message||'Não foi possível atualizar.');}};
  const buy=p=>{const type=p.method==='Robux Plus'?'Robux Plus':'Gamepass';const qty=Math.max(1,Number(p.robux||0));const url=`${SITE}/checkout.html?type=${encodeURIComponent(type)}&qty=${encodeURIComponent(qty)}&product=${encodeURIComponent(p.id||'')}`;openUrl(url);};
  return <SafeAreaView style={S.safe}><StatusBar barStyle="light-content" backgroundColor={C.bg}/><Header brand={brand} email={session.user.email}/>{tab==='home'&&<FlatList key={String(columns)} data={shown} numColumns={columns} keyExtractor={p=>String(p.id)} columnWrapperStyle={columns>1?S.columns:null} contentContainerStyle={S.list} refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.red} onRefresh={()=>load(true)}/>} ListHeaderComponent={<Home brand={brand} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter}/>} renderItem={({item})=><ProductCard item={item} favorite={favs.has(String(item.id))} onFavorite={()=>toggleFavorite(item.id)} onBuy={()=>buy(item)} onDetails={()=>setSelected(item)} columns={columns}/>} ListEmptyComponent={loading?<Center><ActivityIndicator color={C.red}/><Text style={S.muted}>Carregando produtos...</Text></Center>:<Empty text="Nenhum produto disponível."/>}/>} {tab==='favorites'&&<Favorites products={products.filter(p=>favs.has(String(p.id)))} buy={buy} details={setSelected}/>} {tab==='orders'&&<Orders orders={orders}/>} {tab==='profile'&&<Profile session={session} brand={brand} logout={()=>db.auth.signOut()}/>}<BottomNav tab={tab} setTab={setTab}/><Modal visible={!!selected} transparent animationType="slide" onRequestClose={()=>setSelected(null)}>{selected&&<Details item={selected} favorite={favs.has(String(selected.id))} onFavorite={()=>toggleFavorite(selected.id)} onBuy={()=>buy(selected)} close={()=>setSelected(null)}/>}</Modal></SafeAreaView>;
}

function Header({brand,email}){return <View style={S.header}><View style={S.row}>{brand.logo?<Image source={{uri:brand.logo}} style={S.logoSmall}/>:<Logo size={44}/>}<View style={S.flex}><Text style={S.brand}>{brand.name}</Text><Text style={S.email} numberOfLines={1}>{email}</Text></View><View style={S.live}><View style={S.dot}/><Text style={S.liveText}>Online</Text></View></View></View>;}
function Home({brand,query,setQuery,filter,setFilter}){const fs=[['all','Todos'],['Gamepass','Gamepass'],['Robux Plus','Robux Plus'],['featured','Destaques']];return <View><View style={S.hero}>{brand.banner?<Image source={{uri:brand.banner}} style={S.banner}/>:null}<Text style={S.kicker}>BEST ROBUX</Text><Text style={S.heroTitle}>Robux sem complicação.</Text><Text style={S.accent}>Rápido. Simples. Seguro.</Text><Text style={S.heroText}>{brand.description}</Text></View><View style={S.searchBox}><TextInput value={query} onChangeText={setQuery} placeholder="Pesquisar produtos" placeholderTextColor={C.muted} style={S.searchInput}/>{query?<Pressable hitSlop={10} onPress={()=>setQuery('')}><Text style={S.clear}>×</Text></Pressable>:null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filters}>{fs.map(([v,l])=><Pressable key={v} onPress={()=>setFilter(v)} style={[S.filter,filter===v&&S.filterOn]}><Text style={[S.filterText,filter===v&&S.filterTextOn]}>{l}</Text></Pressable>)}</ScrollView><Text style={S.section}>Produtos</Text></View>;}
function ProductCard({item,favorite,onFavorite,onBuy,onDetails,columns}){return <View style={[S.card,columns>1&&S.cardGrid]}><View style={S.media}><Pressable style={S.mediaTouch} onPress={onDetails}>{item.image_url?<Image source={{uri:item.image_url}} style={S.image}/>:<View style={S.placeholder}><Text style={S.placeholderNumber}>{item.robux||'+'}</Text><Text style={S.muted}>Robux</Text></View>}</Pressable><Pressable hitSlop={10} onPress={onFavorite} style={S.favorite}><Text style={[S.heart,favorite&&S.heartOn]}>{favorite?'♥':'♡'}</Text></Pressable></View><Pressable onPress={onDetails} style={S.cardInfo}><Text style={S.tag}>{item.badge||item.method||'Produto'}</Text><Text style={S.cardTitle} numberOfLines={2}>{item.name||`${item.robux||''} Robux`}</Text><Text style={S.cardDescription} numberOfLines={2}>{item.description||`${item.robux||''} Robux`}</Text><View style={S.priceRow}><Text style={S.price}>{money(item.price)}</Text>{item.compare_at_price?<Text style={S.oldPrice}>{money(item.compare_at_price)}</Text>:null}</View></Pressable><Button title="Comprar agora" onPress={onBuy}/></View>;}
function Favorites({products,buy,details}){return <ScrollView contentContainerStyle={S.page}><Text style={S.pageTitle}>Favoritos</Text>{products.length?products.map(p=><View style={S.rowBox} key={p.id}><View style={S.flex}><Text style={S.cardTitle}>{p.name||`${p.robux||''} Robux`}</Text><Text style={S.muted}>{money(p.price)}</Text></View><Button small title="Comprar" onPress={()=>buy(p)}/><Link title="Ver" onPress={()=>details(p)}/></View>):<Empty text="Você ainda não possui favoritos."/>}</ScrollView>;}
function Orders({orders}){return <ScrollView contentContainerStyle={S.page}><Text style={S.pageTitle}>Meus pedidos</Text>{orders.length?orders.map((o,i)=><View style={S.order} key={String(o.id||i)}><View style={S.row}><View style={S.flex}><Text style={S.cardTitle}>Pedido #{String(o.id||i).slice(0,8)}</Text><Text style={S.muted}>{o.created_at?new Date(o.created_at).toLocaleString('pt-BR'):''}</Text></View><Text style={S.status}>{o.status||'Pendente'}</Text></View><Text style={S.price}>{money(o.amount)}</Text></View>):<Empty text="Você ainda não possui pedidos."/>}</ScrollView>;}
function Profile({session,brand,logout}){return <ScrollView contentContainerStyle={S.page}><View style={S.profile}>{brand.logo?<Image source={{uri:brand.logo}} style={S.profileLogo}/>:<Logo size={76}/>}<Text style={S.pageTitle}>{brand.name}</Text><Text style={S.muted}>{session.user.email}</Text></View><Button title="Notificações" onPress={()=>openUrl('/notifications.html')}/><Button title="Suporte" onPress={()=>openUrl('/support.html')}/><Button title="Abrir site completo" secondary onPress={()=>openUrl('/')}/><Button title="Sair da conta" danger onPress={logout}/></ScrollView>;}
function Details({item,favorite,onFavorite,onBuy,close}){return <View style={S.modalWrap}><View style={S.modal}><Pressable style={S.close} onPress={close}><Text style={S.closeText}>×</Text></Pressable>{item.image_url?<Image source={{uri:item.image_url}} style={S.detailImage}/>:<View style={S.detailPlaceholder}><Text style={S.placeholderNumber}>{item.robux||'+'}</Text><Text style={S.muted}>Robux</Text></View>}<Text style={S.tag}>{item.badge||item.method||'Produto'}</Text><Text style={S.pageTitle}>{item.name||`${item.robux||''} Robux`}</Text><Text style={S.heroText}>{item.description||'Produto Best Robux.'}</Text><Text style={S.detailPrice}>{money(item.price)}</Text><View style={S.modalActions}><Button title="Comprar agora" onPress={onBuy}/><Button title={favorite?'Remover dos favoritos':'Adicionar aos favoritos'} secondary onPress={onFavorite}/></View></View></View>;}
function BottomNav({tab,setTab}){const items=[['home','Início','⌂'],['favorites','Favoritos','♡'],['orders','Pedidos','▣'],['profile','Perfil','●']];return <View style={S.nav}>{items.map(([v,l,i])=><Pressable key={v} onPress={()=>setTab(v)} style={[S.navItem,tab===v&&S.navActive]}><Text style={[S.navIcon,tab===v&&S.navText]}>{i}</Text><Text style={[S.navLabel,tab===v&&S.navText]}>{l}</Text></Pressable>)}</View>;}
function Button({title,onPress,secondary=false,danger=false,disabled=false,small=false}){return <Pressable disabled={disabled} onPress={onPress} android_ripple={{color:'#ffffff22'}} style={({pressed})=>[S.button,secondary&&S.buttonSecondary,danger&&S.buttonDanger,small&&S.buttonSmall,disabled&&S.buttonDisabled,pressed&&!disabled&&S.buttonPressed]}><Text style={[S.buttonText,secondary&&S.buttonTextSecondary]}>{title}</Text></Pressable>;}
function Input(p){return <TextInput {...p} autoCapitalize="none" placeholderTextColor={C.muted} style={S.input}/>;}
function Link({title,onPress}){return <Pressable hitSlop={10} onPress={onPress} style={S.link}><Text style={S.linkText}>{title}</Text></Pressable>;}
function Center({children}){return <SafeAreaView style={S.safe}><StatusBar barStyle="light-content" backgroundColor={C.bg}/><View style={S.center}>{children}</View></SafeAreaView>;}
function Empty({text}){return <View style={S.empty}><Text style={S.emptyTitle}>{text}</Text><Text style={S.muted}>Tente atualizar a tela.</Text></View>;}

const S=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},flex:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12,backgroundColor:C.bg},row:{flexDirection:'row',alignItems:'center'},brandBig:{fontSize:28,fontWeight:'900',color:C.text,letterSpacing:1},brand:{fontSize:17,fontWeight:'900',color:C.text},email:{fontSize:11,color:C.muted,marginTop:2},muted:{color:C.muted,fontSize:13,lineHeight:19},error:{color:'#ff7a82',textAlign:'center',lineHeight:21,marginBottom:8},h1:{fontSize:23,fontWeight:'900',color:C.text,marginBottom:16},safeArea:{flex:1},auth:{flexGrow:1,alignItems:'center',justifyContent:'center',padding:24},authBox:{width:'100%',maxWidth:440,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:22,padding:20,marginTop:22},label:{fontSize:11,fontWeight:'800',color:C.muted,letterSpacing:1,marginTop:12,marginBottom:7},input:{height:52,borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.card,color:C.text,paddingHorizontal:15,fontSize:15},button:{minHeight:52,width:'100%',borderRadius:14,backgroundColor:C.red,alignItems:'center',justifyContent:'center',paddingHorizontal:18,marginTop:12},buttonSecondary:{backgroundColor:C.soft,borderWidth:1,borderColor:C.line},buttonDanger:{backgroundColor:C.red2},buttonSmall:{width:116,minHeight:44,marginTop:0},buttonDisabled:{opacity:.55},buttonPressed:{transform:[{scale:.985}],opacity:.9},buttonText:{color:'#fff',fontSize:15,fontWeight:'900'},buttonTextSecondary:{color:C.text},link:{alignSelf:'center',paddingVertical:12,paddingHorizontal:8},linkText:{color:'#ff6972',fontSize:14,fontWeight:'800'},header:{paddingHorizontal:18,paddingTop:10,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.line,backgroundColor:C.bg},logoSmall:{width:44,height:44,borderRadius:12},live:{marginLeft:10,flexDirection:'row',alignItems:'center',gap:5,backgroundColor:C.soft,borderRadius:20,paddingHorizontal:10,paddingVertical:7},dot:{width:7,height:7,borderRadius:4,backgroundColor:C.green},liveText:{color:C.green,fontSize:11,fontWeight:'800'},list:{paddingHorizontal:14,paddingBottom:105},columns:{gap:12},hero:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,borderRadius:22,padding:20,marginTop:14,overflow:'hidden'},banner:{position:'absolute',left:0,right:0,top:0,bottom:0,opacity:.18},kicker:{color:'#ff6b74',fontSize:11,fontWeight:'900',letterSpacing:1.5},heroTitle:{color:C.text,fontSize:28,fontWeight:'900',marginTop:6},accent:{color:'#ff6b74',fontSize:16,fontWeight:'900',marginTop:3},heroText:{color:C.muted,fontSize:14,lineHeight:21,marginTop:10},searchBox:{height:52,backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:15,marginTop:12,flexDirection:'row',alignItems:'center',paddingHorizontal:14},searchInput:{flex:1,color:C.text,fontSize:15},clear:{color:C.muted,fontSize:27,lineHeight:27},filters:{paddingVertical:12,gap:8},filter:{paddingHorizontal:15,height:40,borderRadius:20,backgroundColor:C.card,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},filterOn:{backgroundColor:C.red,borderColor:C.red},filterText:{color:C.muted,fontWeight:'800',fontSize:13},filterTextOn:{color:'#fff'},section:{fontSize:18,fontWeight:'900',color:C.text,marginBottom:10},card:{flex:1,minWidth:0,backgroundColor:C.card,borderRadius:20,borderWidth:1,borderColor:C.line,padding:12,marginBottom:12},cardGrid:{maxWidth:500},media:{height:190,borderRadius:15,overflow:'hidden',backgroundColor:C.soft,position:'relative'},mediaTouch:{flex:1},image:{width:'100%',height:'100%',resizeMode:'cover'},placeholder:{flex:1,alignItems:'center',justifyContent:'center'},placeholderNumber:{fontSize:34,fontWeight:'900',color:C.text},favorite:{position:'absolute',right:10,top:10,width:42,height:42,borderRadius:21,backgroundColor:'#08090acc',alignItems:'center',justifyContent:'center'},heart:{fontSize:25,color:'#fff'},heartOn:{color:'#ff5964'},cardInfo:{paddingVertical:11},tag:{alignSelf:'flex-start',color:'#ff7078',backgroundColor:'#ff33400f',paddingHorizontal:9,paddingVertical:5,borderRadius:8,fontSize:10,fontWeight:'900',textTransform:'uppercase'},cardTitle:{color:C.text,fontSize:17,fontWeight:'900',marginTop:7},cardDescription:{color:C.muted,fontSize:13,lineHeight:18,marginTop:5},priceRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},price:{color:C.text,fontSize:20,fontWeight:'900'},oldPrice:{color:C.muted,textDecorationLine:'line-through',fontSize:12},page:{padding:18,paddingBottom:110},pageTitle:{color:C.text,fontSize:25,fontWeight:'900',marginBottom:5},rowBox:{backgroundColor:C.card,borderColor:C.line,borderWidth:1,borderRadius:16,padding:14,marginTop:10,flexDirection:'row',alignItems:'center',gap:10},order:{backgroundColor:C.card,borderColor:C.line,borderWidth:1,borderRadius:16,padding:15,marginTop:10},status:{color:C.green,fontWeight:'900',fontSize:12,textTransform:'uppercase'},profile:{alignItems:'center',paddingVertical:18,marginBottom:8},profileLogo:{width:78,height:78,borderRadius:20,marginBottom:10},nav:{position:'absolute',left:12,right:12,bottom:10,height:70,borderRadius:20,backgroundColor:'#111417f5',borderWidth:1,borderColor:C.line,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:5},navItem:{height:58,minWidth:68,borderRadius:15,alignItems:'center',justifyContent:'center',paddingHorizontal:9},navActive:{backgroundColor:C.red},navIcon:{color:C.muted,fontSize:20,fontWeight:'900'},navLabel:{color:C.muted,fontSize:10,fontWeight:'800',marginTop:2},navText:{color:'#fff'},modalWrap:{flex:1,backgroundColor:'#00000099',justifyContent:'flex-end'},modal:{backgroundColor:C.panel,borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderColor:C.line,padding:18,paddingBottom:30,maxHeight:'88%'},close:{position:'absolute',right:15,top:12,zIndex:5,width:42,height:42,borderRadius:21,backgroundColor:C.soft,alignItems:'center',justifyContent:'center'},closeText:{color:'#fff',fontSize:27},detailImage:{width:'100%',height:230,borderRadius:18,resizeMode:'cover',marginBottom:14},detailPlaceholder:{height:230,borderRadius:18,backgroundColor:C.soft,alignItems:'center',justifyContent:'center',marginBottom:14},detailPrice:{color:'#fff',fontSize:30,fontWeight:'900',marginTop:12},modalActions:{marginTop:5},empty:{alignItems:'center',padding:40},emptyTitle:{color:C.text,fontSize:16,fontWeight:'800',textAlign:'center',marginBottom:5}
});
