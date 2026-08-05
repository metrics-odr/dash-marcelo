"use strict";
const DATA = JSON.parse(document.getElementById('payload').textContent);
const LEADS = DATA.leads, META = DATA.meta, B = DATA.build;
const TAX = B.tax_factor || 1.13806;

/* ---------------- format ---------------- */
const nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>(v==null||!isFinite(v))?'-':'R$ '+nf2.format(v);
const pct=v=>(v==null||!isFinite(v))?'-':nf2.format(v*100)+'%';
const intf=v=>(v==null||!isFinite(v))?'-':nf0.format(v);
const numf=v=>(v==null||!isFinite(v))?'-':nf1.format(v);
const dimf=v=>v==null?'-':String(v);
const norm=s=>(s==null?'':String(s)).trim().toLowerCase();
const brdate=d=>{ if(!d) return '-'; const p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
const WD=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekday=d=>{ const dt=new Date(d+'T00:00:00'); return isNaN(dt)?'':WD[dt.getDay()]; };

/* ---------------- date helpers ---------------- */
function pad(n){return String(n).padStart(2,'0');}
function dstr(dt){return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function addDays(s,n){const dt=new Date(s+'T00:00:00');dt.setDate(dt.getDate()+n);return dstr(dt);}
const TODAY = B.today || B.date_max;

/* ---------------- STATE ---------------- */
const STATE = {
  page:'geral', from:B.date_min, to:B.date_max, preset:'todo', tax:false,
  selDays:new Set(),
  mSelC:new Set(), mSelA:new Set(), mSelAd:new Set(),
  sort:{}, colw: JSON.parse(localStorage.getItem('dm_colw')||'{}'),
};
const taxf = ()=> STATE.tax ? TAX : 1;

/* active date test: selDays override the De/Até range */
function dateActive(d){
  if(!d) return false;
  if(STATE.selDays.size) return STATE.selDays.has(d);
  return (!STATE.from || d>=STATE.from) && (!STATE.to || d<=STATE.to);
}
const leadsActive = ()=> LEADS.filter(l=>dateActive(l.d));
const metaActive  = ()=> META.filter(m=>dateActive(m.d));

/* ---------------- aggregation ---------------- */
function derive(a){
  const g=a.sp*taxf();
  return {gasto:g, impr:a.im, clicks:a.cl, leads:a.leads, mqls:a.mqls,
    cpm:a.im?g/a.im*1000:null, ctr:a.im?a.cl/a.im:null, cpc:a.cl?g/a.cl:null,
    convf:a.cl?a.leads/a.cl:null,
    cpl:a.leads?g/a.leads:null, cpmql:a.mqls?g/a.mqls:null, tx:a.leads?a.mqls/a.leads:null};
}
function buildAgg(fL,fM,dim){
  const m={};
  const get=k=>m[k]||(m[k]={sp:0,im:0,cl:0,leads:0,mqls:0});
  fM.forEach(r=>{const a=get(r[dim]); a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl;});
  fL.forEach(r=>{const a=get(r[dim]); a.leads+=1; a.mqls+=r.q;});
  return m;
}
function totals(fL,fM){
  let sp=0,im=0,cl=0; fM.forEach(r=>{sp+=r.sp;im+=r.im;cl+=r.cl;});
  return {sp, im, cl, leads:fL.length, mqls:fL.reduce((s,r)=>s+r.q,0)};
}
/* daily aggregation for a source pair */
function daily(fL,fM){
  const days={}; const g=d=>days[d]||(days[d]={d, sp:0,im:0,cl:0,leads:0,mqls:0});
  fM.forEach(r=>{if(!r.d)return; const a=g(r.d); a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl;});
  fL.forEach(r=>{if(!r.d)return; const a=g(r.d); a.leads+=1; a.mqls+=r.q;});
  return Object.values(days).sort((a,b)=>a.d<b.d?-1:1);
}


/* ---------------- generic interactive table ---------------- */
/* cfg: {id, cols:[{key,label,type,dim?,heat?:'gasto'|'leads'|'mqls',cls?}], rows:[{k,cells:{}, raw?}],
        total:{}, selectable, selSet, onSelect } */
function colWidth(cfg,c){ const saved=(STATE.colw[cfg.id]||{})[c.key];
  if(saved) return saved;
  if(c.w) return c.w;
  if(c.type==='date') return 96;
  if(c.type==='dim') return c.big?360:150;
  return 92; }
function renderTable(cfg){
  const table=document.getElementById(cfg.id); if(!table) return;
  const sortState=STATE.sort[cfg.id];
  let rows=cfg.rows.slice();
  if(sortState){ const {key,dir}=sortState; const c=cfg.cols.find(x=>x.key===key);
    rows.sort((a,b)=>{ let va=a.cells[key], vb=b.cells[key];
      if(c && c.type==='dim'){ va=norm(va); vb=norm(vb); return dir==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); }
      va=(va==null||!isFinite(va))?-Infinity:va; vb=(vb==null||!isFinite(vb))?-Infinity:vb;
      return dir==='asc'?va-vb:vb-va; }); }
  const ext={};
  cfg.cols.forEach(c=>{ if(c.heat){ const vs=rows.map(r=>r.cells[c.key]).filter(v=>v!=null&&isFinite(v)); ext[c.key]=[Math.min(...vs),Math.max(...vs)]; }});
  const fmt=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):dimf(v);
  const widths=cfg.cols.map(c=>colWidth(cfg,c)); const totalW=widths.reduce((a,b)=>a+b,0);
  const colgroup='<colgroup>'+cfg.cols.map((c,i)=>`<col style="width:${widths[i]}px">`).join('')+'</colgroup>';
  let thead='<thead><tr>'+cfg.cols.map((c,i)=>{
    const sc = sortState&&sortState.key===c.key ? (sortState.dir==='asc'?'sorted-asc':'sorted-desc') : '';
    return `<th class="${c.type==='dim'?'dim ':''}${sc}" data-k="${c.key}" data-ci="${i}">${c.label}<span class="rsz"></span></th>`;
  }).join('')+'</tr></thead>';
  let tbody='<tbody>'+rows.map(r=>{
    const sel = cfg.selectable && cfg.selSet && cfg.selSet.has(r.k);
    const tds=cfg.cols.map(c=>{
      const v=r.cells[c.key]; let bg='';
      if(c.heat && ext[c.key]) bg=`background:${heat(v,ext[c.key][0],ext[c.key][1],c.heat)}`;
      const cls=(c.type==='dim'?'dim':'')+(c.cls&&c.cls(r)?' '+c.cls(r):'');
      return `<td class="${cls}" style="${bg}">${fmt(c.type,v)}</td>`;
    }).join('');
    return `<tr class="${sel?'sel':''}" data-k="${encodeURIComponent(r.k)}">${tds}</tr>`;
  }).join('')+'</tbody>';
  let tfoot='';
  if(cfg.total){ tfoot='<tfoot><tr>'+cfg.cols.map((c,i)=>{
    const v=cfg.total[c.key]; return `<td class="${c.type==='dim'?'dim':''}">${i===0?(v==null?'Total Geral':fmt(c.type,v)):fmt(c.type,v)}</td>`;
  }).join('')+'</tr></tfoot>'; }
  table.style.width=totalW+'px';
  table.innerHTML=colgroup+thead+tbody+tfoot;
  const cols=table.querySelector('colgroup').children;
  // sort handlers
  table.querySelectorAll('thead th').forEach(th=>{
    th.addEventListener('click',e=>{ if(e.target.classList.contains('rsz'))return;
      const k=th.dataset.k, cur=STATE.sort[cfg.id];
      if(!cur||cur.key!==k) STATE.sort[cfg.id]={key:k,dir:'asc'};
      else if(cur.dir==='asc') STATE.sort[cfg.id]={key:k,dir:'desc'};
      else delete STATE.sort[cfg.id];
      renderTable(cfg);
    });
  });
  // resize handlers (drag right border) -> resize the <col>, grow the table
  table.querySelectorAll('thead th .rsz').forEach(g=>{
    g.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, ci=+th.dataset.ci, x0=e.clientX;
      const w0=cols[ci].offsetWidth, tw0=table.offsetWidth;
      document.body.style.userSelect='none';
      const mv=ev=>{ const nw=Math.max(60,w0+(ev.clientX-x0)); cols[ci].style.width=nw+'px'; table.style.width=(tw0-w0+nw)+'px';
        STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw; };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; localStorage.setItem('dm_colw',JSON.stringify(STATE.colw)); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
  });
  // row select
  if(cfg.selectable && cfg.onSelect){
    table.querySelectorAll('tbody tr').forEach(tr=>{
      tr.addEventListener('click',e=>{ cfg.onSelect(decodeURIComponent(tr.dataset.k), e); });
    });
  }
}
/* Heatmap por coluna: cor FIXA por métrica (definida em identidade-visual.css),
   só a OPACIDADE varia com o valor (maior valor = mais vibrante). */
