// ---------- estado ----------
const STORAGE_KEY = 'pdv_ponto_data_v2';
let db = loadDb();
let activeBrandId = null;   // marca aberta no modal de "adicionar item"
let openBrandRow = null;    // marca expandida na aba Marcas
let activeOrderId = null;   // pedido/cliente ativo para lançar itens

function ensureDbShape(data){
  if(!data.brands) data.brands = [];
  if(!data.products) data.products = [];
  if(!data.orders) data.orders = [];
  if(!data.restockSummary) data.restockSummary = {}; // acumulador de "itens a repor", garante compatibilidade com dados salvos antes dessa função existir
  if(!data.clients){
    // cliente agora é um cadastro fixo, independente de ter pedido ou não —
    // migra os nomes já existentes nos pedidos pra esse registro na primeira vez
    // (ou sempre que os dados vierem de um backup/nuvem antigos sem essa lista)
    const names = new Set();
    data.orders.forEach(o=>names.add(o.customer));
    data.clients = Array.from(names);
  }
  if(typeof data.freteValue !== 'number') data.freteValue = 0;
  return data;
}

function loadDb(){
  let data = { brands: [], products: [], orders: [] };
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) data = JSON.parse(raw);
  }catch(e){}
  return ensureDbShape(data);
  // status do pedido: 'aberto' -> 'aguardando_pagamento' -> 'pago'
}
function addClientIfNew(name){
  const exists = db.clients.some(c=>c.toLowerCase()===name.toLowerCase());
  if(!exists) db.clients.push(name);
}
function saveDb(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if(typeof pushToCloud === 'function') pushToCloud();
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function brl(n){ return 'R$ ' + (n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function orderTotal(o){
  const raw = o.items.reduce((a,i)=>a+i.final*i.qty,0);
  const disc = o.discount || 0;
  return Math.max(0, raw - disc);
}
function orderCost(o){ return o.items.reduce((a,i)=>a+i.cost*i.qty,0); }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 1700);
}

function activeOrder(){ return db.orders.find(o=>o.id===activeOrderId) || null; }

function updateHeader(){
  const el = document.getElementById('headerSub');
  const o = activeOrder();
  if(o && o.status==='aberto'){
    el.textContent = 'vendendo para ' + o.customer;
    el.classList.add('active-client');
  } else {
    el.textContent = 'vendas & estoque';
    el.classList.remove('active-client');
  }

  const activeBtn = document.querySelector('nav.bottom button.active');
  const view = activeBtn ? activeBtn.dataset.view : 'clientes';
  document.getElementById('freteDot').style.display = (view==='itens') ? 'block' : 'none';
  document.getElementById('siteBtn').style.display = (view==='marcas') ? 'flex' : 'none';

  const hasFrete = o && o.items.some(i=>i.isFrete);
  document.getElementById('freteDot').classList.toggle('on', !!hasFrete);
}

// ---------- navegação ----------
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('nav.bottom button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  if(name==='clientes') renderClientesPickList();
  if(name==='marcas') renderBrands();
  if(name==='vendas') renderVendas();
  if(name==='itens') renderItens();
  if(name==='relatorio') renderRelatorio();
  if(name==='historico') renderClientList();
  updateHeader();
}

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function closeModalBg(ev,id){ if(ev.target.id===id) closeModal(id); }

// ---------- clientes / pedidos ----------
function submitClient(ev){
  ev.preventDefault();
  const name = document.getElementById('newClientName').value.trim();
  if(!name) return false;
  document.getElementById('newClientName').value = '';
  closeModal('modalClient');
  startSaleForClient(name);
  return false;
}

function startSaleForClient(name){
  addClientIfNew(name);
  // reaproveita pedido em aberto existente desse cliente, se houver
  let order = db.orders.find(o=>o.customer.toLowerCase()===name.toLowerCase() && o.status==='aberto');
  if(!order){
    order = { id: uid(), customer: name, status: 'aberto', items: [], createdAt: new Date().toISOString() };
    db.orders.push(order);
  }
  saveDb();
  activeOrderId = order.id;
  toast('Vendendo para ' + name + ' — selecione as marcas');
  switchView('marcas');
}

function renderClientesPickList(){
  const list = db.clients.map(name=>{
    const orders = db.orders.filter(o=>o.customer.toLowerCase()===name.toLowerCase());
    let lastDate = null;
    orders.forEach(o=>{ const d = orderDate(o); if(!lastDate || d>lastDate) lastDate = d; });
    return { name, lastDate };
  }).sort((a,b)=>{
    if(a.lastDate && b.lastDate) return b.lastDate - a.lastDate;
    if(a.lastDate) return -1;
    if(b.lastDate) return 1;
    return a.name.localeCompare(b.name, 'pt-BR', {sensitivity:'base'});
  });
  const el = document.getElementById('clientesPickList');
  if(list.length===0){
    el.innerHTML = '<div class="empty">Nenhum cliente cadastrado ainda.<br>Toque em "Novo cliente" para começar.</div>';
    return;
  }
  el.innerHTML = list.map(c=>{
    const dstr = c.lastDate
      ? c.lastDate.toLocaleDateString('pt-BR') + ' ' + c.lastDate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
      : 'ainda sem compras';
    const safeName = escapeHtml(c.name).replace(/'/g,"\\'");
    return `
      <div class="client-pick-row"
           onpointerdown="lpStart(event,'client','${safeName}')" onpointerup="lpEnd()" onpointerleave="lpEnd()" onpointercancel="lpEnd()" onpointermove="lpMove(event)">
        <div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="date">última atividade ${dstr}</div>
        </div>
        <button class="btn-primary btn-small" onpointerdown="event.stopPropagation()" onclick="startSaleForClient('${safeName}')">Iniciar venda</button>
      </div>
    `;
  }).join('');
}

function selectExistingOrder(id){
  const o = db.orders.find(x=>x.id===id);
  if(!o) return;
  activeOrderId = id;
  if(o.status==='aberto'){
    toast('Continuando venda de ' + o.customer);
    switchView('marcas');
  } else {
    switchView('vendas');
  }
}

let expandedClients = new Set();

function orderDate(o){ return new Date(o.paidAt || o.finalizedAt || o.createdAt); }

function toggleClientExpand(key){
  if(lpFired){ lpFired=false; return; }
  if(expandedClients.has(key)) expandedClients.delete(key); else expandedClients.add(key);
  renderClientList();
}

function renderClientList(){
  const q = (document.getElementById('custSearch').value||'').trim().toLowerCase();
  const byCustomer = {};
  db.clients.forEach(name=>{ byCustomer[name.toLowerCase()] = { name, orders: [] }; });
  db.orders.forEach(o=>{
    const key = o.customer.toLowerCase();
    if(!byCustomer[key]) byCustomer[key] = { name:o.customer, orders:[] };
    byCustomer[key].orders.push(o);
  });
  let keys = Object.keys(byCustomer);
  if(q) keys = keys.filter(k=>k.includes(q));
  keys.sort((a,b)=>{
    const oa = byCustomer[a].orders, ob = byCustomer[b].orders;
    const da = oa.length ? Math.max(...oa.map(orderDate)) : -1;
    const db_ = ob.length ? Math.max(...ob.map(orderDate)) : -1;
    if(da!==db_) return db_-da;
    return byCustomer[a].name.localeCompare(byCustomer[b].name, 'pt-BR', {sensitivity:'base'});
  });

  const list = document.getElementById('clientList');
  if(keys.length===0){
    list.innerHTML = '<div class="empty">Nenhum cliente ainda.<br>Toque em "Novo cliente" para começar uma venda.</div>';
    return;
  }
  list.innerHTML = keys.map(key=>{
    const c = byCustomer[key];
    const sorted = [...c.orders].sort((a,b)=>orderDate(b)-orderDate(a));
    const dstr = sorted.length
      ? orderDate(sorted[0]).toLocaleDateString('pt-BR') + ' ' + orderDate(sorted[0]).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
      : 'ainda sem compras';
    const isOpen = expandedClients.has(key);
    const safeName = escapeHtml(c.name).replace(/'/g,"\\'");
    return `
      <div class="client-row ${isOpen?'open':''}" onclick="toggleClientExpand('${key}')"
           onpointerdown="lpStart(event,'client','${safeName}')" onpointerup="lpEnd()" onpointerleave="lpEnd()" onpointercancel="lpEnd()" onpointermove="lpMove(event)">
        <div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="date">última compra ${dstr}</div>
        </div>
        <div class="chev">›</div>
      </div>
      <div class="client-body ${isOpen?'open':''}">
        ${sorted.length ? sorted.map(o=>orderCard(o, false, true)).join('') : '<div class="empty" style="padding:12px 4px">Nenhuma compra ainda.</div>'}
      </div>
    `;
  }).join('');
}

let expandedOrders = new Set();

function toggleOrderExpand(id){
  if(lpFired){ lpFired=false; return; }
  if(expandedOrders.has(id)) expandedOrders.delete(id); else expandedOrders.add(id);
  refreshActiveView();
}

function refreshActiveView(){
  const activeBtn = document.querySelector('nav.bottom button.active');
  const name = activeBtn ? activeBtn.dataset.view : 'marcas';
  if(name==='clientes') renderClientesPickList();
  if(name==='marcas') renderBrands();
  if(name==='vendas') renderVendas();
  if(name==='itens') renderItens();
  if(name==='relatorio') renderRelatorio();
  if(name==='historico') renderClientList();
  updateHeader();
}

function sortedItems(o){
  // itens normais na ordem que foram lançados, frete sempre por último — não importa quando foi adicionado
  return [...o.items].sort((a,b)=> (a.isFrete?1:0) - (b.isFrete?1:0));
}

function orderCard(o, withActions, compact){
  const total = orderTotal(o);
  const isOpen = expandedOrders.has(o.id);
  const displayItems = sortedItems(o);
  const itemsStr = displayItems.length ? displayItems.map(i=>`${i.qty}× ${escapeHtml(i.name)}`).join(', ') : 'nenhum item ainda';
  const d = new Date(o.paidAt || o.finalizedAt || o.createdAt);
  const dstr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const badge = o.status==='aberto' ? '<span class="badge aberto">em aberto</span>'
              : o.status==='aguardando_pagamento' ? '<span class="badge aguardando">aguard. pagamento</span>'
              : '<span class="badge pago">pago</span>';

  const itemsDetail = isOpen && displayItems.length ? `
    <div class="items-detail">
      ${displayItems.map(i=>`
        <div class="item-detail-row ${i.isFrete?'frete-row':''}">
          <span>${i.isFrete?'🚚 ':''}${i.qty}× ${escapeHtml(i.name)} <span class="u">(${brl(i.final)} un)</span></span>
          <span>${brl(i.final*i.qty)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  let actions = '';
  if(withActions){
    if(o.status==='aberto'){
      actions = `
        <div class="actions">
          <button class="btn-ghost btn-small" onpointerdown="event.stopPropagation()" onclick="selectExistingOrder('${o.id}')">Continuar</button>
          <button class="btn-blue btn-small" onpointerdown="event.stopPropagation()" onclick="finalizeOrder('${o.id}')">Finalizar</button>
        </div>`;
    } else if(o.status==='aguardando_pagamento'){
      actions = `
        <div class="actions">
          <button class="btn-primary btn-small" onpointerdown="event.stopPropagation()" onclick="openPixModal('${o.id}')">Confirmar pagamento</button>
        </div>`;
    }
  }

  const pixThumbInner = o.pixType==='pdf'
    ? `<div class="pix-pdf-icon">📄</div><span>ver comprovante (PDF)</span>`
    : `<img src="${o.pixAttachment}" alt="comprovante"><span>ver comprovante</span>`;
  const pixLine = (o.status==='pago' && o.pixAttachment)
    ? `<div class="pix-thumb" onpointerdown="event.stopPropagation()" onclick="viewPixAttachment('${o.id}')">${pixThumbInner}</div>`
    : '';
  const discountBtn = (o.status==='aguardando_pagamento')
    ? `<button class="discount-btn" onpointerdown="event.stopPropagation()" onclick="openDiscountModal('${o.id}')">${o.discount ? 'Desconto: '+brl(o.discount) : 'Desconto'}</button>`
    : '';
  const headRow = compact
    ? `<div class="head" style="justify-content:flex-end">${discountBtn}${badge}</div>`
    : `<div class="head"><div class="cust">${escapeHtml(o.customer)}</div><div style="display:flex; align-items:center; gap:8px">${discountBtn}${badge}</div></div>`;

  const compactDeleteBtn = compact
    ? `<button class="btn-danger btn-small" style="border:1px solid #3a2320" onpointerdown="event.stopPropagation()" onclick="deleteOrder('${o.id}')">🗑️ Excluir esta compra</button>`
    : '';

  return `
    <div class="order-card ${o.status==='pago'?'pago':''}"
         onpointerdown="lpStart(event,'order','${o.id}')" onpointerup="lpEnd()" onpointerleave="lpEnd()" onpointercancel="lpEnd()" onpointermove="lpMove(event)">
      ${headRow}
      <div class="meta">${dstr}</div>
      <div class="items" onclick="toggleOrderExpand('${o.id}')">
        <span class="chev">${isOpen?'▾':'▸'}</span>
        <span>${itemsStr}</span>
      </div>
      ${itemsDetail}
      ${pixLine}
      <div class="foot">
        <div class="tot">${brl(total)}</div>
        ${actions}
        ${compactDeleteBtn}
      </div>
    </div>
  `;
}

// ---------- marcas ----------
let editingBrandId = null;
let editingProductId = null;
let editingOrderId = null;
let editingClientName = null;
let longPressTimer = null;

// ---------- toque longo (editar/excluir) ----------
let lpTimer = null;
let lpStartX = 0, lpStartY = 0;
let lpFired = false;
let contextTarget = null; // { type: 'brand'|'product', id }

function lpStart(ev, type, id){
  const t = ev.touches ? ev.touches[0] : ev;
  lpStartX = t.clientX; lpStartY = t.clientY;
  lpFired = false;
  clearTimeout(lpTimer);
  lpTimer = setTimeout(()=>{
    lpFired = true;
    if(navigator.vibrate) navigator.vibrate(15);
    showItemActions(type, id);
  }, 480);
}
function lpMove(ev){
  const t = ev.touches ? ev.touches[0] : ev;
  if(Math.abs(t.clientX-lpStartX)>10 || Math.abs(t.clientY-lpStartY)>10) clearTimeout(lpTimer);
}
function lpEnd(){ clearTimeout(lpTimer); }

function showItemActions(type, id){
  contextTarget = { type, id };
  let title = '';
  if(type==='brand') title = (db.brands.find(x=>x.id===id)||{}).name || '';
  else if(type==='product') title = (db.products.find(x=>x.id===id)||{}).name || '';
  else if(type==='order') title = (db.orders.find(x=>x.id===id)||{}).customer || '';
  else if(type==='client') title = id; // id é o próprio nome do cliente
  document.getElementById('itemActionsTitle').textContent = title;
  document.getElementById('actionDeleteBtn').textContent = (type==='client') ? '🗑️ Excluir cliente (apaga tudo)' : '🗑️ Excluir';
  openModal('modalItemActions');
}

function actionEdit(){
  closeModal('modalItemActions');
  if(!contextTarget) return;
  if(contextTarget.type==='brand') openEditBrandModal(contextTarget.id);
  else if(contextTarget.type==='product') openEditProductModal(contextTarget.id);
  else if(contextTarget.type==='order') openEditOrderModal(contextTarget.id);
  else if(contextTarget.type==='client') openEditClientModal(contextTarget.id);
}

function actionDelete(){
  closeModal('modalItemActions');
  if(!contextTarget) return;
  if(contextTarget.type==='brand') deleteBrand(contextTarget.id);
  else if(contextTarget.type==='product') deleteProduct(contextTarget.id);
  else if(contextTarget.type==='order') deleteOrder(contextTarget.id);
  else if(contextTarget.type==='client') deleteClient(contextTarget.id);
}

function openNewBrandModal(){
  editingBrandId = null;
  document.getElementById('modalBrandTitle').textContent = 'Nova marca';
  document.getElementById('newBrandName').value = '';
  document.getElementById('submitBrandBtn').textContent = 'Adicionar';
  openModal('modalBrand');
}

function openEditBrandModal(brandId){
  const b = db.brands.find(x=>x.id===brandId);
  if(!b) return;
  editingBrandId = brandId;
  document.getElementById('modalBrandTitle').textContent = 'Editar marca';
  document.getElementById('newBrandName').value = b.name;
  document.getElementById('submitBrandBtn').textContent = 'Salvar';
  openModal('modalBrand');
}

function submitBrand(ev){
  ev.preventDefault();
  const name = document.getElementById('newBrandName').value.trim();
  if(!name) return false;
  if(editingBrandId){
    const b = db.brands.find(x=>x.id===editingBrandId);
    if(b) b.name = name;
    toast('Marca atualizada');
  } else {
    db.brands.push({ id: uid(), name });
    toast('Marca adicionada');
  }
  editingBrandId = null;
  saveDb();
  document.getElementById('newBrandName').value = '';
  closeModal('modalBrand');
  renderBrands();
  return false;
}

function deleteBrand(brandId){
  const b = db.brands.find(x=>x.id===brandId);
  if(!b) return;
  const count = db.products.filter(p=>p.brandId===brandId).length;
  const msg = count>0
    ? `Excluir a marca "${b.name}" e os ${count} item${count>1?'ns':''} dela? Essa ação não pode ser desfeita.`
    : `Excluir a marca "${b.name}"?`;
  if(!confirm(msg)) return;
  db.brands = db.brands.filter(x=>x.id!==brandId);
  db.products = db.products.filter(p=>p.brandId!==brandId);
  saveDb();
  if(openBrandRow===brandId) openBrandRow = null;
  renderBrands();
  toast('Marca excluída');
}

function renderMarcasActiveBar(){
  const el = document.getElementById('marcasActiveBar');
  const o = activeOrder();
  if(o && o.status==='aberto'){
    const total = orderTotal(o);
    const count = o.items.reduce((a,i)=>a+i.qty,0);
    el.innerHTML = `
      <div class="active-bar">
        <div class="who"><b>${escapeHtml(o.customer)}</b>
          <span class="t">${count} item${count!==1?'s':''} · ${brl(total)}</span>
        </div>
        <button onclick="goToVendasFromMarcas()">Ver venda</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="no-client-banner">
        <p>Selecione um cliente para começar a lançar itens na venda.</p>
        <button class="btn-primary" onclick="switchView('clientes')">Ir para Clientes</button>
      </div>`;
  }
}

function goToVendasFromMarcas(){ switchView('vendas'); }

function renderMarcasFinishBar(){
  const el = document.getElementById('marcasFinishBar');
  const o = activeOrder();
  if(o && o.status==='aberto' && o.items.length>0){
    const total = orderTotal(o);
    el.innerHTML = `
      <div class="finish-bar">
        <div>
          <div class="lbl">Total — ${escapeHtml(o.customer)}</div>
          <div class="tot">${brl(total)}</div>
        </div>
        <button class="btn-primary" onclick="finalizeOrder('${o.id}')">Finalizar venda</button>
      </div>`;
  } else {
    el.innerHTML = '';
  }
}

// ---------- frete (item fixo, sempre primeiro em Marcas, sempre último no pedido) ----------
function renderFreteCard(){
  const el = document.getElementById('freteCard');
  const o = activeOrder();
  const hasFrete = o && o.status==='aberto' && o.items.some(i=>i.isFrete);
  el.innerHTML = `
    <div class="frete-card ${hasFrete?'added':''}">
      <div onclick="toggleFrete()" style="flex:1; display:flex; justify-content:space-between; align-items:center">
        <div>
          <div class="label">Frete</div>
          <div class="name">${hasFrete ? 'Adicionado ao pedido' : 'Toque pra adicionar ao pedido'}</div>
        </div>
        <div class="right">
          <div class="val">${brl(db.freteValue)}</div>
          <div class="hint">${hasFrete ? 'toque pra remover' : 'toque pra adicionar'}</div>
        </div>
      </div>
      <div class="editpin" onclick="event.stopPropagation(); editFreteValue()">✏️</div>
    </div>
  `;
}

function toggleFrete(){
  const o = activeOrder();
  if(!o || o.status!=='aberto'){ noClientWarning(); return; }
  const has = o.items.some(i=>i.isFrete);
  if(has){
    o.items = o.items.filter(i=>!i.isFrete);
  } else {
    o.items.push({ productId:'FRETE', name:'Frete', qty:1, cost:0, final: db.freteValue, isFrete:true });
  }
  saveDb();
  renderFreteCard();
  updateHeader();
}

function editFreteValue(){
  const val = prompt('Valor do frete (R$):', db.freteValue.toFixed(2).replace('.',','));
  if(val===null) return;
  const num = parseFloat(val.replace(',','.'));
  if(isNaN(num) || num<0){ toast('Valor inválido'); return; }
  db.freteValue = num;
  // atualiza o frete já lançado em pedidos em aberto, se houver
  const o = activeOrder();
  if(o && o.status==='aberto'){
    const f = o.items.find(i=>i.isFrete);
    if(f) f.final = num;
  }
  saveDb();
  renderFreteCard();
  toast('Frete atualizado — ' + brl(num));
}

function renderBrands(){
  renderMarcasActiveBar();
  renderFreteCard();
  renderMarcasFinishBar();
  const list = document.getElementById('brandList');
  if(db.brands.length===0){
    list.innerHTML = '<div class="empty">Nenhuma marca cadastrada ainda.<br>Toque em "Nova marca" para começar.</div>';
    return;
  }
  list.innerHTML = db.brands.map(b=>{
    const prods = db.products.filter(p=>p.brandId===b.id)
      .sort((a,b)=>a.name.localeCompare(b.name, 'pt-BR', {sensitivity:'base'}));
    const isOpen = openBrandRow===b.id;
    return `
      <div class="brand-row ${isOpen?'open':''}" onclick="toggleBrand('${b.id}')"
           onpointerdown="lpStart(event,'brand','${b.id}')" onpointerup="lpEnd()" onpointerleave="lpEnd()" onpointercancel="lpEnd()" onpointermove="lpMove(event)">
        <div>
          <div class="name">${escapeHtml(b.name)}</div>
          <div class="count">${prods.length} item${prods.length!==1?'s':''}</div>
        </div>
        <div class="chev">›</div>
      </div>
      <div class="brand-body ${isOpen?'open':''}" id="brand-body-${b.id}">
        <div class="card">
          ${prods.length? prods.map(p=>productRow(p)).join('') : '<div class="empty" style="padding:14px 0">Nenhum item nesta marca.</div>'}
          <button class="btn-ghost btn-full" style="margin-top:8px" onclick="event.stopPropagation(); openProductModal('${b.id}')">+ Adicionar item</button>
        </div>
      </div>
    `;
  }).join('');
}

function productRow(p){
  const o = activeOrder();
  const inCart = o && o.status==='aberto' ? o.items.find(i=>i.productId===p.id) : null;
  const qty = inCart ? inCart.qty : 0;
  const canSell = o && o.status==='aberto';

  let control;
  if(!canSell){
    control = `<button class="add-qty-btn" onclick="event.stopPropagation(); noClientWarning()">+</button>`;
  } else if(qty>0){
    control = `
      <div class="qty-box" onclick="event.stopPropagation()">
        <button onclick="changeOrderQty('${p.id}', -1)">−</button>
        <div class="n">${qty}</div>
        <button onclick="changeOrderQty('${p.id}', 1)">+</button>
      </div>`;
  } else {
    control = `<button class="add-qty-btn" onclick="event.stopPropagation(); changeOrderQty('${p.id}', 1)">+</button>`;
  }

  return `
    <div class="product-item"
         onpointerdown="lpStart(event,'product','${p.id}')" onpointerup="lpEnd()" onpointerleave="lpEnd()" onpointercancel="lpEnd()" onpointermove="lpMove(event)">
      <div class="left">
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="pmeta">estoque ${p.stock}un</div>
      </div>
      <div class="right">
        <div class="pprice">${brl(p.final)}</div>
        ${control}
      </div>
    </div>
  `;
}

function noClientWarning(){
  toast('Selecione um cliente primeiro');
  switchView('clientes');
}

function toggleBrand(id){
  if(lpFired){ lpFired=false; return; }
  openBrandRow = (openBrandRow===id) ? null : id;
  renderBrands();
}

function openProductModal(brandId){
  activeBrandId = brandId;
  editingProductId = null;
  const brand = db.brands.find(b=>b.id===brandId);
  document.getElementById('modalProductTitle').textContent = 'Novo item — ' + brand.name;
  document.getElementById('submitProductBtn').textContent = 'Adicionar item';
  document.getElementById('newProdName').value = '';
  document.getElementById('newProdCost').value = '';
  document.getElementById('newProdFinal').value = '';
  document.getElementById('newProdStock').value = '';
  updateProdPreview();
  openModal('modalProduct');
}

function openEditProductModal(productId){
  const p = db.products.find(x=>x.id===productId);
  if(!p) return;
  const brand = db.brands.find(b=>b.id===p.brandId);
  activeBrandId = p.brandId;
  editingProductId = productId;
  document.getElementById('modalProductTitle').textContent = 'Editar item — ' + (brand?brand.name:'');
  document.getElementById('submitProductBtn').textContent = 'Salvar';
  document.getElementById('newProdName').value = p.name;
  document.getElementById('newProdCost').value = p.cost;
  document.getElementById('newProdFinal').value = p.final;
  document.getElementById('newProdStock').value = p.stock;
  updateProdPreview();
  openModal('modalProduct');
}

function updateProdPreview(){
  const cost = parseFloat(document.getElementById('newProdCost').value) || 0;
  const final = parseFloat(document.getElementById('newProdFinal').value) || 0;
  const profit = final - cost;
  document.getElementById('prodPreview').textContent = 'Lucro por unidade: ' + brl(profit);
}

function submitProduct(ev){
  ev.preventDefault();
  const name = document.getElementById('newProdName').value.trim();
  const cost = parseFloat(document.getElementById('newProdCost').value);
  const final = parseFloat(document.getElementById('newProdFinal').value);
  const stock = parseInt(document.getElementById('newProdStock').value)||0;
  if(!name || isNaN(cost) || isNaN(final)) return false;

  if(editingProductId){
    const p = db.products.find(x=>x.id===editingProductId);
    if(p){
      p.name = name; p.cost = cost; p.final = final; p.stock = stock;
    }
    toast('Item atualizado');
  } else {
    db.products.push({ id: uid(), brandId: activeBrandId, name, cost, final, stock });
    toast('Item adicionado');
  }
  editingProductId = null;

  saveDb();
  document.getElementById('newProdName').value='';
  document.getElementById('newProdCost').value='';
  document.getElementById('newProdFinal').value='';
  document.getElementById('newProdStock').value='';
  updateProdPreview();
  closeModal('modalProduct');
  openBrandRow = activeBrandId;
  renderBrands();
  return false;
}

function deleteProduct(productId){
  const p = db.products.find(x=>x.id===productId);
  if(!p) return;
  if(!confirm(`Excluir "${p.name}"? Vendas já registradas não são afetadas.`)) return;
  db.products = db.products.filter(x=>x.id!==productId);
  saveDb();
  renderBrands();
  toast('Item excluído');
}

// ---------- lançamento de itens no pedido ativo ----------
function changeOrderQty(productId, delta){
  const o = activeOrder();
  if(!o || o.status!=='aberto'){ noClientWarning(); return; }
  const p = db.products.find(x=>x.id===productId);
  let entry = o.items.find(i=>i.productId===productId);
  const currentQty = entry ? entry.qty : 0;
  const newQty = currentQty + delta;

  if(newQty<=0){
    if(entry) o.items = o.items.filter(i=>i.productId!==productId);
  } else if(newQty>p.stock){
    toast('Estoque máximo: '+p.stock);
    return;
  } else if(entry){
    entry.qty = newQty;
  } else {
    o.items.push({ productId:p.id, name:p.name, qty:newQty, cost:p.cost, final:p.final });
  }
  saveDb();
  renderBrands();
  updateHeader();
}

// ---------- transições de status do pedido ----------
function finalizeOrder(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  if(o.items.length===0){ toast('Adicione itens antes de finalizar'); return; }

  // confere estoque e dá baixa
  for(const it of o.items){
    if(it.isFrete) continue;
    const p = db.products.find(x=>x.id===it.productId);
    if(!p || it.qty>p.stock){ toast('Estoque insuficiente: '+it.name); return; }
  }
  o.items.forEach(it=>{
    if(it.isFrete) return;
    const p = db.products.find(x=>x.id===it.productId);
    p.stock -= it.qty;
  });

  o.status = 'aguardando_pagamento';
  o.finalizedAt = new Date().toISOString();
  saveDb();
  toast('Pedido de ' + o.customer + ' aguardando pagamento');
  if(activeOrderId===orderId) activeOrderId = null;
  switchView('vendas');
}

let pendingPixOrderId = null;
let pendingPixAttachment = null;
let pendingPixType = null; // 'image' | 'pdf'

let discountOrderId = null;

function openDiscountModal(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  discountOrderId = orderId;
  const raw = o.items.reduce((a,i)=>a+i.final*i.qty,0);
  document.getElementById('discountOrderInfo').textContent = o.customer + ' · total sem desconto: ' + brl(raw);
  document.getElementById('discountInput').value = o.discount || '';
  openModal('modalDiscount');
}

function submitDiscount(ev){
  ev.preventDefault();
  const o = db.orders.find(x=>x.id===discountOrderId);
  if(!o) return false;
  const val = parseFloat(document.getElementById('discountInput').value) || 0;
  const raw = o.items.reduce((a,i)=>a+i.final*i.qty,0);
  if(val > raw){ toast('Desconto maior que o total do pedido'); return false; }
  o.discount = val > 0 ? val : undefined;
  if(!o.discount) delete o.discount;
  saveDb();
  closeModal('modalDiscount');
  toast(val>0 ? 'Desconto de '+brl(val)+' aplicado' : 'Desconto removido');
  discountOrderId = null;
  refreshActiveView();
  return false;
}

function openPixModal(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  pendingPixOrderId = orderId;
  pendingPixAttachment = null;
  pendingPixType = null;
  document.getElementById('pixOrderInfo').textContent = o.customer + ' · ' + brl(orderTotal(o));
  document.getElementById('pixFileInput').value = '';
  document.getElementById('pixPreviewBox').style.display = 'none';
  document.getElementById('attachBtnText').textContent = '📎 Anexar comprovante';
  openModal('modalPix');
}

function handlePixFileSelect(ev){
  const file = ev.target.files[0];
  if(!file) return;

  if(file.type === 'application/pdf'){
    const reader = new FileReader();
    reader.onload = function(e){
      pendingPixAttachment = e.target.result;
      pendingPixType = 'pdf';
      document.getElementById('pixPreviewImg').style.display = 'none';
      document.getElementById('pixPreviewPdf').style.display = 'flex';
      document.getElementById('pixPreviewPdfName').textContent = file.name;
      document.getElementById('pixPreviewBox').style.display = 'flex';
      document.getElementById('attachBtnText').textContent = '📎 Trocar comprovante';
    };
    reader.readAsDataURL(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      // reduz o tamanho da foto antes de guardar (localStorage tem limite)
      const maxSide = 900;
      let w = img.width, h = img.height;
      if(w>h && w>maxSide){ h = Math.round(h*(maxSide/w)); w = maxSide; }
      else if(h>=w && h>maxSide){ w = Math.round(w*(maxSide/h)); h = maxSide; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      pendingPixAttachment = canvas.toDataURL('image/jpeg', 0.72);
      pendingPixType = 'image';
      document.getElementById('pixPreviewImg').src = pendingPixAttachment;
      document.getElementById('pixPreviewImg').style.display = 'block';
      document.getElementById('pixPreviewPdf').style.display = 'none';
      document.getElementById('pixPreviewBox').style.display = 'flex';
      document.getElementById('attachBtnText').textContent = '📎 Trocar comprovante';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearPixAttachment(){
  pendingPixAttachment = null;
  pendingPixType = null;
  document.getElementById('pixFileInput').value = '';
  document.getElementById('pixPreviewBox').style.display = 'none';
  document.getElementById('attachBtnText').textContent = '📎 Anexar comprovante';
}

function submitPixConfirm(ev){
  ev.preventDefault();
  confirmPayment(pendingPixOrderId, pendingPixAttachment, pendingPixType);
  closeModal('modalPix');
  return false;
}

function viewPixAttachment(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o || !o.pixAttachment) return;
  if(o.pixType==='pdf'){
    window.open(o.pixAttachment, '_blank');
    return;
  }
  document.getElementById('imageViewSrc').src = o.pixAttachment;
  openModal('modalImageView');
}

function confirmPayment(orderId, pixAttachment, pixType){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  o.status = 'pago';
  o.paidAt = new Date().toISOString();
  if(pixAttachment){ o.pixAttachment = pixAttachment; o.pixType = pixType || 'image'; }
  saveDb();
  toast('Pagamento de ' + o.customer + ' confirmado — lançado em vendas');
  renderVendas();
  renderItens();
}

// ---------- editar / excluir pedido ----------
function restoreStockForOrder(o){
  // devolve pro estoque os itens de um pedido que já tinha dado baixa (aguardando_pagamento ou pago)
  o.items.forEach(it=>{
    const p = db.products.find(x=>x.id===it.productId);
    if(p) p.stock += it.qty;
  });
  // se já tinha ido pro "itens a repor", tira de lá também
  if(o.status==='pago' && o.restocked){
    o.items.forEach(it=>{
      const r = db.restockSummary[it.productId];
      if(r){
        r.qty -= it.qty;
        if(r.qty<=0) delete db.restockSummary[it.productId];
      }
    });
  }
}

function openEditOrderModal(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  editingOrderId = orderId;
  document.getElementById('editOrderCustomer').value = o.customer;
  document.getElementById('editOrderStatusNote').textContent =
    o.status==='aberto' ? 'Pedido ainda em aberto — sem baixa de estoque.'
    : o.status==='aguardando_pagamento' ? 'Já deu baixa no estoque — ajustar quantidade aqui corrige o estoque junto.'
    : 'Pedido pago — ajustar quantidade aqui corrige estoque e o relatório junto.';
  document.getElementById('editOrderItems').innerHTML = o.items.filter(it=>!it.isFrete).map(it=>`
    <div class="product-item" style="padding:9px 4px">
      <div class="left">
        <div class="pname">${escapeHtml(it.name)}</div>
        <div class="pmeta">${brl(it.final)} un</div>
      </div>
      <div class="right">
        <div class="qty-box">
          <button type="button" onclick="editOrderQtyChange('${it.productId}',-1)">−</button>
          <div class="n" id="editQty-${it.productId}">${it.qty}</div>
          <button type="button" onclick="editOrderQtyChange('${it.productId}',1)">+</button>
        </div>
      </div>
    </div>
  `).join('');
  openModal('modalEditOrder');
}

function editOrderQtyChange(productId, delta){
  const o = db.orders.find(x=>x.id===editingOrderId);
  if(!o) return;
  const it = o.items.find(i=>i.productId===productId);
  if(!it) return;
  const p = db.products.find(x=>x.id===productId);
  const newQty = it.qty + delta;
  if(newQty<0) return;

  if(o.status==='aberto'){
    // estoque ainda não foi baixado pra esse pedido — só valida o teto disponível
    if(delta>0 && p && newQty>p.stock){ toast('Estoque máximo: '+p.stock); return; }
  } else {
    // estoque já baixado — ajusta em tempo real (aumentar pede mais estoque, diminuir devolve)
    if(delta>0 && p && p.stock<=0){ toast('Sem estoque disponível'); return; }
    if(p) p.stock -= delta;
    if(o.status==='pago' && o.restocked && db.restockSummary[productId]){
      db.restockSummary[productId].qty -= delta;
      if(db.restockSummary[productId].qty<=0) delete db.restockSummary[productId];
    }
  }

  it.qty = newQty;
  document.getElementById('editQty-'+productId).textContent = newQty;
}

function submitOrderEdit(ev){
  ev.preventDefault();
  const o = db.orders.find(x=>x.id===editingOrderId);
  if(!o) return false;
  const newName = document.getElementById('editOrderCustomer').value.trim();
  if(!newName){ toast('Nome do cliente não pode ficar vazio'); return false; }

  o.items = o.items.filter(it=>it.qty>0);
  if(o.items.length===0){
    if(!confirm('Todos os itens foram zerados — isso vai excluir o pedido inteiro. Continuar?')){
      saveDb(); refreshActiveView(); return false;
    }
    // estoque e "itens a repor" já foram ajustados em tempo real no editOrderQtyChange
    db.orders = db.orders.filter(x=>x.id!==editingOrderId);
    if(activeOrderId===editingOrderId) activeOrderId = null;
    saveDb();
    closeModal('modalEditOrder');
    toast('Pedido excluído');
    editingOrderId = null;
    refreshActiveView();
    return false;
  }

  o.customer = newName;
  saveDb();
  closeModal('modalEditOrder');
  toast('Pedido atualizado');
  editingOrderId = null;
  refreshActiveView();
  return false;
}

function deleteOrder(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  const msg = o.status==='aberto'
    ? `Excluir o pedido em aberto de "${o.customer}"?`
    : `Excluir o pedido de "${o.customer}" (${brl(orderTotal(o))})? O estoque desses itens volta automaticamente.`;
  if(!confirm(msg)) return;
  if(o.status!=='aberto') restoreStockForOrder(o);
  db.orders = db.orders.filter(x=>x.id!==orderId);
  if(activeOrderId===orderId) activeOrderId = null;
  saveDb();
  toast('Pedido excluído');
  refreshActiveView();
}

// ---------- editar / excluir cliente ----------
function openEditClientModal(clientName){
  editingClientName = clientName;
  document.getElementById('editClientName').value = clientName;
  openModal('modalEditClient');
}

function submitClientEdit(ev){
  ev.preventDefault();
  const newName = document.getElementById('editClientName').value.trim();
  if(!newName){ toast('Nome não pode ficar vazio'); return false; }
  db.orders.forEach(o=>{
    if(o.customer.toLowerCase()===editingClientName.toLowerCase()) o.customer = newName;
  });
  const idx = db.clients.findIndex(c=>c.toLowerCase()===editingClientName.toLowerCase());
  if(idx>=0) db.clients[idx] = newName; else db.clients.push(newName);
  saveDb();
  closeModal('modalEditClient');
  toast('Cliente atualizado');
  editingClientName = null;
  refreshActiveView();
  return false;
}

function deleteClient(clientName){
  const orders = db.orders.filter(o=>o.customer.toLowerCase()===clientName.toLowerCase());
  const msg = orders.length>0
    ? `Excluir "${clientName}" e ${orders.length} pedido${orders.length>1?'s':''} dele(a)? Estoque já baixado volta automaticamente. Essa ação não pode ser desfeita.`
    : `Excluir "${clientName}"? Essa ação não pode ser desfeita.`;
  if(!confirm(msg)) return;
  orders.forEach(o=>{
    if(o.status!=='aberto') restoreStockForOrder(o);
    if(activeOrderId===o.id) activeOrderId = null;
  });
  db.orders = db.orders.filter(o=>o.customer.toLowerCase()!==clientName.toLowerCase());
  db.clients = db.clients.filter(c=>c.toLowerCase()!==clientName.toLowerCase());
  saveDb();
  toast('Cliente excluído');
  refreshActiveView();
}

// ---------- vendas (pedidos em aberto e aguardando pagamento) ----------
function renderVendas(){
  const awaiting = db.orders.filter(o=>o.status==='aguardando_pagamento').sort((a,b)=>new Date(b.finalizedAt)-new Date(a.finalizedAt));
  const open = db.orders.filter(o=>o.status==='aberto').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const paid = db.orders.filter(o=>o.status==='pago' && !o.restocked).sort((a,b)=>new Date(b.paidAt)-new Date(a.paidAt));

  const awaitEl = document.getElementById('ordersAwaiting');
  awaitEl.innerHTML = awaiting.length
    ? awaiting.map(o=>orderCard(o,true)).join('')
    : '<div class="empty">Nenhum pedido aguardando pagamento.</div>';

  const openEl = document.getElementById('ordersOpenList');
  openEl.innerHTML = open.length
    ? open.map(o=>orderCard(o,true)).join('')
    : '<div class="empty">Nenhum pedido em aberto no momento.</div>';

  const paidEl = document.getElementById('ordersPaid');
  if(paidEl){
    paidEl.innerHTML = paid.length
      ? paid.map(o=>orderCard(o,false)).join('')
      : '<div class="empty">Nenhum pedido pago no momento.</div>';
  }
}

// ---------- itens (somente pedidos pagos) ----------
let itensViewMode = 'final'; // 'final' | 'custo' — controla o que a listagem embaixo do card mostra
let itensCache = [];

function itensSwipeScrolled(container){
  const idx = Math.round(container.scrollLeft / container.clientWidth);
  const dots = document.getElementById('itensDots').children;
  for(let i=0;i<dots.length;i++) dots[i].classList.toggle('on', i===idx);
  const mode = idx===0 ? 'final' : 'custo';
  if(mode !== itensViewMode){ itensViewMode = mode; renderItensList(); }
}

function itensGoToIndex(idx){
  const container = document.getElementById('itensSwipeStats');
  container.scrollTo({ left: container.clientWidth*idx, behavior:'smooth' });
  itensViewMode = idx===0 ? 'final' : 'custo';
  const dots = document.getElementById('itensDots').children;
  for(let i=0;i<dots.length;i++) dots[i].classList.toggle('on', i===idx);
  renderItensList();
}

function itensToggle(){
  const container = document.getElementById('itensSwipeStats');
  const idx = Math.round(container.scrollLeft / container.clientWidth);
  itensGoToIndex(idx===0 ? 1 : 0);
}

function renderItens(){
  const paid = db.orders.filter(o=>o.status==='pago' && !o.restocked);
  const totals = {}; // productId -> { name, brand, qty, cost, final }

  paid.forEach(o=>{
    o.items.forEach(it=>{
      if(it.isFrete) return;
      if(!totals[it.productId]){
        const p = db.products.find(x=>x.id===it.productId);
        const brand = p ? db.brands.find(b=>b.id===p.brandId) : null;
        totals[it.productId] = {
          name: it.name, brand: brand ? brand.name : '',
          qty: 0, cost: it.cost, final: it.final
        };
      }
      totals[it.productId].qty += it.qty;
    });
  });

  itensCache = Object.values(totals).sort((a,b)=> (b.qty*b.final) - (a.qty*a.final));

  let totalFinal = 0, totalCost = 0;
  itensCache.forEach(r=>{ totalFinal += r.final*r.qty; totalCost += r.cost*r.qty; });
  document.getElementById('itensTotalFinal').textContent = brl(totalFinal);
  document.getElementById('itensTotalCost').textContent = brl(totalCost);

  renderItensList();

  const btnEl = document.getElementById('itensFinishBtn');
  btnEl.innerHTML = itensCache.length
    ? `<button class="btn-primary btn-full" style="margin-top:14px" onclick="finalizeItensToRestock()">Finalizar — enviar para Itens a repor</button>`
    : '';
}

function renderItensList(){
  const el = document.getElementById('itensList');
  if(itensCache.length===0){
    el.innerHTML = '<div class="empty">Nenhum item pago ainda.<br>Confirme o pagamento de um pedido para ele aparecer aqui.</div>';
    return;
  }
  const isCusto = itensViewMode === 'custo';
  const priceColor = isCusto ? 'var(--text)' : 'var(--gold)';
  el.innerHTML = itensCache.map(r=>{
    const unitTotal = (isCusto ? r.cost : r.final) * r.qty;
    return `
      <div class="product-item" style="border-bottom:1px solid var(--line); padding:11px 4px">
        <div class="left">
          <div class="pname">${escapeHtml(r.name)}</div>
          <div class="pmeta">${r.brand?escapeHtml(r.brand)+' · ':''}${r.qty}un</div>
        </div>
        <div class="right">
          <div class="pprice" style="color:${priceColor}">${brl(unitTotal)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function finalizeItensToRestock(){
  const paid = db.orders.filter(o=>o.status==='pago' && !o.restocked);
  if(paid.length===0){ toast('Nada para enviar'); return; }

  paid.forEach(o=>{
    o.items.forEach(it=>{
      if(it.isFrete) return;
      if(!db.restockSummary[it.productId]){
        const p = db.products.find(x=>x.id===it.productId);
        const brand = p ? db.brands.find(b=>b.id===p.brandId) : null;
        db.restockSummary[it.productId] = {
          name: it.name, brand: brand ? brand.name : '',
          qty: 0, cost: it.cost, final: it.final
        };
      }
      const r = db.restockSummary[it.productId];
      r.qty += it.qty;
      r.cost = it.cost;   // mantém o preço mais recente
      r.final = it.final;
    });
    o.restocked = true;
  });

  saveDb();
  toast('Itens enviados para "Itens a repor" no Relatório');
  itensGoToIndex(0);
  renderItens();
  renderVendas();
}

// ---------- relatorio ----------
function renderRelatorio(){
  const paid = db.orders.filter(o=>o.status==='pago');
  let revenue=0, cost=0;
  paid.forEach(o=>{ revenue+=orderTotal(o); cost+=orderCost(o); });
  document.getElementById('statRevenue').textContent = brl(revenue);
  document.getElementById('statCost').textContent = brl(cost);
  document.getElementById('statProfit').textContent = brl(revenue-cost);
  document.getElementById('statCount').textContent = paid.length;

  // itens a repor: acumulador persistente, alimentado pelo botão "Finalizar" da aba Itens
  const restockList = Object.values(db.restockSummary).sort((a,b)=>b.qty-a.qty);
  let restockCost = 0, restockFinal = 0;
  restockList.forEach(r=>{ restockCost += r.cost*r.qty; restockFinal += r.final*r.qty; });
  document.getElementById('restockTotalCost').textContent = brl(restockCost);
  document.getElementById('restockTotalFinal').textContent = brl(restockFinal);

  const restockCard = document.getElementById('restockCard');
  if(restockList.length===0){
    restockCard.innerHTML = '<div class="empty">Nenhum item a repor no momento.</div>';
  } else {
    restockCard.innerHTML = restockList.map(r=>`
      <div class="restock-row">
        <div>
          <div class="n">${escapeHtml(r.name)}</div>
          <div class="b">${r.brand?escapeHtml(r.brand):''} · custo unit. ${brl(r.cost)}</div>
        </div>
        <div class="q">${r.qty}un</div>
      </div>
    `).join('');
  }
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------- backup / restauração ----------
function downloadBackup(){
  const dataStr = JSON.stringify(db, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
  a.href = url;
  a.download = `ponto-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup baixado');
}

function restoreBackupFile(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const parsed = JSON.parse(e.target.result);
      if(!parsed.brands || !parsed.products || !parsed.orders){
        toast('Arquivo inválido — não parece um backup do Ponto');
        return;
      }
      if(!confirm('Isso vai substituir TODOS os dados atuais pelos do backup. Continuar?')) return;
      db = ensureDbShape(parsed);
      saveDb();
      toast('Backup restaurado');
      location.reload();
    }catch(err){
      toast('Não consegui ler esse arquivo');
    }
  };
  reader.readAsText(file);
}

// ---------- init ----------
renderClientesPickList();
updateHeader();
if(typeof initFirebaseSync === 'function') initFirebaseSync();
