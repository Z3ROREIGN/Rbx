import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal as RNModal,
  Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, View, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { SvgXml } from 'react-native-svg';

const SITE = 'https://bestrobux.vercel.app';
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#090a0b"/><rect x="48" y="48" width="416" height="416" rx="92" fill="#e3343f"/><path d="M183 126h126c58 0 91 31 91 76 0 27-13 49-36 62 31 12 48 36 48 67 0 51-39 81-103 81H183V126Zm62 52v65h58c23 0 35-12 35-33s-12-32-35-32h-58Zm0 117v65h68c25 0 38-12 38-33s-13-32-38-32h-68Z" fill="#fff"/></svg>`;

let supabase;
const money = value => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const Logo = ({ size = 52 }) => <SvgXml xml={LOGO} width={size} height={size} />;
const Center = ({ children }) => <View style={styles.center}>{children}</View>;

async function getSupabase() {
  if (supabase) return supabase;
  const response = await fetch(`${SITE}/api/config`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível conectar ao Best Robux.');
  const config = await response.json();
  const url = config.supabaseUrl || config.url || config.SUPABASE_URL;
  const key = config.supabaseAnonKey || config.anonKey || config.SUPABASE_ANON_KEY || config.publicKey;
  if (!url || !key) throw new Error('Configuração do Supabase não encontrada.');
  supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'bestrobux-mobile' } });
  return supabase;
}

async function openSite(path = '/') {
  const url = path.startsWith('http') ? path : `${SITE}${path}`;
  try { await WebBrowser.openBrowserAsync(url, { toolbarColor: '#090a0b', controlsColor: '#e3343f', showTitle: true }); }
  catch { Alert.alert('Best Robux', 'Não foi possível abrir esta página.'); }
}

export default function App() {
  const [db, setDb] = useState(null);
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');

  const boot = useCallback(async () => {
    setBooting(true); setError('');
    try {
      const client = await getSupabase();
      setDb(client);
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      setSession(data.session || null);
    } catch (e) { setError(e?.message || 'Falha ao iniciar o aplicativo.'); }
    finally { setBooting(false); }
  }, []);

  useEffect(() => { boot(); }, [boot]);
  useEffect(() => {
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession || null));
    return () => data.subscription.unsubscribe();
  }, [db]);

  if (booting) return <Center><Logo size={92}/><Text style={styles.logoText}>BEST ROBUX</Text><ActivityIndicator size="large" color={COLORS.red}/><Text style={styles.muted}>Carregando...</Text></Center>;
  if (error) return <Center><Logo size={82}/><Text style={styles.title}>Best Robux</Text><Text style={styles.error}>{error}</Text><Button title="Tentar novamente" onPress={boot}/></Center>;
  return session ? <Store db={db} session={session}/> : <Auth db={db}/>;
}