const HEAT_HUE={gasto:'--heat-gasto', leads:'--heat-leads', mqls:'--heat-mqls'};
function heat(v,lo,hi,kind){
  if(v==null||!isFinite(v)||hi===lo||!HEAT_HUE[kind]) return 'transparent';
  const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
  const c=hx2rgb(cvar(HEAT_HUE[kind]));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.06+0.5*t).toFixed(3)})`;
}
function toggleSet(set,key,ctrl,others){
  if(ctrl){ set.has(key)?set.delete(key):set.add(key); }
  else { const only=set.has(key)&&set.size===1; set.clear(); if(!only) set.add(key); }
  if(others) others.forEach(s=>s.clear());
}

/* ---------------- funil ---------------- */
function funnelHTML(steps){ return steps.map(s=>`
    <div class="step ${s[3]?'na':''}"><div class="step-main"><div class="m-label">${s[0]}</div><div class="m-val">${s[1]}</div></div>
    <div class="secs">${s[2].map(x=>`<div><span class="s-label">${x[0]}</span><span class="s-val">${x[1]}</span></div>`).join('')}</div></div>`).join(''); }

/* ---------------- charts ---------------- */
const charts={};
const cvar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hx2rgb=h=>{h=(h||'').replace('#','').trim();if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h||'888888',16);return [(n>>16)&255,(n>>8)&255,n&255];};
const cmuted=()=>cvar('--muted')||'#6B7280', cink=()=>cvar('--ink')||'#1A1D2E', cgrid=()=>cvar('--grid')||'#EEF0F5';
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }
function comboChart(id, d){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const labels=d.map(x=>x.d.slice(5)), mut=cmuted(), gr=cgrid();
  const cLeads=cvar('--chart-leads'), cMqls=cvar('--chart-mqls'), cGasto=cvar('--chart-gasto'), cCpl=cvar('--chart-cpl')||cink(), cCpmql=cvar('--chart-cpmql');
  charts[id]=new Chart(el,{
    data:{labels, datasets:[
      {type:'bar',label:'Leads',data:d.map(x=>x.leads),backgroundColor:cLeads,yAxisID:'y',borderRadius:3,order:3},
      {type:'bar',label:'MQLs',data:d.map(x=>x.mqls),backgroundColor:cMqls,yAxisID:'y',borderRadius:3,order:3},
      {type:'line',label:'Gasto',data:d.map(x=>+(x.sp*taxf()).toFixed(2)),borderColor:cGasto,backgroundColor:cGasto,yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:1},
      {type:'line',label:'CPL',data:d.map(x=>x.leads?+((x.sp*taxf())/x.leads).toFixed(2):null),borderColor:cCpl,backgroundColor:cCpl,yAxisID:'y1',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,order:0},
      {type:'line',label:'CPMQL',data:d.map(x=>x.mqls?+((x.sp*taxf())/x.mqls).toFixed(2):null),borderColor:cCpmql,backgroundColor:cCpmql,yAxisID:'y1',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,order:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}},
        tooltip:{callbacks:{label:c=>{const v=c.raw; return c.dataset.label+': '+(c.dataset.yAxisID==='y1'?brl(v):intf(v));}}}},
      scales:{x:{ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{position:'left',ticks:{color:mut,font:{size:10}},grid:{color:gr},beginAtZero:true,title:{display:true,text:'Leads / MQLs',color:mut,font:{size:10}}},
        y1:{position:'right',ticks:{color:mut,font:{size:10}},grid:{display:false},beginAtZero:true,title:{display:true,text:'R$',color:mut,font:{size:10}}}}}
  });
}
function hbar(id, items, valFn, colorFn, top){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  let arr=items.slice().sort((a,b)=>valFn(b)-valFn(a)); if(top) arr=arr.slice(0,top);
  const mut=cmuted();
  charts[id]=new Chart(el,{type:'bar', plugins:[barLabels],
    data:{labels:arr.map(x=>x.label), datasets:[{label:'Leads',data:arr.map(valFn),backgroundColor:arr.map(colorFn||(()=>cvar('--chart-leads'))),borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:28}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>intf(c.raw)+' leads'}}},
      scales:{x:{beginAtZero:true,ticks:{color:mut,precision:0,font:{size:10}},grid:{color:cgrid()}},
              y:{ticks:{color:mut,font:{size:10}},grid:{display:false}}}}});
}
const barLabels={id:'barLabels',afterDatasetsDraw(ch){const{ctx}=ch;ctx.save();ctx.font='600 11px Segoe UI,system-ui';ctx.fillStyle=cmuted();ctx.textBaseline='middle';
  ch.getDatasetMeta(0).data.forEach((el,i)=>{const v=ch.data.datasets[0].data[i]; if(!v)return; ctx.fillText(intf(v),el.x+5,el.y);});ctx.restore();}};
function lineChart(id, d){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const labels=d.map(x=>x.d.slice(5)), mut=cmuted();
  const cCpmql=cvar('--chart-cpmql'), cCpl=cvar('--chart-cpl')||cink();
  charts[id]=new Chart(el,{type:'line',
    data:{labels,datasets:[
      {label:'CPMQL',data:d.map(x=>x.mqls?+((x.sp*taxf())/x.mqls).toFixed(2):null),borderColor:cCpmql,backgroundColor:cCpmql,borderWidth:2,pointRadius:2,spanGaps:true,tension:.25},
      {label:'CPL',data:d.map(x=>x.leads?+((x.sp*taxf())/x.leads).toFixed(2):null),borderColor:cCpl,backgroundColor:cCpl,borderWidth:2,pointRadius:2,spanGaps:true,tension:.25},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:10}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{ticks:{color:mut,font:{size:9}},grid:{display:false}},y:{ticks:{color:mut,font:{size:9}},grid:{color:cgrid()},beginAtZero:true}}}});
}

/* ---------------- KPI cards ---------------- */
function kpiCard(k){ return `<div class="kpi ${k.hero?'hero':''}"><div class="kl"><span>${k.label}</span>${k.pill?`<span class="pill q">${k.pill}</span>`:''}</div><div class="kv">${k.val}</div><div class="ka">${k.aux||''}</div></div>`; }

/* ---------------- PAGE 1: Visão Geral ---------------- */
function renderGeral(){
  const fL=leadsActive(), fM=metaActive();
  const t=totals(fL,fM), dv=derive(t), g=dv.gasto;
  const leadsAds=fL.filter(l=>l.src==='meta'||l.src==='google');
  const nAds=leadsAds.length, mqlsAds=leadsAds.reduce((s,r)=>s+r.q,0);
  const nOrg=fL.filter(l=>l.src==='org').length;
  const semUtm=fL.filter(l=>!l.utm).length, comUtm=t.leads-semUtm;
  const NA='<span class="na-tag">sem dado</span>';
  const steps=[
    ['Gasto Total', brl(g), []],
    ['Impressões', intf(t.im), [['CPM',brl(dv.cpm)]]],
    ['Cliques', intf(t.cl), [['CTR',pct(dv.ctr)],['CPC',brl(dv.cpc)]]],
    ['Leads', intf(t.leads), [['CPL',brl(dv.cpl)],['ConvForm',pct(dv.convf)]]],
    ['MQLs (≥30k)', intf(t.mqls), [['Tx‑MQL',pct(dv.tx)],['CPMQL',brl(dv.cpmql)]]],
    ['Vendas', NA, [['CAC',NA]], true],
    ['Faturamento', NA, [['ROAS',NA],['Ticket',NA]], true],
  ];
  document.getElementById('geralFunnel').innerHTML=funnelHTML(steps);
  const k2=[
    {label:'Leads Ads',val:intf(nAds),aux:'CPL Ads '+brl(nAds?g/nAds:null)},
    {label:'MQLs Ads',val:intf(mqlsAds),aux:'CPMQL '+brl(mqlsAds?g/mqlsAds:null)},
    {label:'Tx‑MQL Ads',val:pct(nAds?mqlsAds/nAds:null),aux:'MQLs Ads / Leads Ads'},
    {label:'Impressões',val:intf(t.im),aux:'CTR '+pct(t.im?t.cl/t.im:null)},
    {label:'Cliques',val:intf(t.cl),aux:'CPC '+brl(t.cl?g/t.cl:null)},
    {label:'CPM',val:brl(t.im?g/t.im*1000:null),aux:'por mil impr.'},
    {label:'Leads s/ UTM',val:intf(semUtm),aux:'UTM inválida/vazia'},
    {label:'% Eficácia Rastr.',val:pct(t.leads?comUtm/t.leads:null),aux:'Leads c/ UTM / Leads'},
    {label:'Leads Orgânicos',val:intf(nOrg),aux:'sem fonte paga'},
    {label:'Proporção Org:Ads',val:nOrg?numf(nAds/nOrg)+':1':'-',aux:'Ads por orgânico'},
  ];
  document.getElementById('geralKpis2').innerHTML=k2.map(kpiCard).join('');
  comboChart('gCombo', daily(fL,fM));
  // por origem
  const srcName={meta:'Meta Ads',google:'Google Ads',org:'Orgânico',outros:'Outros'};
  const bySrc={}; fL.forEach(l=>{const k=srcName[l.src]||l.src; bySrc[k]=(bySrc[k]||0)+1;});
  hbar('gSource', Object.entries(bySrc).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-leads'));
  // por faixa
  const byB={}; fL.forEach(l=>{byB[l.bucket]=byB[l.bucket]||{label:l.bucket,leads:0,q:l.q}; byB[l.bucket].leads++;});
  const order=['Menos de 5 mil','Entre 5 a 10 mil','Entre 10 a 20 mil','Entre 20 a 30 mil','Entre 30 a 50 mil','Entre 50 a 100 mil','Mais de 100 mil','Sem resposta'];
  const bArr=Object.values(byB).sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label));
  hbar('gBucket', bArr, x=>x.leads, x=>x.q?cvar('--bar-q'):cvar('--bar-noq'));
  // por plataforma
  const platName={ig:'Instagram',fb:'Facebook','—':'Orgânico/—'};
  const byP={}; fL.forEach(l=>{const k=platName[l.plat]||l.plat; byP[k]=(byP[k]||0)+1;});
  hbar('gPlat', Object.entries(byP).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-leads'));
  // por profissao (top 10)
  const byPr={}; fL.forEach(l=>{byPr[l.prof]=(byPr[l.prof]||0)+1;});
  hbar('gProf', Object.entries(byPr).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-mqls'), 10);
  // tabela diaria (todos os leads), ultimo dia no topo + heatmap
  const dl=daily(fL,fM).slice().reverse();
  renderTable({id:'gDaily', cols:DAILY_COLS,
    rows:dl.map(x=>{const d=derive(x); return {k:x.d, cells:dailyCells(x,d)};}),
    total:(()=>{const d=derive(t);return dailyCells({d:null,leads:t.leads,mqls:t.mqls},d,true);})(),
    selectable:true, selSet:STATE.selDays,
    onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); },
  });
}
/* colunas padrão das tabelas de heatmap por dia (ordem pedida) */
const DAILY_COLS=[
  {key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:70},
  {key:'gasto',label:'Gasto',type:'brl',heat:'gasto'},{key:'cpm',label:'CPM',type:'brl'},
  {key:'ctr',label:'CTR',type:'pct'},{key:'convf',label:'ConvForm',type:'pct'},
  {key:'leads',label:'Leads',type:'int',heat:'leads'},{key:'cpl',label:'CPL',type:'brl'},
  {key:'tx',label:'Tx‑MQL',type:'pct'},{key:'mqls',label:'MQLs',type:'int',heat:'mqls'},{key:'cpmql',label:'CPMQL',type:'brl'},
];
function dailyCells(x,d,isTotal){
  return {date:isTotal?null:x.d, wd:isTotal?'':weekday(x.d), gasto:d.gasto, cpm:d.cpm, ctr:d.ctr, convf:d.convf,
    leads:x.leads, cpl:d.cpl, tx:d.tx, mqls:x.mqls, cpmql:d.cpmql};
}

/* ---------------- PAGE 2: Captura Meta Ads ---------------- */
function metaScope(ex){ let fL=leadsActive().filter(l=>l.src==='meta'), fM=metaActive();
  if(ex!=='C'&&STATE.mSelC.size){ fL=fL.filter(r=>STATE.mSelC.has(r.camp)); fM=fM.filter(r=>STATE.mSelC.has(r.camp)); }
  if(ex!=='A'&&STATE.mSelA.size){ fL=fL.filter(r=>STATE.mSelA.has(r.adset)); fM=fM.filter(r=>STATE.mSelA.has(r.adset)); }
  if(ex!=='D'&&STATE.mSelAd.size){ fL=fL.filter(r=>STATE.mSelAd.has(r.ad)); fM=fM.filter(r=>STATE.mSelAd.has(r.ad)); }
  return {fL,fM}; }
/* selecao multipla: Ctrl adiciona (OR) sem sumir as demais linhas; clique simples troca a ancora */
function selDim(dim,key,ctrl){
  const sets={C:STATE.mSelC,A:STATE.mSelA,D:STATE.mSelAd}, s=sets[dim];
  if(ctrl){ s.has(key)?s.delete(key):s.add(key); }
  else { const sole=s.has(key)&&s.size===1&&!Object.entries(sets).some(([k2,x])=>k2!==dim&&x.size);
    Object.values(sets).forEach(x=>x.clear()); if(!sole) s.add(key); }
  renderMeta();
}
function renderMeta(){
  const F=metaScope(null), fL=F.fL, fM=F.fM;   // KPIs, funil, graficos e tabela diaria
  const t=totals(fL,fM), dv=derive(t), g=dv.gasto;
  const NA='<span class="na-tag">sem dado</span>';
  const steps=[
    ['Gasto Total', brl(g), []],
    ['Impressões', intf(t.im), [['CPM',brl(dv.cpm)],['Frequência',NA]]],
    ['Cliques', intf(t.cl), [['CTR',pct(dv.ctr)],['CPC',brl(dv.cpc)]]],
    ['Page Views', NA, [['CR',NA],['CPV',NA]], true],
    ['Leads', intf(t.leads), [['CPL',brl(dv.cpl)],['ConvForm',pct(dv.convf)]]],
    ['MQLs (≥30k)', intf(t.mqls), [['Tx‑MQL',pct(dv.tx)],['CPMQL',brl(dv.cpmql)]]],
    ['Vendas', NA, [['ConvMQL',NA],['CAC',NA]], true],
    ['Faturamento', NA, [['ROAS',NA],['Ticket',NA]], true],
  ];
  document.getElementById('metaFunnel').innerHTML=funnelHTML(steps);

  comboChart('mCombo', daily(fL,fM));
  const byAd={}; fL.forEach(l=>{byAd[l.ad]=(byAd[l.ad]||0)+1;});
  hbar('mContent', Object.entries(byAd).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-leads'), 10);

  const dl=daily(fL,fM).slice().reverse();
  renderTable({id:'tDaily', cols:DAILY_COLS,
    rows:dl.map(x=>{const d=derive(x); return {k:x.d, cells:dailyCells(x,d)};}),
    total:(()=>{const d=derive(t);return dailyCells({d:null,leads:t.leads,mqls:t.mqls},d,true);})(),
    selectable:true, selSet:STATE.selDays,
    onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); },
  });

  // hierarquia — cada tabela vem do escopo que exclui a PRÓPRIA dimensão,
  // então todas as linhas irmãs continuam visíveis para multi-seleção (Ctrl).
  const hcols=[
    {key:'dim',label:'',type:'dim',big:true},{key:'gasto',label:'Gasto',type:'brl'},{key:'cpm',label:'CPM',type:'brl'},
    {key:'ctr',label:'CTR',type:'pct'},{key:'convf',label:'ConvForm',type:'pct'},
    {key:'leads',label:'Leads',type:'int'},{key:'cpl',label:'CPL',type:'brl'},
    {key:'tx',label:'Tx‑MQL',type:'pct'},{key:'mqls',label:'MQLs',type:'int'},{key:'cpmql',label:'CPMQL',type:'brl'},
  ];
  function hierRows(map){ return Object.entries(map).map(([k,a])=>{const d=derive(a);
    return {k, cells:{dim:k,gasto:d.gasto,cpm:d.cpm,ctr:d.ctr,convf:d.convf,leads:a.leads,cpl:d.cpl,tx:d.tx,mqls:a.mqls,cpmql:d.cpmql}};}); }
  function totRowOf(tt){const d=derive(tt);return{dim:null,gasto:d.gasto,cpm:d.cpm,ctr:d.ctr,convf:d.convf,leads:tt.leads,cpl:d.cpl,tx:d.tx,mqls:tt.mqls,cpmql:d.cpmql};}
  const Sc=metaScope('C'), Sa=metaScope('A'), Sd=metaScope('D');
  renderTable({id:'tCamp', cols:hcols.map((c,i)=>i===0?{...c,label:'Campanha'}:c), rows:hierRows(buildAgg(Sc.fL,Sc.fM,'camp')), total:totRowOf(totals(Sc.fL,Sc.fM)),
    selectable:true, selSet:STATE.mSelC, onSelect:(k,e)=>selDim('C',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'tAdset', cols:hcols.map((c,i)=>i===0?{...c,label:'Conjunto',big:true}:c), rows:hierRows(buildAgg(Sa.fL,Sa.fM,'adset')), total:totRowOf(totals(Sa.fL,Sa.fM)),
    selectable:true, selSet:STATE.mSelA, onSelect:(k,e)=>selDim('A',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'tAd', cols:hcols.map((c,i)=>i===0?{...c,label:'Anúncio'}:c), rows:hierRows(buildAgg(Sd.fL,Sd.fM,'ad')), total:totRowOf(totals(Sd.fL,Sd.fM)),
    selectable:true, selSet:STATE.mSelAd, onSelect:(k,e)=>selDim('D',k,e&&(e.ctrlKey||e.metaKey))});

  const dch=daily(fL,fM);
  lineChart('chCamp',dch); lineChart('chAdset',dch); lineChart('chAd',dch);

  // qualified leads
  const q=fL.filter(l=>l.q).sort((a,b)=>(a.d<b.d?1:-1));
  document.getElementById('qCount').textContent=q.length+' leads';
  renderTable({id:'tQual',
    cols:[{key:'d',label:'Data',type:'date'},{key:'nm',label:'Nome',type:'dim'},{key:'prof',label:'Profissão',type:'dim'},
      {key:'bucket',label:'Faixa',type:'dim'},{key:'camp',label:'Campanha',type:'dim',big:true},{key:'em',label:'E‑mail',type:'dim',w:200},{key:'ph',label:'Telefone',type:'dim',w:110}],
    rows:q.map((l,i)=>({k:'q'+i, cells:{d:l.d,nm:l.nm,prof:l.prof,bucket:l.bucket,camp:l.camp,em:l.em,ph:l.ph}}))});
}

/* ---------------- date presets ---------------- */
const PRESETS=[
  ['hoje','Hoje',()=>[TODAY,TODAY]],
  ['ontem','Ontem',()=>[addDays(TODAY,-1),addDays(TODAY,-1)]],
  ['3d','3 dias',()=>[addDays(TODAY,-2),TODAY]],
  ['7d','7 dias',()=>[addDays(TODAY,-6),TODAY]],
  ['14d','14 dias',()=>[addDays(TODAY,-13),TODAY]],
  ['30d','30 dias',()=>[addDays(TODAY,-29),TODAY]],
  ['mes','Este mês',()=>{const [y,m]=TODAY.split('-');return [`${y}-${m}-01`,TODAY];}],
  ['mespass','Mês passado',()=>{const dt=new Date(TODAY+'T00:00:00');const f=new Date(dt.getFullYear(),dt.getMonth()-1,1);const l=new Date(dt.getFullYear(),dt.getMonth(),0);return [dstr(f),dstr(l)];}],
  ['todo','Todo período',()=>[B.date_min,B.date_max]],
];
/* rótulo do botão de período — mostra o intervalo aplicado dentro do próprio botão */
function syncDateInputs(){
  const el=document.getElementById('periodBtnLabel'); if(!el) return;
  if(STATE.selDays.size){ el.textContent=STATE.selDays.size+(STATE.selDays.size>1?' dias selecionados':' dia selecionado'); return; }
  const pr=PRESETS.find(p=>p[0]===STATE.preset);
  if(STATE.from&&STATE.to) el.textContent=brdate(STATE.from)+' – '+brdate(STATE.to)+(pr?' · '+pr[1]:'');
  else el.textContent='Selecionar período';
}
function applyPreset(id){ const p=PRESETS.find(x=>x[0]===id); if(!p)return; const [f,t]=p[2]();
  STATE.from=f; STATE.to=t; STATE.preset=id; STATE.selDays.clear(); ppClose(); syncDateInputs(); renderAll(); }

/* ---- popover do seletor de período (estilo Data Studio) ---- */
const MONTHS_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_PT=['D','S','T','Q','Q','S','S'];
const PP={from:null,to:null,preset:'',fromView:'',toView:''};
function ymView(ds){ return (ds||TODAY).slice(0,7); }
function shiftView(view,delta){ const [y,m]=view.split('-').map(Number); const dt=new Date(y,m-1+delta,1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
function ppIsOpen(){ const pop=document.getElementById('periodPop'); return pop && !pop.hidden; }
function ppOpen(){
  PP.from=STATE.from; PP.to=STATE.to; PP.preset=STATE.selDays.size?'':STATE.preset;
  PP.fromView=ymView(STATE.from); PP.toView=ymView(STATE.to);
  document.getElementById('periodPop').hidden=false;
  document.getElementById('periodBtn').setAttribute('aria-expanded','true');
  ppRenderAll();
}
function ppClose(){ const pop=document.getElementById('periodPop'); if(pop) pop.hidden=true;
  const b=document.getElementById('periodBtn'); if(b) b.setAttribute('aria-expanded','false'); }
function ppRenderAll(){ ppRenderPresets(); ppRenderCal('from'); ppRenderCal('to'); ppRenderRange(); }
function ppRenderPresets(){
  const host=document.getElementById('ppPresets');
  host.innerHTML=PRESETS.map(p=>`<button class="pp-preset ${PP.preset===p[0]?'active':''}" data-p="${p[0]}">${p[1]}</button>`).join('');
  host.querySelectorAll('.pp-preset').forEach(c=>c.addEventListener('click',()=>{
    const p=PRESETS.find(x=>x[0]===c.dataset.p); const [f,t]=p[2]();
    PP.from=f; PP.to=t; PP.preset=p[0]; PP.fromView=ymView(f); PP.toView=ymView(t); ppRenderAll();
  }));
}
function ppRenderCal(side){
  const host=document.getElementById(side==='from'?'ppCalFrom':'ppCalTo');
  const view=side==='from'?PP.fromView:PP.toView;
  const [y,m]=view.split('-').map(Number);
  const startDow=new Date(y,m-1,1).getDay(), dim=new Date(y,m,0).getDate();
  let cells='';
  for(let i=0;i<startDow;i++) cells+='<span class="pp-day empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=view+'-'+pad(d);
    const inR=PP.from&&PP.to&&ds>=PP.from&&ds<=PP.to, isEdge=(ds===PP.from||ds===PP.to);
    const cls=['pp-day']; if(inR) cls.push('in'); if(ds===PP.from) cls.push('edge-l'); if(ds===PP.to) cls.push('edge-r'); if(isEdge) cls.push('sel');
    cells+=`<button class="${cls.join(' ')}" data-side="${side}" data-d="${ds}">${d}</button>`;
  }
  host.innerHTML=`<div class="pp-cal-head"><span class="pp-cal-title">${side==='from'?'Data de início':'Data de término'}</span></div>
    <div class="pp-cal-nav"><button class="pp-nav" data-nav="-1">‹</button><span class="pp-cal-month">${MONTHS_PT[m-1]} ${y}</span><button class="pp-nav" data-nav="1">›</button></div>
    <div class="pp-dow">${DOW_PT.map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="pp-grid">${cells}</div>`;
  host.querySelectorAll('.pp-nav').forEach(b=>b.addEventListener('click',()=>{
    const nv=shiftView(view,+b.dataset.nav); if(side==='from') PP.fromView=nv; else PP.toView=nv; ppRenderCal(side);
  }));
  host.querySelectorAll('.pp-day[data-d]').forEach(b=>b.addEventListener('click',()=>ppPickDay(side,b.dataset.d)));
}
function ppPickDay(side,ds){
  PP.preset='';
  if(side==='from'){ PP.from=ds; if(PP.to&&PP.from>PP.to) PP.to=PP.from; }
  else { PP.to=ds; if(PP.from&&PP.to<PP.from) PP.from=PP.to; }
  ppRenderAll();
}
function ppRenderRange(){
  const el=document.getElementById('ppRange');
  if(PP.from&&PP.to){ const n=Math.round((new Date(PP.to+'T00:00:00')-new Date(PP.from+'T00:00:00'))/86400000)+1;
    el.textContent=brdate(PP.from)+' – '+brdate(PP.to)+(n>0?' · '+n+(n>1?' dias':' dia'):''); }
  else el.textContent='Selecione as datas';
}
function ppApply(){
  if(!PP.from||!PP.to){ ppClose(); return; }
  STATE.from=PP.from; STATE.to=PP.to; STATE.preset=PP.preset||''; STATE.selDays.clear();
  ppClose(); syncDateInputs(); renderAll();
}

/* ---------------- navigation & boot ---------------- */
function setPage(p){ STATE.page=p;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===p));
  document.getElementById('page-geral').classList.toggle('active',p==='geral');
  document.getElementById('page-meta').classList.toggle('active',p==='meta');
  document.getElementById('ptitle').textContent = p==='meta'?'Captura Meta Ads':'Visão Geral de Leads';
  document.getElementById('navToggle').checked=false;
  history.replaceState(null,'', p==='meta'?'#meta':'#geral');
  renderAll();
}
function renderAll(){ if(STATE.page==='meta') renderMeta(); else renderGeral(); }

function applyTheme(){ const t=localStorage.getItem('dm_theme'); if(t==='dark') document.documentElement.setAttribute('data-theme','dark'); else document.documentElement.removeAttribute('data-theme'); }
applyTheme();
document.getElementById('themeBtn').addEventListener('click',()=>{ const dark=document.documentElement.getAttribute('data-theme')==='dark'; localStorage.setItem('dm_theme',dark?'light':'dark'); applyTheme(); renderAll(); });

document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>setPage(n.dataset.page)));
document.getElementById('taxToggle').addEventListener('click',function(){ STATE.tax=!STATE.tax; this.classList.toggle('on',STATE.tax); renderAll(); });
/* seletor de período: abre/fecha popover, aplicar/cancelar, fechar ao clicar fora/Esc */
document.getElementById('periodBtn').addEventListener('click',e=>{ e.stopPropagation(); ppIsOpen()?ppClose():ppOpen(); });
document.getElementById('ppApply').addEventListener('click',ppApply);
document.getElementById('ppCancel').addEventListener('click',ppClose);
document.getElementById('periodPop').addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>{ if(ppIsOpen()) ppClose(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&ppIsOpen()) ppClose(); });
document.getElementById('clearBtn').addEventListener('click',()=>{ STATE.mSelC.clear();STATE.mSelA.clear();STATE.mSelAd.clear();STATE.selDays.clear(); applyPreset('mes'); });
document.getElementById('refreshBtn').addEventListener('click',function(){ this.classList.add('loading'); location.href=location.pathname+'?t='+Date.now()+location.hash; });

document.getElementById('updated').innerHTML='Última atualização:<br>'+B.generated_at_brt+' (BRT)';
document.getElementById('buildFoot').textContent='build __BUILD_ID__';
document.getElementById('buildFoot2').textContent='· build __BUILD_ID__';

syncDateInputs();
setPage(location.hash==='#meta'?'meta':'geral');

/* auto-refresh com cache-bust ~30 min */
setTimeout(()=>{ location.href=location.pathname+'?t='+Date.now()+location.hash; }, 30*60*1000);
