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
/* --------- FUNIL PROFUNDO: Check-in → Presença → Venda (aguardando dados) ---------
   Funil do evento presencial high-ticket:
     Impressões → Cliques → Leads → MQLs → Check-ins → Presenças → Vendas → Faturamento.
   Quando a fonte do comercial/evento chegar, some `checkins`, `presencas`,
   `vendas` e `fat` por linha em buildAgg/daily/totals e TODA a UI acende sozinha
   (funil, cards, colunas das tabelas, Top/Piores anúncios). Enquanto não houver,
   cada métrica derivada retorna null -> "-". */
function salesOf(a){
  const g=(a?a.sp:0)*taxf();
  const mqls=(a&&a.mqls)||0;
  const checkins=(a&&a.checkins)||0, presencas=(a&&a.presencas)||0;
  const vendas=(a&&a.vendas)||0, fat=(a&&a.fat)||0;
  const hasCk=checkins>0, hasPr=presencas>0, hasVd=vendas>0||fat>0;
  return {
    // MQL → Check-in
    checkins:  hasCk?checkins:null,
    txcheckin: hasCk&&mqls?checkins/mqls:null,   // check-ins / MQLs
    cpcin:     hasCk?g/checkins:null,             // custo por check-in
    // Check-in → Presença
    presencas: hasPr?presencas:null,
    txpres:    hasPr&&hasCk?presencas/checkins:null,  // presenças / check-ins
    cpp:       hasPr?g/presencas:null,                // custo por presença
    // Presença → Venda
    vendas:    hasVd?vendas:null,
    txvenda:   hasVd&&hasPr?vendas/presencas:null,    // vendas / presenças
    fat:       hasVd?fat:null,
    cac:       hasVd&&vendas?g/vendas:null,
    roas:      hasVd&&g?fat/g:null,
    tm:        hasVd&&vendas?fat/vendas:null,
    convmql:   hasVd&&mqls?vendas/mqls:null,
  };
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
// medição de texto (canvas) p/ auto-largura de coluna — "caiba o nome inteiro" (dim)
// e auto-ajuste em duplo-clique na borda, como Google Sheets / Looker Studio.
let _measureCtx=null;
function textWidth(s, font){
  if(!_measureCtx) _measureCtx=document.createElement('canvas').getContext('2d');
  _measureCtx.font=font;
  return _measureCtx.measureText(s==null?'':String(s)).width;
}
const fmtStd=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):dimf(v);
const FONT_DIM='500 12.5px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
const FONT_NUM='12.5px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
const FONT_HEAD='700 11px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
function autoDimWidth(cfg,c){
  let max=textWidth(c.label||'',FONT_HEAD);
  (cfg.rows||[]).forEach(r=>{ const w=textWidth(fmtStd(c.type,r.cells[c.key]),FONT_DIM); if(w>max) max=w; });
  if(cfg.total && cfg.total[c.key]!=null){ const w=textWidth(fmtStd(c.type,cfg.total[c.key]),FONT_DIM); if(w>max) max=w; }
  return Math.max(140, Math.min(640, Math.round(max)+34)); // + padding (10+10) + folga p/ seta de ordenação
}
function autoColWidth(cfg,c){
  if(c.type==='dim') return autoDimWidth(cfg,c);
  let max=textWidth(c.label||'',FONT_HEAD);
  (cfg.rows||[]).forEach(r=>{ const w=textWidth(fmtStd(c.type,r.cells[c.key]),FONT_NUM); if(w>max) max=w; });
  if(cfg.total && cfg.total[c.key]!=null){ const w=textWidth(fmtStd(c.type,cfg.total[c.key]),FONT_NUM); if(w>max) max=w; }
  return Math.max(60, Math.min(260, Math.round(max)+24));
}
function colWidth(cfg,c){ const saved=(STATE.colw[cfg.id]||{})[c.key];
  if(saved) return saved;
  if(c.w) return c.w;
  if(c.type==='date') return 96;
  if(c.type==='dim') return autoDimWidth(cfg,c);   // por padrão, cabe o nome inteiro
  return 92; }
