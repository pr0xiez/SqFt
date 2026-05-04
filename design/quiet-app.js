// ══ THEME ══
(function(){
  const saved = localStorage.getItem('sqft-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeUI(saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sqft-theme', next);
    updateThemeUI(next);
    if (window.revChart) renderRevChart();
  });
})();
function updateThemeUI(t){
  document.getElementById('theme-icon').textContent = t === 'dark' ? '☀' : '☾';
  document.getElementById('theme-label').textContent = t === 'dark' ? 'Light' : 'Dark';
}
function isDark(){ return document.documentElement.getAttribute('data-theme') === 'dark'; }
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

// ══ DATA ══
const customers = [
  {id:1,name:'Henderson, J.',phone:'(614) 555-0142',email:'henderson@email.com',address:'1247 Elm St, Columbus',source:'phone',added:'Jan 12, 2025',estimates:3,notes:'Prefers Mon mornings'},
  {id:2,name:'Martinez, R.',phone:'(614) 555-0188',email:'rmartinez@email.com',address:'89 Oak Ave, Worthington',source:'referral',added:'Feb 3, 2025',estimates:1,notes:'Referred by Henderson'},
  {id:3,name:'Chen, L.',phone:'(614) 555-0211',email:'lchen@email.com',address:'142 Maple Dr, Dublin',source:'online',added:'Feb 18, 2025',estimates:1,notes:'Wants to start ASAP'},
  {id:4,name:'Park Family',phone:'(614) 555-0307',email:'parkfamily@email.com',address:'218 Birch Ln, Bexley',source:'walkin',added:'Mar 2, 2025',estimates:1,notes:''},
  {id:5,name:'Nguyen, A.',phone:'(614) 555-0421',email:'',address:'33 Pine Ct, Upper Arlington',source:'website',added:'Mar 15, 2025',estimates:0,notes:'New construction'},
  {id:6,name:'Sharma, P.',phone:'(614) 555-0509',email:'p.sharma@email.com',address:'67 Cedar Way, Westerville',source:'phone',added:'Mar 22, 2025',estimates:1,notes:''},
];
const allEstimates = [
  {id:1042,customerId:1,date:'May 1, 2025',rooms:[
    {id:1,name:'Living Room',length:14,width:18,sqft:252,shape:'rectangle',note:''},
    {id:2,name:'Master Bedroom',length:13,width:15,sqft:195,shape:'rectangle',note:''},
    {id:3,name:'Hallway',length:4,width:12,sqft:48,shape:'L-shape',note:'L-shape, narrow at door'},
  ],wasteFactor:1.10},
  {id:1043,customerId:6,date:'Apr 28, 2025',rooms:[
    {id:1,name:'Master Bath',length:8,width:10,sqft:80,shape:'rectangle',note:''},
    {id:2,name:'Powder',length:5,width:6,sqft:30,shape:'rectangle',note:''},
  ],wasteFactor:1.10},
  {id:1044,customerId:4,date:'Apr 25, 2025',rooms:[
    {id:1,name:'Living + Dining',length:22,width:14,sqft:308,shape:'L-shape',note:'open concept'},
  ],wasteFactor:1.10},
  {id:1045,customerId:5,date:'Apr 22, 2025',rooms:[],wasteFactor:1.10},
  {id:1040,customerId:3,date:'Apr 18, 2025',rooms:[
    {id:1,name:'Main Staircase',length:3,width:14,sqft:42,shape:'rectangle',note:'13 risers · LVP wrap'},
    {id:2,name:'Upper Landing',length:6,width:8,sqft:48,shape:'rectangle',note:''},
  ],wasteFactor:1.10},
  {id:1041,customerId:2,date:'Apr 20, 2025',rooms:[
    {id:1,name:'Living Room',length:16,width:20,sqft:320,shape:'rectangle',note:'Hardwood — oak select'},
    {id:2,name:'Dining Room',length:12,width:14,sqft:168,shape:'rectangle',note:''},
    {id:3,name:'Front Hall',length:5,width:10,sqft:50,shape:'rectangle',note:''},
  ],wasteFactor:1.10},
];
const initialQuoteFor = {
  1042:{lineItems:[
    {id:1,description:'LVP — Mohawk RevWood',scope:{type:'rooms',rooms:[1,2,3],waste:10},rate:4.85,unit:'sqft'},
    {id:2,description:'Underlayment — 6 mil',scope:{type:'rooms',rooms:[1,2,3],waste:0},rate:0.45,unit:'sqft'},
    {id:3,description:'Removal of carpet',scope:{type:'rooms',rooms:[1,2],waste:0},rate:1.20,unit:'sqft'},
    {id:4,description:'Floor prep & leveling',scope:{type:'manual',qty:495,unit:'sqft'},rate:0.65},
    {id:5,description:'Quarter round trim',scope:{type:'manual',qty:180,unit:'lf'},rate:2.50},
    {id:6,description:'Haul away & disposal',scope:{type:'manual',qty:1,unit:'job'},rate:185.00},
  ],taxPct:7.5,markupPct:35},
  1043:{lineItems:[],taxPct:7.5,markupPct:35},
  1044:{lineItems:[],taxPct:7.5,markupPct:35},
  1045:{lineItems:[],taxPct:7.5,markupPct:35},
};
const events = [
  {id:1,title:'Chen Staircase · Day 2',type:'job',customerId:3,estimateId:1040,start:'2025-05-02T08:00',end:'2025-05-02T16:00',crew:'Carlos',notes:''},
  {id:2,title:'Sharma Bath · Day 1',type:'job',customerId:6,estimateId:1043,start:'2025-05-02T08:30',end:'2025-05-02T15:30',crew:'Dave',notes:''},
  {id:3,title:'Measure — Nguyen',type:'visit',customerId:5,start:'2025-05-02T10:00',end:'2025-05-02T11:00',crew:'Mike',notes:''},
  {id:4,title:'Showroom — Park',type:'other',customerId:4,start:'2025-05-02T14:00',end:'2025-05-02T15:00',crew:'Sarah',notes:''},
  {id:5,title:'Chen Staircase · Day 3',type:'job',customerId:3,estimateId:1040,start:'2025-05-03T08:00',end:'2025-05-03T15:00',crew:'Carlos',notes:''},
  {id:6,title:'Martinez HW',type:'job',customerId:2,estimateId:1041,start:'2025-05-05T08:00',end:'2025-05-05T16:00',crew:'Carlos',notes:''},
  {id:7,title:'Park Living + Dining',type:'job',customerId:4,estimateId:1044,start:'2025-05-07T08:00',end:'2025-05-07T15:00',crew:'Dave',notes:''},
  {id:8,title:'Henderson follow-up',type:'visit',customerId:1,start:'2025-05-06T10:00',end:'2025-05-06T11:00',crew:'Mike',notes:''},
  {id:9,title:'Henderson — Floor install',type:'job',customerId:1,estimateId:1042,start:'2025-05-08T08:00',end:'2025-05-08T16:00',crew:'Carlos',notes:''},
];
let nextEventId=10, nextCustomerId=7, nextEstimateId=1046;
let activeEstimateId=1042, activeCustomerId=1;

