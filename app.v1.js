// ---------- estado ----------
const STORAGE_KEY = 'pdv_ponto_data_v2';
let db = loadDb();
let activeBrandId = null;   // marca aberta no modal de "adicionar item"
let openBrandRow = null;    // marca expandida na aba Marcas
let activeOrderId = null;   // pedido/cliente ativo para lançar itens

function loadDb(){
  let data = { brands: [], products: [], orders: [] };
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) data = JSON.parse(raw);
  }catch(e){}
  if(!data.restockSummary) data.restockSummary = {}; // acumulador de "itens a repor", garante compatibilidade com dados salvos antes dessa função existir
  return data;
  // status do pedido: 'aberto' -> 'aguardando_pagamento' -> 'pago'
}
function saveDb(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function brl(n){ return 'R$ ' + (n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function calcFinal(cost, margin){ return cost * (1 + (margin||0)/100); }
function orderTotal(o){ return o.items.reduce((a,i)=>a+i.final*i.qty,0); }
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
  // reaproveita pedido em aberto existente desse cliente, se houver
  let order = db.orders.find(o=>o.customer.toLowerCase()===name.toLowerCase() && o.status==='aberto');
  if(!order){
    order = { id: uid(), customer: name, status: 'aberto', items: [], createdAt: new Date().toISOString() };
    db.orders.push(order);
    saveDb();
  }
  activeOrderId = order.id;
  toast('Vendendo para ' + name + ' — selecione as marcas');
  switchView('marcas');
}

function renderClientesPickList(){
  const names = {}; // nome (lowercase) -> { name, lastDate }
  db.orders.forEach(o=>{
    const key = o.customer.toLowerCase();
    const d = orderDate(o);
    if(!names[key] || d>names[key].lastDate) names[key] = { name:o.customer, lastDate:d };
  });
  const list = Object.values(names).sort((a,b)=>b.lastDate-a.lastDate);
  const el = document.getElementById('clientesPickList');
  if(list.length===0){
    el.innerHTML = '<div class="empty">Nenhum cliente cadastrado ainda.<br>Toque em "Novo cliente" para começar.</div>';
    return;
  }
  el.innerHTML = list.map(c=>{
    const dstr = c.lastDate.toLocaleDateString('pt-BR') + ' ' + c.lastDate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return `
      <div class="client-pick-row">
        <div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="date">última atividade ${dstr}</div>
        </div>
        <button class="btn-primary btn-small" onclick="startSaleForClient('${escapeHtml(c.name).replace(/'/g,"\\'")}')">Iniciar venda</button>
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
  if(expandedClients.has(key)) expandedClients.delete(key); else expandedClients.add(key);
  renderClientList();
}

function renderClientList(){
  const q = (document.getElementById('custSearch').value||'').trim().toLowerCase();
  const byCustomer = {};
  db.orders.forEach(o=>{
    const key = o.customer.toLowerCase();
    (byCustomer[key] = byCustomer[key]||{name:o.customer, orders:[]}).orders.push(o);
  });
  let keys = Object.keys(byCustomer);
  if(q) keys = keys.filter(k=>k.includes(q));
  keys.sort((a,b)=> orderDate(byCustomer[b].orders.sort((x,y)=>orderDate(y)-orderDate(x))[0]) - orderDate(byCustomer[a].orders.sort((x,y)=>orderDate(y)-orderDate(x))[0]));

  const list = document.getElementById('clientList');
  if(keys.length===0){
    list.innerHTML = '<div class="empty">Nenhum cliente ainda.<br>Toque em "Novo cliente" para começar uma venda.</div>';
    return;
  }
  list.innerHTML = keys.map(key=>{
    const c = byCustomer[key];
    const sorted = [...c.orders].sort((a,b)=>orderDate(b)-orderDate(a));
    const lastDate = orderDate(sorted[0]);
    const dstr = lastDate.toLocaleDateString('pt-BR') + ' ' + lastDate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const isOpen = expandedClients.has(key);
    return `
      <div class="client-row ${isOpen?'open':''}" onclick="toggleClientExpand('${key}')">
        <div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="date">última compra ${dstr}</div>
        </div>
        <div class="chev">›</div>
      </div>
      <div class="client-body ${isOpen?'open':''}">
        ${sorted.map(o=>orderCard(o, false, true)).join('')}
      </div>
    `;
  }).join('');
}

let expandedOrders = new Set();

function toggleOrderExpand(id){
  if(expandedOrders.has(id)) expandedOrders.delete(id); else expandedOrders.add(id);
  refreshActiveView();
}

function refreshActiveView(){
  const activeBtn = document.querySelector('nav.bottom button.active');
  const name = activeBtn ? activeBtn.dataset.view : 'marcas';
  if(name==='marcas') renderBrands();
  if(name==='vendas') renderVendas();
  if(name==='itens') renderItens();
  if(name==='relatorio') renderRelatorio();
  if(name==='historico') renderClientList();
}

function orderCard(o, withActions, compact){
  const total = orderTotal(o);
  const isOpen = expandedOrders.has(o.id);
  const itemsStr = o.items.length ? o.items.map(i=>`${i.qty}× ${escapeHtml(i.name)}`).join(', ') : 'nenhum item ainda';
  const d = new Date(o.paidAt || o.finalizedAt || o.createdAt);
  const dstr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const badge = o.status==='aberto' ? '<span class="badge aberto">em aberto</span>'
              : o.status==='aguardando_pagamento' ? '<span class="badge aguardando">aguard. pagamento</span>'
              : '<span class="badge pago">pago</span>';

  const itemsDetail = isOpen && o.items.length ? `
    <div class="items-detail">
      ${o.items.map(i=>`
        <div class="item-detail-row">
          <span>${i.qty}× ${escapeHtml(i.name)} <span class="u">(${brl(i.final)} un)</span></span>
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
          <button class="btn-ghost btn-small" onclick="selectExistingOrder('${o.id}')">Continuar</button>
          <button class="btn-blue btn-small" onclick="finalizeOrder('${o.id}')">Finalizar</button>
        </div>`;
    } else if(o.status==='aguardando_pagamento'){
      actions = `
        <div class="actions">
          <button class="btn-primary btn-small" onclick="openPixModal('${o.id}')">Confirmar pagamento</button>
        </div>`;
    }
  }

  const pixLine = (o.status==='pago' && o.pixAttachment)
    ? `<div class="pix-thumb" onclick="viewPixAttachment('${o.id}')"><img src="${o.pixAttachment}" alt="comprovante"><span>ver comprovante</span></div>`
    : '';
  const headRow = compact
    ? `<div class="head" style="justify-content:flex-end">${badge}</div>`
    : `<div class="head"><div class="cust">${escapeHtml(o.customer)}</div>${badge}</div>`;

  return `
    <div class="order-card ${o.status==='pago'?'pago':''}">
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
      </div>
    </div>
  `;
}

// ---------- marcas ----------
function submitBrand(ev){
  ev.preventDefault();
  const name = document.getElementById('newBrandName').value.trim();
  if(!name) return false;
  db.brands.push({ id: uid(), name });
  saveDb();
  document.getElementById('newBrandName').value = '';
  closeModal('modalBrand');
  renderBrands();
  toast('Marca adicionada');
  return false;
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

function renderBrands(){
  renderMarcasActiveBar();
  renderMarcasFinishBar();
  const list = document.getElementById('brandList');
  if(db.brands.length===0){
    list.innerHTML = '<div class="empty">Nenhuma marca cadastrada ainda.<br>Toque em "Nova marca" para começar.</div>';
    return;
  }
  list.innerHTML = db.brands.map(b=>{
    const prods = db.products.filter(p=>p.brandId===b.id);
    const isOpen = openBrandRow===b.id;
    return `
      <div class="brand-row ${isOpen?'open':''}" onclick="toggleBrand('${b.id}')">
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
    <div class="product-item">
      <div class="left">
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="pmeta">custo ${brl(p.cost)} · estoque ${p.stock}un</div>
      </div>
      <div class="right">
        <div class="margin-wrap">
          <input class="margin-edit" type="number" step="0.1" value="${p.margin}" onclick="event.stopPropagation()" onchange="updateMargin('${p.id}', this.value)">
          <span class="margin-sign">%</span>
        </div>
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
  openBrandRow = (openBrandRow===id) ? null : id;
  renderBrands();
}

function updateMargin(productId, val){
  const p = db.products.find(x=>x.id===productId);
  if(!p) return;
  p.margin = parseFloat(val)||0;
  p.final = calcFinal(p.cost, p.margin);
  saveDb();
  renderBrands();
  toast('% atualizada — ' + brl(p.final));
}

function openProductModal(brandId){
  activeBrandId = brandId;
  const brand = db.brands.find(b=>b.id===brandId);
  document.getElementById('modalProductTitle').textContent = 'Novo item — ' + brand.name;
  document.getElementById('newProdCost').value = '';
  document.getElementById('newProdMargin').value = '';
  document.getElementById('newProdStock').value = '';
  updateProdPreview();
  openModal('modalProduct');
}

function updateProdPreview(){
  const cost = parseFloat(document.getElementById('newProdCost').value) || 0;
  const margin = parseFloat(document.getElementById('newProdMargin').value) || 0;
  document.getElementById('prodPreview').textContent = 'Valor final: ' + brl(calcFinal(cost, margin));
}

function submitProduct(ev){
  ev.preventDefault();
  const name = document.getElementById('newProdName').value.trim();
  const cost = parseFloat(document.getElementById('newProdCost').value);
  const margin = parseFloat(document.getElementById('newProdMargin').value)||0;
  const stock = parseInt(document.getElementById('newProdStock').value)||0;
  if(!name || isNaN(cost)) return false;
  db.products.push({
    id: uid(), brandId: activeBrandId, name, cost, margin,
    final: calcFinal(cost, margin), stock
  });
  saveDb();
  document.getElementById('newProdName').value='';
  document.getElementById('newProdCost').value='';
  document.getElementById('newProdMargin').value='';
  document.getElementById('newProdStock').value='';
  updateProdPreview();
  closeModal('modalProduct');
  openBrandRow = activeBrandId;
  renderBrands();
  toast('Item adicionado');
  return false;
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
    o.items.push({ productId:p.id, name:p.name, qty:newQty, cost:p.cost, final:p.final, margin:p.margin });
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
    const p = db.products.find(x=>x.id===it.productId);
    if(!p || it.qty>p.stock){ toast('Estoque insuficiente: '+it.name); return; }
  }
  o.items.forEach(it=>{
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

function openPixModal(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  pendingPixOrderId = orderId;
  pendingPixAttachment = null;
  document.getElementById('pixOrderInfo').textContent = o.customer + ' · ' + brl(orderTotal(o));
  document.getElementById('pixFileInput').value = '';
  document.getElementById('pixPreviewBox').style.display = 'none';
  document.getElementById('attachBtnText').textContent = '📎 Anexar comprovante';
  openModal('modalPix');
}

function handlePixFileSelect(ev){
  const file = ev.target.files[0];
  if(!file) return;
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
      document.getElementById('pixPreviewImg').src = pendingPixAttachment;
      document.getElementById('pixPreviewBox').style.display = 'flex';
      document.getElementById('attachBtnText').textContent = '📎 Trocar comprovante';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearPixAttachment(){
  pendingPixAttachment = null;
  document.getElementById('pixFileInput').value = '';
  document.getElementById('pixPreviewBox').style.display = 'none';
  document.getElementById('attachBtnText').textContent = '📎 Anexar comprovante';
}

function submitPixConfirm(ev){
  ev.preventDefault();
  confirmPayment(pendingPixOrderId, pendingPixAttachment);
  closeModal('modalPix');
  return false;
}

function viewPixAttachment(orderId){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o || !o.pixAttachment) return;
  document.getElementById('imageViewSrc').src = o.pixAttachment;
  openModal('modalImageView');
}

function confirmPayment(orderId, pixAttachment){
  const o = db.orders.find(x=>x.id===orderId);
  if(!o) return;
  o.status = 'pago';
  o.paidAt = new Date().toISOString();
  if(pixAttachment) o.pixAttachment = pixAttachment;
  saveDb();
  toast('Pagamento de ' + o.customer + ' confirmado — lançado em vendas');
  renderVendas();
  renderItens();
}

// ---------- vendas (pedidos em aberto e aguardando pagamento) ----------
function renderVendas(){
  const awaiting = db.orders.filter(o=>o.status==='aguardando_pagamento').sort((a,b)=>new Date(b.finalizedAt)-new Date(a.finalizedAt));
  const open = db.orders.filter(o=>o.status==='aberto').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

  const awaitEl = document.getElementById('ordersAwaiting');
  awaitEl.innerHTML = awaiting.length
    ? awaiting.map(o=>orderCard(o,true)).join('')
    : '<div class="empty">Nenhum pedido aguardando pagamento.</div>';

  const openEl = document.getElementById('ordersOpenList');
  openEl.innerHTML = open.length
    ? open.map(o=>orderCard(o,true)).join('')
    : '<div class="empty">Nenhum pedido em aberto no momento.</div>';
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
      db = parsed;
      if(!db.restockSummary) db.restockSummary = {};
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