function renderTable(cfg){
  const table=document.getElementById(cfg.id); if(!table) return;
  table.classList.toggle('dt-center', !!cfg.center);   // Mar01: dados centralizados
  const fit=!!cfg.fit;                                  // fit: cabe 100% da largura, sem scroll
  table.classList.toggle('dt-fit', fit);
  const sortState=STATE.sort[cfg.id];
  let rows=cfg.rows.slice();
  if(sortState){ const {key,dir}=sortState; const c=cfg.cols.find(x=>x.key===key);
    rows.sort((a,b)=>{ let va=a.cells[key], vb=b.cells[key];
      if(c && c.type==='dim'){ va=norm(va); vb=norm(vb); return dir==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); }
      va=(va==null||!isFinite(va))?-Infinity:va; vb=(vb==null||!isFinite(vb))?-Infinity:vb;
      return dir==='asc'?va-vb:vb-va; }); }
  const ext={};
  cfg.cols.forEach(c=>{ if(c.heat){ const vs=rows.map(r=>r.cells[c.key]).filter(v=>v!=null&&isFinite(v)); ext[c.key]=[Math.min(...vs),Math.max(...vs)]; }});
  // em tabelas densas (fit) o R$ é omitido nas células (o cabeçalho já indica) p/ caber sem cortar
  const brlc=v=>(v==null||!isFinite(v))?'-':nf2.format(v);
  const fmt=(t,v)=> t==='brl'?(fit?brlc(v):brl(v)):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):dimf(v);
  const widths=fit?[]:cfg.cols.map(c=>colWidth(cfg,c)); const totalW=widths.reduce((a,b)=>a+b,0);
  // modo fit: dimensão/data com largura fixa; colunas numéricas dividem o resto por igual
  const fitW=c=> c.w?c.w+'px' : c.type==='date'?'74px' : c.type==='dim'?(c.big?'210px':'116px') : '';
  const colgroup='<colgroup>'+cfg.cols.map((c,i)=>{
    const w=fit?fitW(c):(widths[i]+'px'); return `<col${w?` style="width:${w}"`:''}>`;
  }).join('')+'</colgroup>';
  const esc=s=>String(s==null?'':s).replace(/"/g,'&quot;');
  let thead='<thead><tr>'+cfg.cols.map((c,i)=>{
    const sc = sortState&&sortState.key===c.key ? (sortState.dir==='asc'?'sorted-asc':'sorted-desc') : '';
    return `<th class="${c.type==='dim'?'dim ':''}${sc}" data-k="${c.key}" data-ci="${i}" title="${esc(c.label)}">${c.label}${fit?'':'<span class="rsz"></span>'}</th>`;
  }).join('')+'</tr></thead>';
  // title = valor SEMPRE completo (mesmo em fit, onde a célula pode abreviar/cortar) — passe o mouse p/ ver
  let tbody='<tbody>'+rows.map(r=>{
    const sel = cfg.selectable && cfg.selSet && cfg.selSet.has(r.k);
    const tds=cfg.cols.map(c=>{
      const v=r.cells[c.key]; let bg='';
      if(c.heat && ext[c.key]) bg=`background:${heat(v,ext[c.key][0],ext[c.key][1],c.heat)}`;
      const cls=(c.type==='dim'?'dim':'')+(c.cls&&c.cls(r)?' '+c.cls(r):'');
      return `<td class="${cls}" style="${bg}" title="${esc(fmtStd(c.type,v))}">${fmt(c.type,v)}</td>`;
    }).join('');
    return `<tr class="${sel?'sel':''}" data-k="${encodeURIComponent(r.k)}">${tds}</tr>`;
  }).join('')+'</tbody>';
  let tfoot='';
  if(cfg.total){ tfoot='<tfoot><tr>'+cfg.cols.map((c,i)=>{
    const v=cfg.total[c.key]; const isFirst=i===0&&v==null;
    return `<td class="${c.type==='dim'?'dim':''}" title="${isFirst?'Total Geral':esc(fmtStd(c.type,v))}">${isFirst?'Total Geral':fmt(c.type,v)}</td>`;
  }).join('')+'</tr></tfoot>'; }
  table.style.width=fit?'100%':totalW+'px';
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
  if(!fit) table.querySelectorAll('thead th .rsz').forEach(g=>{
    g.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, ci=+th.dataset.ci, x0=e.clientX;
      const w0=cols[ci].offsetWidth, tw0=table.offsetWidth;
      document.body.style.userSelect='none';
      const mv=ev=>{ const nw=Math.max(60,w0+(ev.clientX-x0)); cols[ci].style.width=nw+'px'; table.style.width=(tw0-w0+nw)+'px';
        STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw; };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; localStorage.setItem('dm_colw',JSON.stringify(STATE.colw)); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
    // duplo-clique na borda = auto-ajustar largura ao conteúdo (como Sheets/Looker)
    g.addEventListener('dblclick',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, c=cfg.cols.find(x=>x.key===k);
      const nw=autoColWidth(cfg,c);
      STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw;
      localStorage.setItem('dm_colw',JSON.stringify(STATE.colw));
      renderTable(cfg);
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
    <div class="step ${s[3]?'na':''} ${s[4]||''}"><div class="step-main"><div class="m-label">${s[0]}</div><div class="m-val">${s[1]}</div></div>
    <div class="secs">${s[2].map(x=>`<div><span class="s-label">${x[0]}</span><span class="s-val">${x[1]}</span></div>`).join('')}</div></div>`).join(''); }

/* ---------------- charts ---------------- */
const charts={};
const cvar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hx2rgb=h=>{h=(h||'').replace('#','').trim();if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h||'888888',16);return [(n>>16)&255,(n>>8)&255,n&255];};
const CHART_SERIES=['--cc1','--cc2','--cc3','--cc4','--cc5','--cc6','--cc7','--cc8','--cc9','--cc10'];
const chartPalette=()=>CHART_SERIES.map(v=>cvar(v)||'#888888');
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
function hbar(id, items, valFn, colorFn, top, unit){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  unit=unit||'leads';
  let arr=items.slice().sort((a,b)=>valFn(b)-valFn(a)); if(top) arr=arr.slice(0,top);
  const mut=cmuted();
  charts[id]=new Chart(el,{type:'bar', plugins:[barLabels],
    data:{labels:arr.map(x=>x.label), datasets:[{label:unit,data:arr.map(valFn),backgroundColor:arr.map(colorFn||(()=>cvar('--chart-leads'))),borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:28}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>intf(c.raw)+' '+unit}}},
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

/* Donut de taxa de qualificação (Mar02): verde = MQL · vermelho = desqualificado */
function donutQlf(id, mqls, leads){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const dsq=Math.max(0,leads-mqls);
  charts[id]=new Chart(el,{type:'doughnut',
    data:{labels:['MQL (qualificado)','Desqualificado'],datasets:[{data:[mqls,dsq],
      backgroundColor:[cvar('--good'),cvar('--bad')],borderColor:cvar('--surface'),borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.label+': '+intf(c.raw)+(leads?' ('+pct(c.raw/leads)+')':'')}}}}});
  const el2=document.getElementById('mQlfPct'); if(el2) el2.textContent=pct(leads?mqls/leads:null);
}
/* Mar03: MQLs por dimensão (campanha/conjunto/anúncio) por dia — 1 linha por membro.
   Legenda oculta e tooltip 'nearest' mostram o NOME COMPLETO sem truncar + MQLs do dia. */
/* quebra um rótulo longo em várias linhas (p/ o tooltip NUNCA truncar o nome) */
function wrapLabel(s,n){ s=String(s==null?'':s); const words=s.split(' '); const lines=[]; let cur='';
  words.forEach(w=>{ if(cur && (cur+' '+w).length>n){ lines.push(cur); cur=w; } else cur=cur?cur+' '+w:w; });
  if(cur) lines.push(cur); return lines.length?lines:['—']; }
function mqlByDimChart(id, fL, dim){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const days=[...new Set(fL.filter(r=>r.d).map(r=>r.d))].sort();
  const members=[...new Set(fL.map(r=>r[dim]))];
  const pal=chartPalette(), mut=cmuted();
  const dsets=members.map((mv,i)=>{
    const byDay={}; days.forEach(d=>byDay[d]=0);
    fL.forEach(r=>{ if(r[dim]===mv && r.d!=null && byDay[r.d]!=null) byDay[r.d]+=r.q; });
    const col=pal[i%pal.length];
    return {label:String(mv), data:days.map(d=>byDay[d]), borderColor:col, backgroundColor:col, borderWidth:2, pointRadius:2, tension:.25, spanGaps:true};
  });
  charts[id]=new Chart(el,{type:'line',
    data:{labels:days.map(d=>d.slice(5)), datasets:dsets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},
      plugins:{legend:{display:false},
        // tooltip mostra o NOME COMPLETO (quebrado em linhas, sem truncar) + MQLs do dia
        tooltip:{displayColors:true,
          callbacks:{title:it=>it.length?wrapLabel(it[0].dataset.label,44):'', label:c=>c.label+': '+intf(c.raw)+' MQLs'}}},
      scales:{x:{ticks:{color:mut,font:{size:9}},grid:{display:false}},
        y:{ticks:{color:mut,font:{size:9},precision:0},grid:{color:cgrid()},beginAtZero:true}}}});
}

/* ---------------- KPI cards ---------------- */
function kpiCard(k){ return `<div class="kpi ${k.hero?'hero':''}"><div class="kl"><span>${k.label}</span>${k.pill?`<span class="pill q">${k.pill}</span>`:''}</div><div class="kv">${k.val}</div><div class="ka">${k.aux||''}</div></div>`; }

/* ---------------- PAGE 1: Visão Geral ---------------- */
/* IDs dos elementos por página — a Visão Geral e o Relatório compartilham o
   MESMO corpo (renderGeralCore), só mudam os alvos no DOM. */
const GERAL_IDS={funnel:'geralFunnel',kpis2:'geralKpis2',combo:'gCombo',source:'gSource',bucket:'gBucket',plat:'gPlat',prof:'gProf',daily:'gDaily'};
const REL_IDS  ={funnel:'relFunnel', kpis2:'relKpis2', combo:'rCombo',source:'rSource',bucket:'rBucket',plat:'rPlat',prof:'rProf',daily:'rDaily'};
function renderGeral(){ renderGeralCore(GERAL_IDS); }
function renderGeralCore(ids){
  const fL=leadsActive(), fM=metaActive();
  const t=totals(fL,fM), dv=derive(t), g=dv.gasto;
  const leadsAds=fL.filter(l=>l.src==='meta'||l.src==='google');
  const nAds=leadsAds.length, mqlsAds=leadsAds.reduce((s,r)=>s+r.q,0);
  const nOrg=fL.filter(l=>l.src==='org').length;
  const semUtm=fL.filter(l=>!l.utm).length, comUtm=t.leads-semUtm;
  const NA='<span class="na-tag">sem dado</span>';
  const steps=[
    ['Gasto Total', brl(g), [], false, 'hl-gasto'],
    ['Impressões', intf(t.im), [['CPM',brl(dv.cpm)]]],
    ['Cliques', intf(t.cl), [['CTR',pct(dv.ctr)],['CPC',brl(dv.cpc)]]],
    ['Leads', intf(t.leads), [['CPL',brl(dv.cpl)],['ConvForm',pct(dv.convf)]]],
    ['MQLs (≥30k)', intf(t.mqls), [['Tx‑MQL',pct(dv.tx)],['CPMQL',brl(dv.cpmql)]], false, 'hl-mql'],
    ['Vendas', NA, [['CAC',NA]], true],
    ['Faturamento', NA, [['ROAS',NA],['Ticket',NA]], true],
  ];
  document.getElementById(ids.funnel).innerHTML=funnelHTML(steps);
  // ---- Mar05: métricas secundárias mais úteis (não repetem o funil) ----
  const dd=daily(fL,fM), nDays=dd.length||1;
  const adAgg=buildAgg(fL,fM,'ad');
  let topAd=null, bestAd=null, nAdsAtivos=0;
  Object.entries(adAgg).forEach(([ad,a])=>{
    if(a.sp>0) nAdsAtivos++;
    if(topAd==null||a.mqls>topAd.m) topAd={ad,m:a.mqls};
    if(a.mqls>0){ const cq=(a.sp*taxf())/a.mqls; if(bestAd==null||cq<bestAd.v) bestAd={ad,v:cq}; }
  });
  const nCampAtivas=Object.values(buildAgg(fL,fM,'camp')).filter(a=>a.sp>0).length;
  const concTop=(t.mqls&&topAd)?topAd.m/t.mqls:null;
  const adShort=s=>{ s=String(s||'—'); return s.length>22?s.slice(0,21)+'…':s; };
  const k2=[
    {label:'MQLs por dia (média)',val:numf(t.mqls/nDays),aux:numf(t.leads/nDays)+' leads/dia'},
    {label:'Melhor CPMQL (anúncio)',val:bestAd?brl(bestAd.v):'-',aux:bestAd?adShort(bestAd.ad):'—'},
    {label:'Top anúncio (MQLs)',val:topAd?intf(topAd.m):'-',aux:topAd?adShort(topAd.ad):'—'},
    {label:'Concentração top anúncio',val:pct(concTop),aux:'% dos MQLs no melhor anúncio'},
    {label:'Anúncios ativos',val:intf(nAdsAtivos),aux:intf(nCampAtivas)+' campanhas c/ gasto'},
    {label:'% Eficácia Rastr.',val:pct(t.leads?comUtm/t.leads:null),aux:'Leads c/ UTM / Leads'},
    {label:'Leads Orgânicos',val:intf(nOrg),aux:'sem fonte paga'},
    {label:'Proporção Org:Ads',val:nOrg?numf(nAds/nOrg)+':1':(nAds?'∞':'-'),aux:'Ads por orgânico'},
  ];
  document.getElementById(ids.kpis2).innerHTML=k2.map(kpiCard).join('');
  comboChart(ids.combo, daily(fL,fM));
  // por origem
  const srcName={meta:'Meta Ads',google:'Google Ads',org:'Orgânico',outros:'Outros'};
  const bySrc={}; fL.forEach(l=>{const k=srcName[l.src]||l.src; bySrc[k]=(bySrc[k]||0)+1;});
  hbar(ids.source, Object.entries(bySrc).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-leads'));
  // por faixa
  const byB={}; fL.forEach(l=>{byB[l.bucket]=byB[l.bucket]||{label:l.bucket,leads:0,q:l.q}; byB[l.bucket].leads++;});
  const order=['Menos de 5 mil','Entre 5 a 10 mil','Entre 10 a 20 mil','Entre 20 a 30 mil','Entre 30 a 50 mil','Entre 50 a 100 mil','Mais de 100 mil','Sem resposta'];
  const bArr=Object.values(byB).sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label));
  hbar(ids.bucket, bArr, x=>x.leads, x=>x.q?cvar('--bar-q'):cvar('--bar-noq'));
  // por plataforma
  const platName={ig:'Instagram',fb:'Facebook','—':'Orgânico/—'};
  const byP={}; fL.forEach(l=>{const k=platName[l.plat]||l.plat; byP[k]=(byP[k]||0)+1;});
  hbar(ids.plat, Object.entries(byP).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-leads'));
  // por profissao (top 10)
  const byPr={}; fL.forEach(l=>{byPr[l.prof]=(byPr[l.prof]||0)+1;});
  hbar(ids.prof, Object.entries(byPr).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-mqls'), 10);
  // tabela diaria (todos os leads), ultimo dia no topo + heatmap
  const dl=daily(fL,fM).slice().reverse();
  renderTable({id:ids.daily, cols:DAILY_COLS, center:true, fit:true,
    rows:dl.map(x=>{const d=derive(x); return {k:x.d, cells:dailyCells(x,d)};}),
    total:(()=>{const d=derive(t);return dailyCells({d:null,leads:t.leads,mqls:t.mqls},d,true);})(),
    selectable:true, selSet:STATE.selDays,
    onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); },
  });
}
/* ---------------- PAGE 3: Relatório ----------------
   Espelha a Visão Geral (renderGeralCore com IDs próprios) e, abaixo, acrescenta
   Top Anúncios · Piores Anúncios · Briefing do Gestor. */
const AD_LINKS = DATA.ad_links || {};
const SAMPLE_MIN_SPEND = (B.sample_min_spend!=null?B.sample_min_spend:100);
const SAMPLE_MIN_MQLS  = (B.sample_min_mqls!=null?B.sample_min_mqls:3);
const TOP_ADS_N        = (B.top_ads_n!=null?B.top_ads_n:10);
const escHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ---- Metas & parâmetros (painel editável) — ajusta cores/amostra AO VIVO ----
   Defaults vêm do build.py; o usuário edita no painel (persistido em
   localStorage 'dm_metas') e as tabelas de anúncio recoram CPMQL/CAC e reavaliam
   a amostra na hora. Meta null = "não definida" (métrica fica sem cor). */
const METAS_DEFAULT = {
  cpmql: (B.meta_cpmql!=null?B.meta_cpmql:null),
  cac:   (B.meta_cac!=null?B.meta_cac:null),
  volMin:(B.volume_min_amostral!=null?B.volume_min_amostral:SAMPLE_MIN_MQLS),
  nDias: (B.n_dias_corte!=null?B.n_dias_corte:5),
};
function loadMetas(){
  let saved={}; try{ saved=JSON.parse(localStorage.getItem('dm_metas')||'{}'); }catch(e){}
  const m={...METAS_DEFAULT};
  ['cpmql','cac'].forEach(k=>{ if(saved[k]!=null&&isFinite(saved[k])) m[k]=saved[k]; else if(k in saved && saved[k]===null) m[k]=null; });
  if(saved.volMin!=null&&isFinite(saved.volMin)&&saved.volMin>=1) m.volMin=saved.volMin;
  if(saved.nDias!=null&&isFinite(saved.nDias)&&saved.nDias>=1) m.nDias=saved.nDias;
  return m;
}
const METAS = loadMetas();
function saveMetas(){ try{ localStorage.setItem('dm_metas', JSON.stringify(METAS)); }catch(e){} }
/* código de cor de um CUSTO vs meta (menor=melhor): verde ≤ meta; amarelo até
   meta×1,3 (atenção); vermelho acima (teto). Meta não definida => sem cor. */
function metaColorClass(v, meta){
  if(meta==null||v==null||!isFinite(v)||!isFinite(meta)||meta<=0) return '';
  if(v<=meta) return 'mc-green';
  if(v<=meta*1.3) return 'mc-yellow';
  return 'mc-red';
}

function adLinkCell(name){ const u=AD_LINKS[name];
  return u?`<a class="rel-adlink" href="${escHtml(u)}" target="_blank" rel="noopener">Abrir ▸</a>`:'<span class="rel-adlink off">—</span>'; }

/* ad -> (campanha, conjunto) dominantes por gasto no Meta (fallback: lead).
   Um anúncio pode rodar em mais de uma campanha/conjunto; fica com a combinação
   de maior gasto. */
function adStructMap(fM,fL){
  const acc={};
  fM.forEach(r=>{ const byCamp=acc[r.ad]=acc[r.ad]||{};
    const byAdset=byCamp[r.camp]=byCamp[r.camp]||{};
    byAdset[r.adset]=(byAdset[r.adset]||0)+r.sp; });
  const out={};
  Object.entries(acc).forEach(([ad,byCamp])=>{
    let best=null;
    Object.entries(byCamp).forEach(([camp,byAdset])=>{
      Object.entries(byAdset).forEach(([adset,sp])=>{
        if(!best||sp>best.sp) best={camp,adset,sp};
      });
    });
    out[ad]={camp:best.camp,adset:best.adset};
  });
  fL.forEach(r=>{ if(!out[r.ad]) out[r.ad]={camp:r.camp,adset:r.adset}; });
  return out;
}
/* amostra relevante para JULGAR o anúncio (senão: "Em observação"). O limiar de
   MQLs vem do painel de metas (volume mínimo amostral), editável ao vivo. */
function adSampleOk(a){ return a.sp>=SAMPLE_MIN_SPEND && a.mqls>=METAS.volMin; }
/* qualidade pelo resultado MAIS PROFUNDO disponível (venda>presença>check-in>MQL>lead):
   tier alto = etapa mais profunda; dentro do tier, mais volume e menor custo = melhor. */
function adQuality(a){
  const d=derive(a), s=salesOf(a);
  if(s.vendas!=null)    return {tier:4, vol:s.vendas,    cost:s.cac==null?Infinity:s.cac};
  if(s.presencas!=null) return {tier:3, vol:s.presencas, cost:s.cpp==null?Infinity:s.cpp};
  if(s.checkins!=null)  return {tier:2, vol:s.checkins,  cost:s.cpcin==null?Infinity:s.cpcin};
  if(a.mqls>0)          return {tier:1, vol:a.mqls,      cost:d.cpmql==null?Infinity:d.cpmql};
  return                       {tier:0, vol:a.leads,     cost:d.cpl==null?Infinity:d.cpl};
}
function cmpBest(a,b){ const qa=adQuality(a), qb=adQuality(b);   // <0 => a antes (melhor)
  if(qa.tier!==qb.tier) return qb.tier-qa.tier;
  if(qa.vol!==qb.vol)   return qb.vol-qa.vol;
  return qa.cost-qb.cost; }

/* 22 colunas pedidas pelo cliente + coluna própria de Status (amostra).
   Anúncio/Status ficam FIXOS à esquerda e Link FIXO à direita (position:sticky
   em .rel-adt), então dão pra ver sem rolar lateralmente — só as métricas do
   meio rolam. Larguras em px casam com o CSS (.rel-adt .stk-*). */
const AD_COLS=[
  {k:'ad',label:'Anúncio',dim:true,stk:'l1'},{k:'status',label:'Status',dim:true,stk:'l2'},
  {k:'camp',label:'Campanha',dim:true},{k:'adset',label:'Conjunto',dim:true},
  {k:'gasto',label:'Gasto'},{k:'im',label:'Impr.'},{k:'cpm',label:'CPM'},{k:'ctr',label:'CTR'},
  {k:'leads',label:'Leads'},{k:'cpl',label:'CPL'},{k:'mqls',label:'MQLs'},{k:'tx',label:'Tx‑MQL'},{k:'cpmql',label:'CPMQL'},
  {k:'checkins',label:'Check‑ins'},{k:'txcheckin',label:'Tx‑Check‑in'},{k:'cpcin',label:'CPCIN'},
  {k:'presencas',label:'Presenças'},{k:'cpp',label:'CPP'},
  {k:'vendas',label:'Vendas'},{k:'cac',label:'CAC'},{k:'fat',label:'Faturamento'},{k:'roas',label:'ROAS'},
  {k:'link',label:'Link',dim:true,stk:'r'},
];
function adRowCells(ad,a,struct){
  const d=derive(a), s=salesOf(a);
  return {ad, camp:struct.camp, adset:struct.adset,
    gasto:brl(d.gasto), im:intf(a.im), cpm:brl(d.cpm), ctr:pct(d.ctr),
    leads:intf(a.leads), cpl:brl(d.cpl), mqls:intf(a.mqls), tx:pct(d.tx), cpmql:brl(d.cpmql),
    checkins:intf(s.checkins), txcheckin:pct(s.txcheckin), cpcin:brl(s.cpcin),
    presencas:intf(s.presencas), cpp:brl(s.cpp),
    vendas:intf(s.vendas), cac:brl(s.cac), fat:brl(s.fat), roas:numf(s.roas),
    link:adLinkCell(ad),
    _cpmql:d.cpmql, _cac:s.cac};   // valores crus p/ colorir vs meta
}
const statusChip=obs=>obs?'<span class="rel-chip c-yellow">Em observação</span>':'<span class="rel-chip c-green">Avaliável</span>';
/* tabela estática de 22+1 colunas (scroll lateral contido em .tbl-wrap;
   Anúncio/Status/Link ficam sticky, sempre visíveis) */
function relRenderAdTable(id,list){
  const el=document.getElementById(id); if(!el) return;
  const th='<thead><tr>'+AD_COLS.map(c=>`<th class="${c.dim?'dim':''}${c.stk?' stk-'+c.stk:''}">${c.label}</th>`).join('')+'</tr></thead>';
  const body=list.length?list.map(item=>{
    const cells=adRowCells(item.ad,item.a,item.struct);
    return '<tr>'+AD_COLS.map(c=>{
      const v=cells[c.k], cls=(c.dim?'dim':'')+(c.stk?' stk-'+c.stk:'');
      if(c.k==='ad')     return `<td class="${cls}" title="${escHtml(v)}"><b>${escHtml(v)}</b></td>`;
      if(c.k==='status') return `<td class="${cls}">${statusChip(item.obs)}</td>`;
      if(c.k==='camp'||c.k==='adset') return `<td class="${cls}" title="${escHtml(v)}">${escHtml(v)}</td>`;
      if(c.k==='link')   return `<td class="${cls}">${v}</td>`;
      if(c.k==='cpmql'){ const mc=metaColorClass(cells._cpmql,METAS.cpmql); return `<td class="${cls}${mc?' '+mc:''}">${v}</td>`; }
      if(c.k==='cac'){   const mc=metaColorClass(cells._cac,METAS.cac);     return `<td class="${cls}${mc?' '+mc:''}">${v}</td>`; }
      return `<td class="${cls}">${v}</td>`;
    }).join('')+'</tr>';
  }).join(''):`<tr><td class="dim" colspan="${AD_COLS.length}" style="color:var(--muted)">Sem anúncios com gasto no período.</td></tr>`;
  el.innerHTML=th+'<tbody>'+body+'</tbody>';
}

function relBriefKey(){ if(STATE.selDays.size) return null; return STATE.preset||null; }
function renderRelBrief(){
  const wrap=document.getElementById('relBrief'), stampEl=document.getElementById('relBriefStamp');
  const bf=DATA.briefings||{}, per=bf.periodos||{}, key=relBriefKey();
  stampEl.textContent = bf.generated_at ? `Insights gerados por IA · última atualização ${bf.generated_at} · atualiza 1×/dia (23h59 BRT)` : '';
  if(!Object.keys(per).length){
    wrap.innerHTML='<div class="rel-brief-empty">Os insights por IA ainda não foram gerados. São atualizados automaticamente 1×/dia.</div>'; return; }
  if(!key || !per[key]){
    wrap.innerHTML='<div class="rel-brief-empty">Insights disponíveis para os períodos predefinidos (Hoje, Ontem, 3, 7, 14, 30 dias, Este mês, Mês passado, Todo período). Selecione um desses no seletor de período.</div>'; return; }
  const item=per[key];
  wrap.innerHTML = item.html || item.texto || '<div class="rel-brief-empty">Sem conteúdo.</div>';
}

/* Top / Piores anúncios (separado p/ recolorir sem re-renderizar os gráficos
   quando o usuário edita as metas). Considera todos os leads + gasto do período. */
function renderRelAds(){
  const fL=leadsActive(), fM=metaActive();
  const struct=adStructMap(fM,fL);
  const agg=buildAgg(fL,fM,'ad');
  const pool=Object.entries(agg).filter(([ad,a])=>a.sp>0).map(([ad,a])=>({ad, a, struct:struct[ad]||{camp:'—',adset:'—'}}));

  // Top: amostra relevante primeiro, depois pela qualidade profunda; promissores sem amostra entram marcados
  const top=pool.slice().sort((x,y)=>{ const sx=adSampleOk(x.a), sy=adSampleOk(y.a);
    if(sx!==sy) return sx?-1:1; return cmpBest(x.a,y.a); })
    .slice(0,TOP_ADS_N).map(it=>({...it, obs:!adSampleOk(it.a)}));
  const topSet=new Set(top.map(it=>it.ad));

  // Piores: só com investimento relevante e fora do Top; pior qualidade primeiro;
  // sem amostra de MQL => "Em observação" (nunca "ruim")
  const worst=pool.filter(it=>it.a.sp>=SAMPLE_MIN_SPEND && !topSet.has(it.ad))
    .sort((x,y)=>cmpBest(y.a,x.a))
    .slice(0,TOP_ADS_N).map(it=>({...it, obs:!adSampleOk(it.a)}));

  relRenderAdTable('relTop',top);
  relRenderAdTable('relWorst',worst);
  document.getElementById('relTopCount').textContent=top.length+' anúncios';
  document.getElementById('relWorstCount').textContent=worst.length+' anúncios';
}

/* nota de referência do painel de metas (mostra as metas ativas + legenda de cor) */
function renderMetasNote(){
  const el=document.getElementById('relMetasNote'); if(!el) return;
  const cpmql=METAS.cpmql==null?'<b>não definida</b>':('<b>'+brl(METAS.cpmql)+'</b>');
  const cac=METAS.cac==null?'<b>não definida</b>':('<b>'+brl(METAS.cac)+'</b>');
  const semMeta=(METAS.cpmql==null||METAS.cac==null);
  el.innerHTML=`Referência ativa — Meta CPMQL: ${cpmql} · Meta CAC: ${cac} · Amostra mínima: <b>${intf(METAS.volMin)} MQLs</b> · Corte após <b>${intf(METAS.nDias)} dias</b> acima do teto. `
    +(semMeta?'Preencha as metas para colorir CPMQL/CAC nas tabelas de anúncio.':'')
    +' Código de cor (CPMQL/CAC): <span class="mc-lg mc-green">verde ≤ meta</span> <span class="mc-lg mc-yellow">amarelo até +30%</span> <span class="mc-lg mc-red">vermelho acima</span>.';
}
function syncMetasInputs(){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=(v==null?'':v); };
  set('metaCpmql',METAS.cpmql); set('metaCac',METAS.cac); set('metaVolMin',METAS.volMin); set('metaNdias',METAS.nDias);
  renderMetasNote();
}

function renderRelatorio(){
  renderGeralCore(REL_IDS);   // espelho da Visão Geral (funil, KPIs, gráficos, tabela diária)

  // cabeçalho do período
  const pr=PRESETS.find(p=>p[0]===STATE.preset);
  document.getElementById('relPeriodName').textContent = STATE.selDays.size?'Dias selecionados':(pr?pr[1]:'Personalizado');
  let rangeTxt='';
  if(STATE.from&&STATE.to){ const nD=Math.round((new Date(STATE.to+'T00:00:00')-new Date(STATE.from+'T00:00:00'))/86400000)+1;
    rangeTxt=`${brdate(STATE.from)} a ${brdate(STATE.to)}`+(nD>0?` · ${nD} dia${nD>1?'s':''}`:''); }
  document.getElementById('relPeriodRange').textContent=rangeTxt;

  renderMetasNote();
  renderRelAds();
  renderRelBrief();
}

/* colunas padrão das tabelas de heatmap por dia (ordem pedida) */
const DAILY_COLS=[
  {key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:70},
  {key:'gasto',label:'Gasto',type:'brl',heat:'gasto'},{key:'cpm',label:'CPM',type:'brl'},
  {key:'ctr',label:'CTR',type:'pct'},{key:'convf',label:'ConvForm',type:'pct'},
  {key:'leads',label:'Leads',type:'int',heat:'leads'},{key:'cpl',label:'CPL',type:'brl'},
  {key:'tx',label:'Tx‑MQL',type:'pct'},{key:'mqls',label:'MQLs',type:'int',heat:'mqls'},{key:'cpmql',label:'CPMQL',type:'brl'},
  // Mar01: métricas de venda (aguardando aba de compradores -> "-")
  {key:'vendas',label:'Vendas',type:'int'},{key:'cac',label:'CAC',type:'brl'},
  {key:'fat',label:'Fat.',type:'brl'},{key:'tm',label:'TM',type:'brl'},{key:'roas',label:'ROAS',type:'num'},
];
function dailyCells(x,d,isTotal){
  const s=salesOf(x);
  return {date:isTotal?null:x.d, wd:isTotal?'':weekday(x.d), gasto:d.gasto, cpm:d.cpm, ctr:d.ctr, convf:d.convf,
    leads:x.leads, cpl:d.cpl, tx:d.tx, mqls:x.mqls, cpmql:d.cpmql,
    vendas:s.vendas, cac:s.cac, fat:s.fat, tm:s.tm, roas:s.roas};
}

/* ---------------- PAGE 2: Captura Meta Ads ---------------- */
/* Mar04: considera TODOS os leads e TODO o gasto de todas as fontes de tráfego
   (sem filtrar por atribuição). Hoje só há Meta; quando vier google/tiktok/orgânico
   etc., já entram automaticamente. */
function metaScope(ex){ let fL=leadsActive(), fM=metaActive();
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
    ['Gasto Total', brl(g), [], false, 'hl-gasto'],
    ['Impressões', intf(t.im), [['CPM',brl(dv.cpm)],['Frequência',NA]]],
    ['Cliques', intf(t.cl), [['CTR',pct(dv.ctr)],['CPC',brl(dv.cpc)]]],
    ['Page Views', NA, [['CR',NA],['CPV',NA]], true],
    ['Leads', intf(t.leads), [['CPL',brl(dv.cpl)],['ConvForm',pct(dv.convf)]]],
    ['MQLs (≥30k)', intf(t.mqls), [['Tx‑MQL',pct(dv.tx)],['CPMQL',brl(dv.cpmql)]], false, 'hl-mql'],
    ['Vendas', NA, [['ConvMQL',NA],['CAC',NA]], true],
    ['Faturamento', NA, [['ROAS',NA],['Ticket',NA]], true],
  ];
  document.getElementById('metaFunnel').innerHTML=funnelHTML(steps);

  comboChart('mCombo', daily(fL,fM));
  // Mar02: barras de MQLs por anúncio (não leads)
  const mqlByAd={}; fL.forEach(l=>{ mqlByAd[l.ad]=(mqlByAd[l.ad]||0)+l.q; });
  hbar('mMqlAd', Object.entries(mqlByAd).map(([label,leads])=>({label,leads})), x=>x.leads, ()=>cvar('--chart-mqls'), 10, 'MQLs');
  // Mar02: donut de taxa de qualificação (verde = MQL, vermelho = desqualificado)
  donutQlf('mQlfDonut', t.mqls, t.leads);
  // Mar02: Top anúncios por CAC (CAC "-" até conectar compradores; ordena por CPMQL como proxy)
  const adAggM=buildAgg(fL,fM,'ad');
  const topCacRows=Object.entries(adAggM).map(([ad,a])=>{const d=derive(a),s=salesOf(a);
    return {k:ad, cells:{dim:ad,mqls:a.mqls,cpmql:d.cpmql,cac:s.cac,vendas:s.vendas},
      _ord:(s.cac!=null?s.cac:(d.cpmql!=null?d.cpmql:Infinity))};})
    .sort((a,b)=>a._ord-b._ord).slice(0,10);
  renderTable({id:'mTopCac', center:true, fit:true,
    cols:[{key:'dim',label:'Anúncio',type:'dim',big:true},{key:'mqls',label:'MQLs',type:'int'},
      {key:'cpmql',label:'CPMQL',type:'brl'},{key:'cac',label:'CAC',type:'brl'}],
    rows:topCacRows});

  const dl=daily(fL,fM).slice().reverse();
  renderTable({id:'tDaily', cols:DAILY_COLS, center:true, fit:true,
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
    // Mar03: métricas de venda (aguardando aba de compradores -> "-")
    {key:'convmql',label:'ConvMQL',type:'pct'},{key:'vendas',label:'Vendas',type:'int'},{key:'cac',label:'CAC',type:'brl'},
    {key:'fat',label:'Fat.',type:'brl'},{key:'tm',label:'TM',type:'brl'},{key:'roas',label:'ROAS',type:'num'},
  ];
  function hierRows(map){ return Object.entries(map).map(([k,a])=>{const d=derive(a),s=salesOf(a);
    return {k, cells:{dim:k,gasto:d.gasto,cpm:d.cpm,ctr:d.ctr,convf:d.convf,leads:a.leads,cpl:d.cpl,tx:d.tx,mqls:a.mqls,cpmql:d.cpmql,
      convmql:s.convmql,vendas:s.vendas,cac:s.cac,fat:s.fat,tm:s.tm,roas:s.roas}};}); }
  function totRowOf(tt){const d=derive(tt),s=salesOf(tt);return{dim:null,gasto:d.gasto,cpm:d.cpm,ctr:d.ctr,convf:d.convf,leads:tt.leads,cpl:d.cpl,tx:d.tx,mqls:tt.mqls,cpmql:d.cpmql,
    convmql:s.convmql,vendas:s.vendas,cac:s.cac,fat:s.fat,tm:s.tm,roas:s.roas};}
  const Sc=metaScope('C'), Sa=metaScope('A'), Sd=metaScope('D');
  // Tabelas hierárquicas: NÃO usam "fit" — a dimensão (campanha/conjunto/anúncio)
  // tem largura automática p/ caber o nome INTEIRO por padrão, nunca quebra linha,
  // é redimensionável (arrastar borda) e 2 cliques na borda auto-ajusta (Sheets/Looker).
  renderTable({id:'tCamp', cols:hcols.map((c,i)=>i===0?{...c,label:'Campanha'}:c), rows:hierRows(buildAgg(Sc.fL,Sc.fM,'camp')), total:totRowOf(totals(Sc.fL,Sc.fM)),
    selectable:true, selSet:STATE.mSelC, onSelect:(k,e)=>selDim('C',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'tAdset', cols:hcols.map((c,i)=>i===0?{...c,label:'Conjunto',big:true}:c), rows:hierRows(buildAgg(Sa.fL,Sa.fM,'adset')), total:totRowOf(totals(Sa.fL,Sa.fM)),
    selectable:true, selSet:STATE.mSelA, onSelect:(k,e)=>selDim('A',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'tAd', cols:hcols.map((c,i)=>i===0?{...c,label:'Anúncio'}:c), rows:hierRows(buildAgg(Sd.fL,Sd.fM,'ad')), total:totRowOf(totals(Sd.fL,Sd.fM)),
    selectable:true, selSet:STATE.mSelAd, onSelect:(k,e)=>selDim('D',k,e&&(e.ctrlKey||e.metaKey))});

  // Mar03: cada gráfico varia a dimensão da sua tabela — MQLs por dia, 1 linha por membro
  mqlByDimChart('chCamp', Sc.fL, 'camp');
  mqlByDimChart('chAdset', Sa.fL, 'adset');
  mqlByDimChart('chAd', Sd.fL, 'ad');

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
  document.getElementById('page-rel').classList.toggle('active',p==='rel');
  document.getElementById('ptitle').textContent = p==='meta'?'Captura Meta Ads':(p==='rel'?'Relatório':'Visão Geral de Leads');
  document.getElementById('navToggle').checked=false;
  history.replaceState(null,'', p==='meta'?'#meta':(p==='rel'?'#rel':'#geral'));
  renderAll();
}
function renderAll(){ if(STATE.page==='meta') renderMeta(); else if(STATE.page==='rel') renderRelatorio(); else renderGeral(); }

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

/* painel de Metas & parâmetros — edita ao vivo, salva em localStorage e recolore
   as tabelas de anúncio (sem re-renderizar os gráficos) */
(function wireMetas(){
  const num=el=>{ const s=(el&&el.value||'').trim(); if(s==='') return null; const n=parseFloat(s.replace(',','.')); return isFinite(n)?n:null; };
  const onEdit=()=>{
    METAS.cpmql=num(document.getElementById('metaCpmql'));
    METAS.cac=num(document.getElementById('metaCac'));
    const vm=num(document.getElementById('metaVolMin')); METAS.volMin=(vm!=null&&vm>=1)?Math.round(vm):METAS_DEFAULT.volMin;
    const nd=num(document.getElementById('metaNdias')); METAS.nDias=(nd!=null&&nd>=1)?Math.round(nd):METAS_DEFAULT.nDias;
    saveMetas(); renderMetasNote();
    if(STATE.page==='rel') renderRelAds();   // só as tabelas, sem mexer nos gráficos
  };
  ['metaCpmql','metaCac','metaVolMin','metaNdias'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',onEdit); });
  const rb=document.getElementById('relMetasReset');
  if(rb) rb.addEventListener('click',()=>{ METAS.cpmql=METAS_DEFAULT.cpmql; METAS.cac=METAS_DEFAULT.cac; METAS.volMin=METAS_DEFAULT.volMin; METAS.nDias=METAS_DEFAULT.nDias;
    try{ localStorage.removeItem('dm_metas'); }catch(e){} syncMetasInputs(); if(STATE.page==='rel') renderRelAds(); });
  syncMetasInputs();
})();

document.getElementById('updated').innerHTML='Última atualização:<br>'+B.generated_at_brt+' (BRT)';
document.getElementById('buildFoot').textContent='build __BUILD_ID__';
document.getElementById('buildFoot2').textContent='· build __BUILD_ID__';

syncDateInputs();
setPage(location.hash==='#meta'?'meta':(location.hash==='#rel'?'rel':'geral'));

/* auto-refresh com cache-bust ~30 min */
setTimeout(()=>{ location.href=location.pathname+'?t='+Date.now()+location.hash; }, 30*60*1000);