// ══ NAV ══
const screens=['dashboard','customers','customer-detail','estlist','estimates','quote','schedule'];
function showScreen(s){
  screens.forEach(x=>document.getElementById('screen-'+x).classList.remove('active'));
  document.getElementById('screen-'+s).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  // map detail screens to tabs
  const map={dashboard:'dashboard',customers:'customers','customer-detail':'customers',estlist:'estlist',estimates:'estlist',quote:'quote',schedule:'schedule'};
  const tabName = map[s];
  document.querySelectorAll('.nav-tab').forEach(t=>{ if(t.dataset.screen===tabName) t.classList.add('active'); });
  document.querySelectorAll('.bn-btn').forEach(t=>{ t.classList.toggle('active', t.dataset.screen===tabName); });
  if (s==='dashboard') renderRevChart();
  if (s==='customers') renderCustomerList();
  if (s==='estlist') renderEstimateList();
  if (s==='estimates') renderEstimate();
  if (s==='quote') renderQuote();
  if (s==='schedule') renderCalendar();
  if (s==='customer-detail') renderCustomerDetail();
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav-tab, .bn-btn').forEach(t=>{
  t.addEventListener('click',()=>{
    const s = t.dataset.screen;
    showScreen(s);
  });
});

// ══ TOAST ══
function toast(t,b){
  const el=document.getElementById('toast');
  document.getElementById('toast-t').textContent=t;
  document.getElementById('toast-b').textContent=b||'';
  el.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>el.classList.remove('show'),2400);
}

// ══ DASHBOARD ══
function renderRevChart(){
  const el=document.getElementById('rev-chart');
  if(!el) return;
  if (window.revChart) window.revChart.destroy();
  const ink=cssVar('--ink'), accent=cssVar('--accent'), muted=cssVar('--muted'), line=cssVar('--line');
  window.revChart = new Chart(el, {
    type:'line',
    data:{
      labels:['Dec','Jan','Feb','Mar','Apr','May'],
      datasets:[{
        data:[28100,31400,29800,34200,38420,38420],
        borderColor:accent,backgroundColor:accent+'18',fill:true,tension:.3,
        pointBackgroundColor:accent,pointRadius:3,borderWidth:2
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{display:false},ticks:{color:muted,font:{family:'JetBrains Mono',size:10}}},
        y:{grid:{color:line},ticks:{color:muted,font:{family:'JetBrains Mono',size:10},callback:v=>'$'+(v/1000)+'k'}}
      }
    }
  });
}

