(()=>{
  /* Navegação compartilhada — não altera o layout das páginas existentes. */
  const path=location.pathname.toLowerCase();
  const links=[
    ['Marketplace','/marketplace.html'],
    ['Carteira','/wallet.html'],
    ['Vender','/seller-register.html'],
    ['Pedidos','/orders.html'],
    ['Minha conta','/account.html']
  ];

  // Importante: este arquivo NÃO injeta sidebar, NÃO altera body/padding e
  // NÃO redireciona automaticamente. Cada página mantém seu próprio modelo.
  // A autenticação continua sendo responsabilidade da própria página.
  document.querySelectorAll('#rb-nav-style,.rb-nav,.rb-mobile,.rb-sheet').forEach(el=>el.remove());

  // Na loja principal, apenas acrescenta os atalhos ao cabeçalho já existente.
  const actions=document.querySelector('.headActions');
  if(actions && !actions.dataset.marketplaceNav){
    actions.dataset.marketplaceNav='1';
    const frag=document.createDocumentFragment();
    links.slice(0,2).forEach(([label,href])=>{
      const a=document.createElement('a');
      a.href=href;
      a.textContent=label;
      actions.prepend(a);
    });
  }

  // Nas páginas que já possuem navegação própria, não cria uma segunda.
  // Apenas garante que o link de retorno para o Marketplace/Wallet exista
  // quando o documento tiver um cabeçalho com ações.
  const nav=document.querySelector('header nav,header .nav');
  if(nav){
    const ensure=(label,href)=>{
      if(![...nav.querySelectorAll('a')].some(a=>a.getAttribute('href')===href)){
        const a=document.createElement('a');
        a.className='btn';
        a.href=href;
        a.textContent=label;
        nav.appendChild(a);
      }
    };
    ensure('Carteira','/wallet.html');
    ensure('Marketplace','/marketplace.html');
  }
})();