function Auth({ db }) {
  const [signup, setSignup] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return Alert.alert('Atenção', 'Digite um e-mail válido.');
    if (password.length < 6) return Alert.alert('Atenção', 'A senha precisa ter pelo menos 6 caracteres.');
    setBusy(true);
    try {
      const result = signup ? await db.auth.signUp({ email: e, password }) : await db.auth.signInWithPassword({ email: e, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session) Alert.alert('Conta criada', 'Verifique seu e-mail para confirmar a conta.');
    } catch (e) { Alert.alert('Não foi possível continuar', e.message || 'Erro de autenticação.'); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return Alert.alert('Recuperar senha', 'Digite seu e-mail.');
    setBusy(true);
    try {
      const result = await db.auth.resetPasswordForEmail(e, { redirectTo: `${SITE}/reset-password.html` });
      if (result.error) throw result.error;
      Alert.alert('Pronto', 'Confira seu e-mail para redefinir a senha.');
    } catch (e) { Alert.alert('Recuperação', e.message || 'Não foi possível enviar o e-mail.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor={COLORS.bg}/>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.auth} keyboardShouldPersistTaps="handled">
        <Logo size={94}/><Text style={styles.logoText}>BEST ROBUX</Text><Text style={styles.muted}>Sua loja de Robux, rápida e segura.</Text>
        <View style={styles.authCard}><Text style={styles.title}>{signup ? 'Criar conta' : 'Bem-vindo de volta'}</Text><Text style={styles.muted}>{signup ? 'Crie sua conta para acompanhar seus pedidos.' : 'Entre para acessar sua loja.'}</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="E-mail" placeholderTextColor={COLORS.muted} keyboardType="email-address" autoCapitalize="none" style={styles.input}/>
          <TextInput value={password} onChangeText={setPassword} placeholder="Senha" placeholderTextColor={COLORS.muted} secureTextEntry style={styles.input}/>
          <Button title={busy ? 'Aguarde...' : signup ? 'Criar conta' : 'Entrar'} disabled={busy} onPress={submit}/>
          {!signup && <Pressable onPress={reset} style={styles.linkButton}><Text style={styles.link}>Esqueci minha senha</Text></Pressable>}
          <Pressable onPress={() => setSignup(v => !v)} style={styles.linkButton}><Text style={styles.link}>{signup ? 'Já tenho uma conta' : 'Criar uma conta'}</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Store({ db, session }) {
  const { width } = useWindowDimensions();
  const columns = width >= 720 ? 3 : width >= 480 ? 2 : 1;
  const [tab, setTab] = useState('home'), [products, setProducts] = useState([]), [orders, setOrders] = useState([]), [favorites, setFavorites] = useState(new Set());
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [selected, setSelected] = useState(null);
  const [brand, setBrand] = useState({ name: 'Best Robux', description: 'Escolha seu pacote e avance para o checkout.', logo: null, banner: null });

  const load = useCallback(async () => {
    try {
      const [brandResult, productResult, favoriteResult] = await Promise.all([
        db.from('site_settings').select('site_name,logo_url,banner_url,site_description').eq('id', true).maybeSingle(),
        db.from('products').select('id,name,method,robux,price,description,image_url,featured,badge,active,compare_at_price').eq('active', true).order('featured', { ascending: false }).order('created_at', { ascending: true }),
        db.from('product_favorites').select('product_id').eq('user_id', session.user.id)
      ]);
      if (productResult.error) throw productResult.error;
      setProducts(productResult.data || []);
      if (brandResult.data) setBrand({ name: brandResult.data.site_name || 'Best Robux', description: brandResult.data.site_description || 'Escolha seu pacote e avance para o checkout.', logo: brandResult.data.logo_url, banner: brandResult.data.banner_url });
      if (!favoriteResult.error) setFavorites(new Set((favoriteResult.data || []).map(x => x.product_id)));
    } catch (e) { Alert.alert('Best Robux', e.message || 'Não foi possível carregar a loja.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [db, session.user.id]);

  const loadOrders = useCallback(async () => {
    const result = await db.from('orders').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50);
    if (!result.error) setOrders(result.data || []);
  }, [db, session.user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);

  const shown = useMemo(() => products.filter(p => {
    const category = filter === 'all' || (filter === 'featured' ? !!p.featured : String(p.method || '').toLowerCase() === filter.toLowerCase());
    const q = query.trim().toLowerCase();
    const searchable = [p.name, p.method, p.description, p.badge, p.robux].filter(Boolean).join(' ').toLowerCase();
    return category && (!q || searchable.includes(q));
  }), [products, filter, query]);

  const toggleFavorite = async id => {
    const previous = new Set(favorites); const next = new Set(favorites);
    if (next.has(id)) next.delete(id); else next.add(id); setFavorites(next);
    const result = await db.rpc('toggle_product_favorite', { p_product_id: id });
    if (result.error) { setFavorites(previous); Alert.alert('Favoritos', result.error.message || 'Não foi possível atualizar o favorito.'); }
  };
  const buy = product => openSite(`/checkout.html?type=${encodeURIComponent(product.method || '')}&qty=${encodeURIComponent(product.robux || '')}`);

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor={COLORS.bg}/><Header brand={brand} email={session.user.email}/>
    {tab === 'home' && <FlatList key={String(columns)} data={shown} numColumns={columns} keyExtractor={x => String(x.id)} contentContainerStyle={styles.list} columnWrapperStyle={columns > 1 ? styles.column : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.red}/>} ListHeaderComponent={<Home brand={brand} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter}/>} renderItem={({ item }) => <ProductCard item={item} favorite={favorites.has(item.id)} onFavorite={() => toggleFavorite(item.id)} onBuy={() => buy(item)} onDetails={() => setSelected(item)}/>} ListEmptyComponent={loading ? <Center><ActivityIndicator color={COLORS.red}/><Text style={styles.muted}>Carregando produtos...</Text></Center> : <Empty text={query ? 'Nenhum produto encontrado.' : 'Nenhum produto disponível.'}/>}/>} />}
    {tab === 'favorites' && <Favorites products={products.filter(p => favorites.has(p.id))} onBuy={buy} onDetails={setSelected}/>} 
    {tab === 'orders' && <Orders orders={orders}/>} 
    {tab === 'profile' && <Profile session={session} brand={brand} logout={() => db.auth.signOut()}/>} 
    <Navigation tab={tab} setTab={setTab} favoriteCount={favorites.size}/>
    <RNModal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>{selected && <ProductModal item={selected} favorite={favorites.has(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onBuy={() => buy(selected)} close={() => setSelected(null)}/>}</RNModal>
  </SafeAreaView>;
}

function Header({ brand, email }) { return <View style={styles.header}><View style={styles.row}>{brand.logo ? <Image source={{ uri: brand.logo }} style={styles.logoSmall}/> : <Logo size={42}/>}<View style={styles.flex}><Text style={styles.brand}>{brand.name.toUpperCase()}</Text><Text style={styles.email} numberOfLines={1}>{email}</Text></View><Text style={styles.online}>● Online</Text></View></View>; }
function Home({ brand, query, setQuery, filter, setFilter }) { const filters = [['all','Todos'],['Gamepass','Gamepass'],['Robux Plus','Robux Plus'],['featured','Destaques']]; return <View><View style={styles.hero}>{brand.banner ? <Image source={{ uri: brand.banner }} style={styles.banner}/> : null}<Text style={styles.kicker}>BEST ROBUX</Text><Text style={styles.heroTitle}>Robux sem complicação.</Text><Text style={styles.accent}>Rápido. Simples. Profissional.</Text><Text style={styles.heroText}>{brand.description}</Text></View><View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Pesquisar produtos..." placeholderTextColor={COLORS.muted} style={styles.search}/>{query ? <Pressable onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable> : null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map(([value, label]) => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text></Pressable>)}</ScrollView><Text style={styles.section}>Produtos disponíveis</Text></View>; }
function ProductCard({ item, favorite, onFavorite, onBuy, onDetails }) { return <View style={styles.card}><View style={styles.media}><Pressable onPress={onDetails} style={styles.mediaPress}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage}/> : <View style={styles.productPlaceholder}><Text style={styles.placeholderText}>{item.method === 'Gamepass' ? 'R' : '+'}</Text></View>}</Pressable><Pressable onPress={onFavorite} style={styles.heart}><Text style={[styles.heartText, favorite && styles.heartOn]}>{favorite ? '♥' : '♡'}</Text></Pressable></View><Pressable onPress={onDetails}><Text style={styles.tag}>{item.badge || item.method || 'ROBux'}</Text><Text style={styles.cardTitle} numberOfLines={2}>{item.name || 'Produto'}</Text><Text style={styles.muted} numberOfLines={2}>{item.description || `${item.robux || ''} Robux`}</Text><Text style={styles.price}>{money(item.price)}</Text></Pressable><Button title="Comprar agora" onPress={onBuy}/></View>; }
function Favorites({ products, onBuy, onDetails }) { return <View style={styles.flex}><Text style={styles.pageTitle}>Favoritos</Text><FlatList data={products} keyExtractor={x => String(x.id)} contentContainerStyle={styles.list} renderItem={({ item }) => <ProductCard item={item} favorite onFavorite={() => {}} onBuy={() => onBuy(item)} onDetails={() => onDetails(item)}/>} ListEmptyComponent={<Empty text="Você ainda não adicionou favoritos."/>}/></View>; }
function Orders({ orders }) { return <View style={styles.flex}><Text style={styles.pageTitle}>Meus pedidos</Text><FlatList data={orders} keyExtractor={(x, i) => String(x.id || i)} contentContainerStyle={styles.list} renderItem={({ item }) => <View style={styles.order}><View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>{item.product_name || item.name || 'Pedido'}</Text><Text style={styles.muted}>{item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : ''}</Text></View><Text style={styles.price}>{money(item.total ?? item.price)}</Text></View><Text style={styles.status}>{String(item.status || 'pendente').toUpperCase()}</Text></View>} ListEmptyComponent={<Empty text="Você ainda não possui pedidos."/>}/></View>; }
function Profile({ session, brand, logout }) { return <ScrollView contentContainerStyle={styles.profile}><Logo size={78}/><Text style={styles.pageTitle}>{brand.name}</Text><Text style={styles.muted}>{session.user.email}</Text><View style={styles.profileCard}><Button title="Notificações" variant="secondary" onPress={() => openSite('/notifications.html')}/><Button title="Suporte" variant="secondary" onPress={() => openSite('/support.html')}/><Button title="Abrir site" variant="secondary" onPress={() => openSite('/')}/><Button title="Sair da conta" variant="danger" onPress={logout}/></View></ScrollView>; }
function ProductModal({ item, favorite, onFavorite, onBuy, close }) { return <View style={styles.overlay}><View style={styles.modal}><View style={styles.row}><Text style={styles.title}>Detalhes</Text><Pressable onPress={close}><Text style={styles.close}>×</Text></Pressable></View>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.modalImage}/> : <View style={styles.modalPlaceholder}><Text style={styles.placeholderText}>+</Text></View>}<Text style={styles.pageTitle}>{item.name}</Text><Text style={styles.muted}>{item.description || item.method}</Text><Text style={styles.total}>{money(item.price)}</Text><Button title={favorite ? '♥ Remover favorito' : '♡ Adicionar favorito'} variant="secondary" onPress={onFavorite}/><Button title="Comprar agora" onPress={onBuy}/></View></View>; }
function Navigation({ tab, setTab, favoriteCount }) { const items = [['home','Início'],['favorites',favoriteCount ? `Favoritos (${favoriteCount})` : 'Favoritos'],['orders','Pedidos'],['profile','Conta']]; return <View style={styles.nav}>{items.map(([value, label]) => <Pressable key={value} onPress={() => setTab(value)} style={styles.navItem}><Text style={[styles.navText, tab === value && styles.navActive]}>{label}</Text></Pressable>)}</View>; }
function Button({ title, onPress, disabled = false, variant = 'primary' }) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === 'secondary' && styles.secondary, variant === 'danger' && styles.danger, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.buttonText, variant !== 'primary' && styles.secondaryText]}>{title}</Text></Pressable>; }
function Empty({ text }) { return <View style={styles.empty}><Text style={styles.emptyTitle}>Nada por aqui</Text><Text style={styles.muted}>{text}</Text></View>; }

const COLORS = { bg: '#090a0b', panel: '#111417', panel2: '#171b1f', border: '#252a30', red: '#e3343f', redDark: '#a9242d', white: '#fff', text: '#f5f7f8', muted: '#8b949e', green: '#43d17a' };
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg }, flex: { flex: 1 }, center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  row: { flexDirection: 'row', alignItems: 'center' }, logoText: { color: COLORS.white, fontSize: 23, fontWeight: '900', letterSpacing: 2, marginTop: 10, marginBottom: 14 }, title: { color: COLORS.text, fontSize: 25, fontWeight: '800', marginBottom: 8 }, pageTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginHorizontal: 16, marginTop: 18, marginBottom: 8 },
  muted: { color: COLORS.muted, fontSize: 14, lineHeight: 20 }, error: { color: '#ff7880', textAlign: 'center', marginBottom: 18, maxWidth: 340 },
  auth: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 22, paddingBottom: 40 }, authCard: { width: '100%', maxWidth: 470, backgroundColor: COLORS.panel, borderColor: COLORS.border, borderWidth: 1, borderRadius: 22, padding: 22, marginTop: 26 }, input: { height: 52, backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, color: COLORS.text, paddingHorizontal: 15, marginTop: 12 }, linkButton: { alignItems: 'center', paddingVertical: 12 }, link: { color: '#ff6871', fontWeight: '700' },
  header: { backgroundColor: COLORS.bg, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 15, paddingVertical: 10 }, logoSmall: { width: 42, height: 42, borderRadius: 10 }, brand: { color: COLORS.white, fontWeight: '900', letterSpacing: 1.2, fontSize: 14 }, email: { color: COLORS.muted, fontSize: 11, marginTop: 2, maxWidth: 190 }, online: { color: COLORS.green, fontSize: 11, fontWeight: '700' },
  list: { paddingHorizontal: 14, paddingBottom: 110 }, column: { gap: 12 }, hero: { backgroundColor: COLORS.panel, borderColor: COLORS.border, borderWidth: 1, borderRadius: 22, padding: 20, marginTop: 14, overflow: 'hidden' }, banner: { width: '100%', height: 130, borderRadius: 14, marginBottom: 16 }, kicker: { color: COLORS.red, fontSize: 11, fontWeight: '900', letterSpacing: 2 }, heroTitle: { color: COLORS.text, fontSize: 28, lineHeight: 33, fontWeight: '900', marginTop: 5 }, accent: { color: '#ff6871', fontSize: 15, fontWeight: '800', marginTop: 5 }, heroText: { color: COLORS.muted, marginTop: 10, lineHeight: 20 }, searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel2, borderColor: COLORS.border, borderWidth: 1, borderRadius: 14, marginTop: 14, paddingHorizontal: 12 }, searchIcon: { color: COLORS.muted, fontSize: 25 }, search: { flex: 1, height: 50, color: COLORS.text, paddingHorizontal: 8 }, clear: { color: COLORS.muted, fontSize: 25, padding: 5 }, filters: { gap: 8, paddingVertical: 12 }, filter: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel }, filterActive: { backgroundColor: COLORS.red, borderColor: COLORS.red }, filterText: { color: COLORS.muted, fontWeight: '700' }, filterTextActive: { color: COLORS.white }, section: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  card: { flex: 1, minWidth: 0, backgroundColor: COLORS.panel, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 12, marginBottom: 12 }, media: { height: 155, borderRadius: 14, backgroundColor: '#0d0f11', overflow: 'hidden', position: 'relative' }, mediaPress: { flex: 1 }, productImage: { width: '100%', height: '100%', resizeMode: 'cover' }, productPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.redDark }, placeholderText: { color: COLORS.white, fontSize: 42, fontWeight: '900' }, heart: { position: 'absolute', right: 9, top: 9, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' }, heartText: { color: COLORS.white, fontSize: 24 }, heartOn: { color: '#ff5963' }, tag: { color: '#ff6871', fontSize: 10, fontWeight: '900', marginTop: 12, textTransform: 'uppercase' }, cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginTop: 4 }, price: { color: COLORS.white, fontSize: 19, fontWeight: '900', marginVertical: 10 },
  button: { minHeight: 48, borderRadius: 13, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 9 }, buttonText: { color: COLORS.white, fontSize: 14, fontWeight: '900' }, secondary: { backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.border }, secondaryText: { color: COLORS.text }, danger: { backgroundColor: '#40171a', borderWidth: 1, borderColor: '#713037' }, disabled: { opacity: .5 }, pressed: { opacity: .75 },
  nav: { position: 'absolute', left: 10, right: 10, bottom: 8, minHeight: 64, backgroundColor: '#121518', borderColor: COLORS.border, borderWidth: 1, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, elevation: 12 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58 }, navText: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' }, navActive: { color: '#ff6871' },
  order: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: 17, padding: 16, marginBottom: 10 }, status: { color: '#ff6871', fontWeight: '900', fontSize: 11, marginTop: 12 }, profile: { alignItems: 'center', padding: 22, paddingBottom: 120 }, profileCard: { width: '100%', maxWidth: 500, marginTop: 20 }, empty: { alignItems: 'center', padding: 40 }, emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'flex-end' }, modal: { backgroundColor: COLORS.panel, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, maxHeight: '88%', borderTopWidth: 1, borderColor: COLORS.border }, close: { color: COLORS.muted, fontSize: 34, marginLeft: 'auto' }, modalImage: { width: '100%', height: 220, borderRadius: 16, marginTop: 12, resizeMode: 'cover' }, modalPlaceholder: { height: 180, borderRadius: 16, backgroundColor: COLORS.redDark, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, total: { color: COLORS.white, fontSize: 27, fontWeight: '900', marginTop: 12 }
});