// ══ CUSTOMER LIST ══
let custFilter='all';
function setCustFilter(f,btn){
  custFilter=f;
  document.querySelectorAll('#screen-customers .filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderCustomerList();
}
function sourceLabel(s){return{phone:'Phone',online:'Online',referral:'Referral',walkin:'Walk-in',website:'Website'}[s]||s;}
function renderCustomerList(){
  const list=document.getElementById('clist-rows');
  const filtered=customers.filter(c=>custFilter==='all'||c.source===custFilter);
  list.innerHTML = filtered.map(c=>`
    <div class="tr ${c.source}" onclick="openCustomer(${c.id})">
      <div class="td"><div class="cl-name">${c.name}</div><div class="cl-contact">${c.phone}${c.email?' · '+c.email:''}</div></div>
      <div class="td"><span class="badge b-${c.source}">${sourceLabel(c.source)}</span></div>
      <div class="td"><div class="cl-est">${c.estimates}</div></div>
      <div class="td" style="font-family:var(--mono);font-size:11px;color:var(--muted)">${c.added.replace(/, 2025/,'')}</div>
      <div class="td"><button class="open-btn">Open →</button></div>
    </div>`).join('');
  document.getElementById('clist-sub').textContent = `${customers.length} customers`;
  document.getElementById('clist-count').textContent = filtered.length===customers.length?'':`${filtered.length} shown`;
}

// ══ CUSTOMER DETAIL ══
function openCustomer(id){
  activeCustomerId=id;
  showScreen('customer-detail');
}
function renderCustomerDetail(){
  const c=customers.find(x=>x.id===activeCustomerId);
  if(!c) return;
  document.getElementById('cd-eyebrow').textContent = sourceLabel(c.source) + ' · added ' + c.added;
  document.getElementById('cd-topbar-title').textContent = c.name;
  document.getElementById('cd-topbar-sub').textContent = `${c.estimates} estimate${c.estimates===1?'':'s'} · ${c.address||'no address'}`;
  document.getElementById('cd-name').value=c.name;
  document.getElementById('cd-phone').value=c.phone||'';
  document.getElementById('cd-email').value=c.email||'';
  document.getElementById('cd-address').value=c.address||'';
  document.getElementById('cd-notes').value=c.notes||'';
  document.getElementById('cd-source').value=c.source;
  renderCdSourceBadge();
  // estimates for this customer
  const ests = allEstimates.filter(e=>e.customerId===c.id);
  document.getElementById('cd-est-count').textContent = `(${ests.length})`;
  const rows = document.getElementById('cd-est-rows');
  if (ests.length===0) {
    rows.innerHTML = `<div style="font-family:var(--mono);font-size:12px;color:var(--muted);padding:12px 0">No estimates yet.</div>`;
  } else {
    rows.innerHTML = ests.map(e=>{
      const total = e.rooms.reduce((s,r)=>s+r.sqft,0);
      return `<div class="today" onclick="openEstimateById(${e.id})">
        <div class="t-time">#${e.id}</div>
        <div class="dot" style="background:var(--accent)"></div>
        <div style="flex:1"><div class="t-name">${e.rooms.length} room${e.rooms.length===1?'':'s'} · ${total} sqft</div>
        <div class="t-sub">${e.date}</div></div>
        <div class="t-tag">Open →</div>
      </div>`;
    }).join('');
  }
}
function renderCdSourceBadge(){
  const c=customers.find(x=>x.id===activeCustomerId);
  document.getElementById('cd-source-badge').innerHTML = `<span class="badge b-${c.source}" style="margin-top:8px">${sourceLabel(c.source)}</span>`;
}
function updateCustomerField(k,v){
  const c=customers.find(x=>x.id===activeCustomerId);
  c[k]=v;
  if(k==='name') document.getElementById('cd-topbar-title').textContent=v;
}
function newEstimateForCustomer(){
  const e={id:nextEstimateId++,customerId:activeCustomerId,date:'May 2, 2025',rooms:[],wasteFactor:1.10};
  allEstimates.push(e);
  initialQuoteFor[e.id]={lineItems:[],taxPct:7.5,markupPct:35};
  const c=customers.find(x=>x.id===activeCustomerId); c.estimates++;
  activeEstimateId=e.id;
  toast('Estimate created', `#${e.id} for ${c.name}`);
  showScreen('estimates');
}
function viewActiveCustomer(){
  const e=allEstimates.find(x=>x.id===activeEstimateId);
  if (e?.customerId){ activeCustomerId=e.customerId; showScreen('customer-detail'); }
}

// ══ ESTIMATE LIST ══
function renderEstimateList(){
  const list=document.getElementById('estlist-rows');
  list.innerHTML = allEstimates.map(e=>{
    const c=customers.find(x=>x.id===e.customerId);
    const total = e.rooms.reduce((s,r)=>s+r.sqft,0);
    return `<div class="tr" onclick="openEstimateById(${e.id})">
      <div class="td"><div class="el-num">#${e.id}</div></div>
      <div class="td"><div class="el-cname">${c?.name||'—'}</div><div class="el-caddr">${c?.address||''}</div></div>
      <div class="td"><div class="el-area">${total} sqft</div><div class="el-detail">${e.rooms.length} room${e.rooms.length===1?'':'s'}</div></div>
      <div class="td" style="font-family:var(--mono);font-size:11px;color:var(--muted)">${e.date}</div>
      <div class="td"><button class="open-btn">Open →</button></div>
    </div>`;
  }).join('');
  document.getElementById('estlist-sub').textContent = `${allEstimates.length} estimates`;
}
function openEstimateById(id){ activeEstimateId=id; showScreen('estimates'); }
function newEstimate(){ openCpPicker('newEstimate'); }
function backToList(){ showScreen('estlist'); }
function backToEstimate(){ showScreen('estimates'); }

// ══ ESTIMATE BUILDER ══
function renderEstimate(){
  const e=allEstimates.find(x=>x.id===activeEstimateId);
  if(!e){ showScreen('estlist'); return; }
  const c=customers.find(x=>x.id===e.customerId);
  document.getElementById('est-eyebrow').textContent = `Estimate #${e.id} · ${e.date}`;
  document.getElementById('est-topbar-sub').textContent = `${e.rooms.length} room${e.rooms.length===1?'':'s'} · ${e.rooms.reduce((s,r)=>s+r.sqft,0)} sqft`;
  document.getElementById('est-cb-name').textContent = c?.name||'No customer';
  document.getElementById('est-cb-detail').textContent = c ? `${c.phone||''}${c.address?' · '+c.address:''}` : 'Pick a customer to begin';
  document.getElementById('est-cb-view-btn').style.display = c?'inline-flex':'none';
  document.getElementById('est-waste-sel').value = e.wasteFactor.toFixed(2);
  const wrap=document.getElementById('estimate-items');
  wrap.innerHTML = e.rooms.map(r=>{
    const showArea = r.length||r.width;
    return `<div class="room ${r.shape==='L-shape'?'l-shape':''}">
      <div class="room-h">
        <input class="room-name" value="${r.name}" oninput="updateRoom(${r.id},'name',this.value)"/>
        <button class="remove-btn" onclick="removeRoom(${r.id})">Remove</button>
      </div>
      <div class="dim-row">
        <div class="dim-label">Dimensions</div>
        <input type="number" class="dim" value="${r.length||''}" placeholder="L" oninput="updateRoom(${r.id},'length',this.value)"/>
        <span class="dim-x">×</span>
        <input type="number" class="dim" value="${r.width||''}" placeholder="W" oninput="updateRoom(${r.id},'width',this.value)"/>
        <span class="dim-unit">ft</span>
        <div class="dim-area ${!showArea?'empty':''}">${showArea ? r.sqft.toFixed(0)+' sqft' : '—'}</div>
      </div>
      <div class="shape-row">
        <span class="dim-label" style="min-width:80px">Shape</span>
        <button class="chip ${r.shape==='rectangle'?'active':''}" onclick="updateRoom(${r.id},'shape','rectangle')">Rectangle</button>
        <button class="chip ${r.shape==='L-shape'?'gold':''}" onclick="updateRoom(${r.id},'shape','L-shape')">L-shape</button>
        <button class="chip" onclick="toast('Custom shape','Coming soon')">Custom</button>
      </div>
      <input class="note-input" placeholder="Add note about this room…" value="${r.note||''}" oninput="updateRoom(${r.id},'note',this.value)"/>
    </div>`;
  }).join('') || `<div class="room" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:12px;padding:32px">No rooms yet — add one to begin measuring.</div>`;
  recalcEstimate();
}
function updateRoom(id,k,v){
  const e=allEstimates.find(x=>x.id===activeEstimateId);
  const r=e.rooms.find(rr=>rr.id===id);
  if(!r) return;
  if (k==='length'||k==='width'){ r[k]=parseFloat(v)||0; r.sqft=(r.length||0)*(r.width||0); }
  else r[k]=v;
  if (k==='length'||k==='width'||k==='shape') renderEstimate();
  else if (k==='name') document.getElementById('est-topbar-sub').textContent = `${e.rooms.length} rooms · ${e.rooms.reduce((s,r)=>s+r.sqft,0)} sqft`;
}
function addEstRoom(){
  const e=allEstimates.find(x=>x.id===activeEstimateId);
  const id = (e.rooms.reduce((m,r)=>Math.max(m,r.id),0)||0)+1;
  e.rooms.push({id,name:'New Room',length:0,width:0,sqft:0,shape:'rectangle',note:''});
  renderEstimate();
}
function removeRoom(id){
  const e=allEstimates.find(x=>x.id===activeEstimateId);
  e.rooms = e.rooms.filter(r=>r.id!==id);
  // also unlink from any line items
  (initialQuoteFor[e.id]?.lineItems||[]).forEach(li=>{
    if (li.scope?.type==='rooms') li.scope.rooms=li.scope.rooms.filter(rid=>rid!==id);
  });
  renderEstimate();
}
function addEstNote(){ toast('Add note','Inline note coming soon'); }
function recalcEstimate(){
  const e=allEstimates.find(x=>x.id===activeEstimateId);
  if(!e) return;
  e.wasteFactor = parseFloat(document.getElementById('est-waste-sel').value);
  const gross = e.rooms.reduce((s,r)=>s+r.sqft,0);
  document.getElementById('est-gross').textContent = gross ? gross.toFixed(0)+' sqft' : '—';
  document.getElementById('est-order').textContent = gross ? Math.ceil(gross*e.wasteFactor)+' sqft' : '—';
}

// ══ QUOTE BUILDER ══
function getQuote(){
  if (!initialQuoteFor[activeEstimateId]) initialQuoteFor[activeEstimateId]={lineItems:[],taxPct:7.5,markupPct:35};
  return initialQuoteFor[activeEstimateId];
}
function getEstimate(){ return allEstimates.find(x=>x.id===activeEstimateId); }
function calcQty(li){
  if (!li.scope) return {qty:0,unit:'',linkedRooms:[]};
  if (li.scope.type==='manual') return {qty:li.scope.qty||0,unit:li.scope.unit||'',linkedRooms:[]};
  const e=getEstimate();
  const linkedRooms = (e?.rooms||[]).filter(r=>li.scope.rooms.includes(r.id));
  const base = linkedRooms.reduce((s,r)=>s+r.sqft,0);
  const w = (li.scope.waste||0)/100;
  return {qty: base*(1+w), unit:'sqft', linkedRooms, baseQty:base, waste: li.scope.waste||0};
}
function renderQuote(){
  const e=getEstimate();
  if (!e){ showScreen('estlist'); return; }
  const c=customers.find(x=>x.id===e.customerId);
  document.getElementById('quote-eyebrow').textContent = `Quote · Estimate #${e.id}`;
  document.getElementById('quote-topbar-sub').textContent = `${e.rooms.length} rooms · ${e.rooms.reduce((s,r)=>s+r.sqft,0)} sqft · ${e.date}`;
  document.getElementById('quote-cb-name').textContent = c?.name||'—';
  document.getElementById('quote-cb-detail').textContent = c?.phone||'';
  document.getElementById('quote-est-detail').textContent = c ? ` · Est #${e.id}` : '';
  document.getElementById('quote-room-summary').textContent = e.rooms.length ? 'AVAILABLE ROOMS · ' + e.rooms.map(r=>`${r.name} (${r.sqft.toFixed(0)} sqft)`).join(' · ') : 'NO ROOMS — add rooms in the measure step to enable room-linked items';
  const q=getQuote();
  const wrap=document.getElementById('li-rows');
  wrap.innerHTML = q.lineItems.map(li=>{
    const c=calcQty(li);
    const sub = c.qty * li.rate;
    const linked = li.scope?.type==='rooms' && c.linkedRooms.length>0;
    return `<div class="li-row ${linked?'linked':''}">
      <div class="li-main">
        <div><input class="li-name" value="${li.description}" oninput="updateLineField(${li.id},'description',this.value)"/></div>
        <div class="li-scope-cell">
          <button class="li-scope-btn ${linked?'linked':''}" onclick="openLineScope(${li.id})">
            ${linked ? `🔗 ${c.linkedRooms.length} room${c.linkedRooms.length===1?'':'s'}` : (li.scope?.type==='manual' ? `Manual · ${li.scope.unit||''}` : 'Set scope…')}
          </button>
        </div>
        <div class="li-qty">
          ${linked
            ? `<div class="li-qty-linked"><span class="li-qty-num">${c.qty.toFixed(1)}</span><span class="li-qty-unit">sqft</span></div>`
            : `<input type="number" value="${li.scope?.qty||0}" step="0.1" oninput="updateLineField(${li.id},'manualQty',this.value)"/>`
          }
        </div>
        <div class="li-rate"><input type="number" value="${li.rate.toFixed(2)}" step="0.01" oninput="updateLineField(${li.id},'rate',this.value)"/></div>
        <div class="li-sub ${sub>0?'has-val':''}">$${sub.toFixed(2)}</div>
        <button class="li-x" onclick="removeLineItem(${li.id})">✕</button>
      </div>
      ${linked
        ? `<div class="li-tags">${c.linkedRooms.map(r=>`<span class="room-tag">${r.name} <span style="opacity:.7">(${r.sqft.toFixed(0)})</span></span>`).join('')}<span class="waste-tag">+${c.waste}% waste</span></div>`
        : ''
      }
    </div>`;
  }).join('') || `<div class="li-row"><div style="padding:24px;text-align:center;color:var(--muted);font-family:var(--mono);font-size:12px">No line items yet — add one to begin pricing.</div></div>`;
  document.getElementById('q-tax-pct').value = q.taxPct;
  document.getElementById('q-markup-pct').value = q.markupPct;
  recalcQuote();
}
function recalcQuote(){
  const q=getQuote();
  q.taxPct = parseFloat(document.getElementById('q-tax-pct').value)||0;
  q.markupPct = parseFloat(document.getElementById('q-markup-pct').value)||0;
  let subtotal=0;
  q.lineItems.forEach(li=>{ const c=calcQty(li); subtotal += c.qty * li.rate; });
  const tax = subtotal * (q.taxPct/100);
  const markup = (subtotal+tax) * (q.markupPct/100);
  const total = subtotal+tax+markup;
  document.getElementById('q-subtotal').textContent='$'+subtotal.toFixed(2);
  document.getElementById('q-tax-amt').textContent='$'+tax.toFixed(2);
  document.getElementById('q-markup-amt').textContent='$'+markup.toFixed(2);
  document.getElementById('q-total').textContent='$'+total.toFixed(2);
}
function updateLineField(id,k,v){
  const q=getQuote();
  const li=q.lineItems.find(x=>x.id===id);
  if(!li) return;
  if (k==='description') li.description=v;
  else if (k==='rate') li.rate=parseFloat(v)||0;
  else if (k==='manualQty'){ if(li.scope?.type!=='manual') li.scope={type:'manual',qty:0,unit:'sqft'}; li.scope.qty=parseFloat(v)||0; }
  recalcQuote();
  // re-render to update subtotal cell
  const sub = calcQty(li).qty * li.rate;
  // simpler: just full re-render but preserve focus is complex; partial:
  const rows = document.querySelectorAll('#li-rows .li-row');
  // do full re-render only for non-text changes
  if (k!=='description' && k!=='rate' && k!=='manualQty') renderQuote();
  // update subtotal cell
  const idx = q.lineItems.findIndex(x=>x.id===id);
  if (rows[idx]){
    const cell = rows[idx].querySelector('.li-sub');
    if (cell){ cell.textContent='$'+sub.toFixed(2); cell.classList.toggle('has-val', sub>0); }
  }
}
function addLineItem(){
  const q=getQuote();
  const id = (q.lineItems.reduce((m,x)=>Math.max(m,x.id),0)||0)+1;
  q.lineItems.push({id,description:'New line item',scope:{type:'manual',qty:0,unit:'sqft'},rate:0});
  renderQuote();
}
function removeLineItem(id){
  const q=getQuote();
  q.lineItems = q.lineItems.filter(x=>x.id!==id);
  renderQuote();
}

// ══ ROOM PICKER (line item scope) ══
let roomPickerLineId=null, rpSelected=[], rpWaste=10;
function openLineScope(lineId){
  roomPickerLineId=lineId;
  const q=getQuote();
  const li=q.lineItems.find(x=>x.id===lineId);
  if (li.scope?.type==='rooms'){ rpSelected=[...li.scope.rooms]; rpWaste=li.scope.waste||0; }
  else { rpSelected=[]; rpWaste=10; }
  document.getElementById('rp-waste').value = rpWaste;
  // position
  const btn = event.target.closest('.li-scope-btn');
  const r = btn.getBoundingClientRect();
  const panel=document.getElementById('rp-panel');
  panel.style.top = Math.min(r.bottom+8, window.innerHeight-450)+'px';
  panel.style.left = Math.min(r.left, window.innerWidth-360)+'px';
  document.getElementById('rp-overlay').classList.add('open');
  panel.classList.add('open');
  renderRoomPickerList();
  updateRoomPickerPreview();
}
function closeRoomPicker(){ document.getElementById('rp-overlay').classList.remove('open'); document.getElementById('rp-panel').classList.remove('open'); }
function renderRoomPickerList(){
  const e=getEstimate();
  document.getElementById('rp-room-list').innerHTML = e.rooms.map(r=>{
    const checked = rpSelected.includes(r.id);
    return `<div class="mp-row ${checked?'checked':''}" onclick="toggleRoomPick(${r.id})">
      <div class="mp-check"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div>
      <div style="flex:1"><div class="mp-name">${r.name}</div><div class="mp-mini-sub">${r.length}×${r.width} · ${r.sqft.toFixed(0)} sqft</div></div>
    </div>`;
  }).join('') || `<div style="padding:20px;text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px">No rooms in this estimate yet.</div>`;
}
function toggleRoomPick(id){
  if (rpSelected.includes(id)) rpSelected = rpSelected.filter(x=>x!==id);
  else rpSelected.push(id);
  renderRoomPickerList();
  updateRoomPickerPreview();
}
function updateRoomPickerPreview(){
  rpWaste = parseFloat(document.getElementById('rp-waste').value);
  const e=getEstimate();
  const rooms = e.rooms.filter(r=>rpSelected.includes(r.id));
  const base = rooms.reduce((s,r)=>s+r.sqft,0);
  const total = base*(1+rpWaste/100);
  document.getElementById('rp-preview').textContent = rooms.length===0 ? 'No rooms selected' : `${rooms.length} room${rooms.length===1?'':'s'} · ${base.toFixed(0)} sqft + ${rpWaste}% = ${total.toFixed(1)} sqft`;
}
function applyRoomLink(){
  const q=getQuote();
  const li=q.lineItems.find(x=>x.id===roomPickerLineId);
  if (rpSelected.length===0) li.scope={type:'manual',qty:0,unit:'sqft'};
  else li.scope={type:'rooms',rooms:[...rpSelected],waste:rpWaste};
  closeRoomPicker();
  renderQuote();
}
function clearRoomLink(){
  const q=getQuote();
  const li=q.lineItems.find(x=>x.id===roomPickerLineId);
  li.scope={type:'manual',qty:0,unit:'sqft'};
  closeRoomPicker();
  renderQuote();
}

// ══ NEW CUSTOMER PANEL ══
let ncpSource='phone', ncpReturnTo=null;
function openNewCustomer(returnTo){
  ncpReturnTo=returnTo||null; ncpSource='phone';
  document.querySelectorAll('#ncp-panel .p-source-tab').forEach(t=>t.classList.toggle('active', t.dataset.source==='phone'));
  ['ncp-name','ncp-phone','ncp-email','ncp-address','ncp-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ncp-also-estimate').checked=false;
  document.getElementById('ncp-overlay').classList.add('open');
  document.getElementById('ncp-panel').classList.add('open');
  setTimeout(()=>document.getElementById('ncp-name').focus(),200);
}
function closeNewCustomer(){ document.getElementById('ncp-overlay').classList.remove('open'); document.getElementById('ncp-panel').classList.remove('open'); }
function selectSource(btn){
  document.querySelectorAll('#ncp-panel .p-source-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  ncpSource=btn.dataset.source;
}
function saveNewCustomer(){
  const name=document.getElementById('ncp-name').value.trim();
  if (!name){ toast('Name required','Please enter a name'); return; }
  const c={id:nextCustomerId++,name,phone:document.getElementById('ncp-phone').value,email:document.getElementById('ncp-email').value,address:document.getElementById('ncp-address').value,source:ncpSource,added:'May 2, 2025',estimates:0,notes:document.getElementById('ncp-notes').value};
  customers.push(c);
  const alsoEst = document.getElementById('ncp-also-estimate').checked;
  closeNewCustomer();
  toast('Customer saved', name);
  if (alsoEst || ncpReturnTo==='fromBuilder'){
    activeCustomerId=c.id;
    const e={id:nextEstimateId++,customerId:c.id,date:'May 2, 2025',rooms:[],wasteFactor:1.10};
    allEstimates.push(e);
    initialQuoteFor[e.id]={lineItems:[],taxPct:7.5,markupPct:35};
    c.estimates=1;
    activeEstimateId=e.id;
    showScreen('estimates');
  } else {
    activeCustomerId=c.id;
    showScreen('customer-detail');
  }
}

// ══ CUSTOMER PICKER ══
let cpReason=null;
function openCpPicker(reason){
  cpReason=reason||null;
  document.getElementById('cp-search').value='';
  // center it
  const panel=document.getElementById('cp-panel');
  panel.style.top='80px';
  panel.style.left='50%';
  panel.style.transform='translateX(-50%)';
  document.getElementById('cp-overlay').classList.add('open');
  panel.classList.add('open');
  renderCpList();
}
function closeCpPicker(){ document.getElementById('cp-overlay').classList.remove('open'); document.getElementById('cp-panel').classList.remove('open'); }
function renderCpList(){
  const q=document.getElementById('cp-search').value.toLowerCase();
  const filtered = customers.filter(c=>!q || c.name.toLowerCase().includes(q) || (c.phone||'').includes(q));
  document.getElementById('cp-customer-list').innerHTML = filtered.map(c=>`
    <div class="mp-row radio" onclick="pickCustomer(${c.id})">
      <div class="mp-check"><svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="2" fill="currentColor"/></svg></div>
      <div style="flex:1"><div class="mp-name">${c.name}</div><div class="mp-mini-sub">${c.phone||''}${c.address?' · '+c.address:''}</div></div>
      <span class="badge b-${c.source}">${sourceLabel(c.source)}</span>
    </div>`).join('') || `<div style="padding:24px;text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px">No matches</div>`;
}
function pickCustomer(id){
  const c=customers.find(x=>x.id===id);
  if (cpReason==='newEstimate'){
    const e={id:nextEstimateId++,customerId:id,date:'May 2, 2025',rooms:[],wasteFactor:1.10};
    allEstimates.push(e);
    initialQuoteFor[e.id]={lineItems:[],taxPct:7.5,markupPct:35};
    c.estimates++;
    activeEstimateId=e.id; activeCustomerId=id;
    closeCpPicker();
    toast('Estimate created', `#${e.id} for ${c.name}`);
    showScreen('estimates');
  } else {
    // change customer on active estimate
    const e=getEstimate();
    if (e){ e.customerId=id; activeCustomerId=id; }
    closeCpPicker();
    renderEstimate();
  }
}

// ══ SCHEDULE ══
let calWeekStart=new Date(2025, 3, 28); // Monday Apr 28 (local time)
const dayMs=86400000;
const calStartHour=7, calEndHour=19, calPxPerHour=52;
function navigateWeek(d){
  if (d===0) calWeekStart=new Date(2025, 3, 28);
  else calWeekStart=new Date(+calWeekStart + d*7*dayMs);
  renderCalendar();
}
function fmt(date){ return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]; }
function weekDays(){
  const arr=[];
  // Mon-Sat (6 days)
  for (let i=0;i<6;i++){ arr.push(new Date(+calWeekStart + i*dayMs)); }
  return arr;
}
function isToday(d){ return d.getFullYear()===2025 && d.getMonth()===4 && d.getDate()===2; }
function renderCalendar(){
  const days=weekDays();
  const monthLabel = days[0].toLocaleString('en-US',{month:'long',year:'numeric'});
  document.getElementById('cal-week-label').textContent = `Week of ${days[0].toLocaleString('en-US',{month:'short',day:'numeric'})} — ${days[5].toLocaleString('en-US',{month:'short',day:'numeric'})}, ${days[5].getFullYear()}`;
  const header=document.getElementById('cal-header');
  header.innerHTML = `<div class="cal-day-head" style="border-left:none;background:var(--surface-2);padding:8px 6px;text-align:right;font-family:var(--mono);font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">${monthLabel.split(' ')[0].slice(0,3)}</div>` + days.map(d=>{
    const today = isToday(d);
    return `<div class="cal-day-head ${today?'today':''}"><div class="cal-day-name">${fmt(d)}</div><div class="cal-day-num ${today?'today-num':''}">${d.getDate()}</div></div>`;
  }).join('');
  const tcol=document.getElementById('cal-time-col');
  tcol.style.height = ((calEndHour-calStartHour)*calPxPerHour)+'px';
  let html='';
  for (let h=calStartHour; h<=calEndHour; h++){
    const top=(h-calStartHour)*calPxPerHour;
    html += `<div class="cal-hour-label" style="top:${top}px">${h<12?h:h===12?'12':h-12}${h<12?'a':'p'}</div>`;
  }
  tcol.innerHTML=html;
  const cwrap=document.getElementById('cal-days');
  cwrap.style.height = ((calEndHour-calStartHour)*calPxPerHour)+'px';
  cwrap.innerHTML = days.map(d=>{
    const today=isToday(d);
    let inner='';
    for (let h=calStartHour; h<=calEndHour; h++){
      const top=(h-calStartHour)*calPxPerHour;
      inner += `<div class="cal-hour-line" style="top:${top}px"></div>`;
      if (h<calEndHour) inner += `<div class="cal-half-line" style="top:${top+calPxPerHour/2}px"></div>`;
    }
    // events for this day — assign lanes for overlapping events
    const dayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayEvents = events.filter(e=>e.start.startsWith(dayStr)).map(ev=>{
      const sH=parseInt(ev.start.slice(11,13)), sM=parseInt(ev.start.slice(14,16));
      const eH=parseInt(ev.end.slice(11,13)), eM=parseInt(ev.end.slice(14,16));
      return {ev, startMin:(sH-calStartHour)*60+sM, endMin:(eH-calStartHour)*60+eM};
    }).sort((a,b)=>a.startMin-b.startMin || a.endMin-b.endMin);
    // group into clusters of mutually overlapping events
    const clusters=[]; let cur=null;
    dayEvents.forEach(e=>{
      if (cur && e.startMin < cur.endMax){ cur.items.push(e); cur.endMax=Math.max(cur.endMax,e.endMin); }
      else { cur={items:[e], endMax:e.endMin}; clusters.push(cur); }
    });
    // for each cluster, assign each event to the first available lane
    const placed=[];
    clusters.forEach(cl=>{
      const lanes=[]; // each lane = end time of last event
      cl.items.forEach(e=>{
        let lane = lanes.findIndex(end => end <= e.startMin);
        if (lane===-1){ lane=lanes.length; lanes.push(e.endMin); }
        else lanes[lane]=e.endMin;
        e.lane=lane;
      });
      const total = lanes.length;
      cl.items.forEach(e=>{ e.totalLanes=total; placed.push(e); });
    });
    inner += placed.map(({ev,startMin,endMin,lane,totalLanes})=>{
      const top=(startMin/60)*calPxPerHour;
      const height=Math.max(((endMin-startMin)/60)*calPxPerHour - 2, 22);
      const widthPct = 100/totalLanes;
      const leftPct = lane*widthPct;
      const sLabel=ev.start.slice(11,16), eLabel=ev.end.slice(11,16);
      return `<div class="cal-event ${ev.type}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);right:auto" onclick="event.stopPropagation();openEventPanel(${JSON.stringify(ev).replace(/"/g,'&quot;')})">
        <div class="cal-evt-title">${ev.title}</div>
        <div class="cal-evt-time">${sLabel}–${eLabel}</div>
        ${ev.crew?`<div class="cal-evt-crew">${ev.crew}</div>`:''}
      </div>`;
    }).join('');
    return `<div class="cal-day-col ${today?'today':''}" onclick="openEventPanel({date:'${dayStr}'})">${inner}</div>`;
  }).join('');
}

// ══ EVENT PANEL ══
let evpEditing=null, evpType='visit';
function openEventPanel(ev){
  evpEditing = ev?.id ? ev : null;
  evpType = ev?.type || 'visit';
  document.querySelectorAll('#evp-panel .p-source-tab').forEach(t=>t.classList.toggle('active', t.dataset.evtype===evpType));
  document.getElementById('evp-panel-title').textContent = evpEditing ? 'Edit Event' : 'New Event';
  document.getElementById('evp-panel-sub').textContent = evpEditing ? 'Update details' : 'Add to schedule';
  document.getElementById('evp-delete-btn').style.display = evpEditing ? 'inline-flex' : 'none';
  // populate customer + estimate selects
  refreshEvpCustomerOptions();
  document.getElementById('evp-title-input').value = ev?.title||'';
  document.getElementById('evp-customer-sel').value = ev?.customerId||'';
  refreshEvpEstimateOptions(ev?.customerId||null);
  document.getElementById('evp-estimate-sel').value = ev?.estimateId||'';
  document.getElementById('evp-date').value = ev?.start ? ev.start.slice(0,10) : (ev?.date||'2025-05-02');
  document.getElementById('evp-start').value = ev?.start ? ev.start.slice(11,16) : '08:00';
  document.getElementById('evp-end').value = ev?.end ? ev.end.slice(11,16) : '09:00';
  document.getElementById('evp-crew').value = ev?.crew||'Mike';
  document.getElementById('evp-notes').value = ev?.notes||'';
  applyEvpTypeRules();
  document.getElementById('evp-overlay').classList.add('open');
  document.getElementById('evp-panel').classList.add('open');
}
function refreshEvpCustomerOptions(){
  const sel=document.getElementById('evp-customer-sel');
  // Visit/Job: customer required (no "no customer" option). Other: optional.
  const includeBlank = evpType==='other';
  sel.innerHTML = (includeBlank ? `<option value="">— No customer —</option>` : `<option value="" disabled>— Select customer —</option>`)
    + customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}
function refreshEvpEstimateOptions(customerId){
  const sel=document.getElementById('evp-estimate-sel');
  const ests = customerId ? allEstimates.filter(e=>e.customerId===customerId) : [];
  if (!customerId) {
    sel.innerHTML = `<option value="" disabled>— Pick a customer first —</option>`;
  } else if (ests.length===0) {
    sel.innerHTML = `<option value="" disabled>— No estimates for this customer —</option>`;
  } else {
    sel.innerHTML = `<option value="" disabled>— Select estimate —</option>` + ests.map(e=>{
      const total = e.rooms.reduce((s,r)=>s+r.sqft,0);
      return `<option value="${e.id}">#${e.id} · ${e.rooms.length} rooms · ${total} sqft · ${e.date}</option>`;
    }).join('');
  }
}
function applyEvpTypeRules(){
  const customerLabel = document.getElementById('evp-customer-label');
  const customerJump = document.getElementById('evp-customer-jump');
  const estimateField = document.getElementById('evp-estimate-field');
  const estimateJump = document.getElementById('evp-estimate-jump');
  const customerSel = document.getElementById('evp-customer-sel');
  const estimateSel = document.getElementById('evp-estimate-sel');

  // Customer label: required for visit/job, optional for other
  if (evpType==='other'){
    customerLabel.innerHTML = 'Customer <span style="color:var(--muted);font-weight:400">(optional)</span>';
  } else {
    customerLabel.innerHTML = 'Customer <span style="color:var(--accent)">*</span>';
  }
  // Estimate field: only for jobs
  estimateField.style.display = evpType==='job' ? 'block' : 'none';
  // Re-populate customer options to reflect blank-allowed rule
  const prevCustomer = customerSel.value;
  refreshEvpCustomerOptions();
  customerSel.value = prevCustomer || '';
  // Jump links: only show on edit, when value is set
  const cid = parseInt(customerSel.value);
  customerJump.style.display = (evpEditing && cid) ? 'inline-block' : 'none';
  estimateJump.style.display = (evpEditing && evpType==='job' && parseInt(estimateSel.value)) ? 'inline-block' : 'none';
}
function onEvpCustomerChange(){
  const cid = parseInt(document.getElementById('evp-customer-sel').value)||null;
  refreshEvpEstimateOptions(cid);
  applyEvpTypeRules();
}
function jumpToCustomerFromEvent(){
  const cid = parseInt(document.getElementById('evp-customer-sel').value);
  if (!cid) return;
  closeEventPanel();
  activeCustomerId = cid;
  showScreen('customer-detail');
}
function jumpToEstimateFromEvent(){
  const eid = parseInt(document.getElementById('evp-estimate-sel').value);
  if (!eid) return;
  closeEventPanel();
  activeEstimateId = eid;
  showScreen('estimates');
}
function closeEventPanel(){ document.getElementById('evp-overlay').classList.remove('open'); document.getElementById('evp-panel').classList.remove('open'); }
function selectEventType(btn){
  document.querySelectorAll('#evp-panel .p-source-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  evpType=btn.dataset.evtype;
  applyEvpTypeRules();
}
function saveEvent(){
  const date = document.getElementById('evp-date').value;
  const start = document.getElementById('evp-start').value;
  const end = document.getElementById('evp-end').value;
  const customerId = parseInt(document.getElementById('evp-customer-sel').value)||null;
  const estimateId = parseInt(document.getElementById('evp-estimate-sel').value)||null;
  // VALIDATION
  if (evpType==='visit' && !customerId){ toast('Customer required','Visits must be tied to a customer.'); return; }
  if (evpType==='job'){
    if (!customerId){ toast('Customer required','Jobs must be tied to a customer.'); return; }
    if (!estimateId){ toast('Estimate required','Jobs must be tied to an estimate.'); return; }
  }
  const data = {
    type: evpType,
    title: document.getElementById('evp-title-input').value || 'Untitled',
    customerId,
    estimateId: evpType==='job' ? estimateId : null,
    start: `${date}T${start}`,
    end: `${date}T${end}`,
    crew: document.getElementById('evp-crew').value,
    notes: document.getElementById('evp-notes').value,
  };
  if (evpEditing){ const idx=events.findIndex(e=>e.id===evpEditing.id); events[idx]={...evpEditing,...data}; toast('Event updated',data.title); }
  else { events.push({id:nextEventId++,...data}); toast('Event added',data.title); }
  closeEventPanel();
  renderCalendar();
}
function deleteEvent(){
  if (!evpEditing) return;
  const idx=events.findIndex(e=>e.id===evpEditing.id);
  if (idx>=0){ events.splice(idx,1); toast('Event deleted',evpEditing.title); }
  closeEventPanel();
  renderCalendar();
}

// ══ INIT ══
renderRevChart();
renderCustomerList();
renderEstimateList();
