# CLAUDE.md — Contexto do projeto (dash-marcelo)

> Este arquivo é lido automaticamente pelo Claude Code ao abrir o repositório.
> Ele carrega TODO o contexto necessário para continuar o trabalho sem depender
> de mensagens anteriores. Mantenha-o atualizado.

## O que é

Dashboard de **Captura de Leads (BTBExp)** — um app de BI estático (HTML/CSS/JS
puro + Chart.js via CDN) publicado no **GitHub Pages**, que cruza a lista de
**Leads** com o gerenciador **Meta Ads** e se atualiza sozinho a cada ~30 min
(build 100% na nuvem via GitHub Actions, disparado externamente pelo cron-job.org).

- **URL pública:** https://metrics-odr.github.io/dash-marcelo/
- **Somente leitura** das planilhas. Nunca escrever de volta.

## Fontes de dados (Google Sheets — "BTBExp | Planilha Central")

Spreadsheet ID: `1_lj4IlJyylkC1MyW12ujCR7lpg90VOqzIbxO1XSvxXQ` (público — leitura via export CSV).

| Aba | gid | Colunas usadas |
|-----|-----|----------------|
| **Leads** | `2135966057` | A id · B created_time · D ad_name · F adset_name · H campaign_name · K is_organic · L platform(ig/fb) · M profissão · **N faturamento** · O full_name · P email · Q phone |
| **Meta Ads** | `1245628405` | A Day · B Campaign Name · C Ad Set Name · D Ad Name · E Amount Spent · F Impressions · G Link Clicks · H Leads |

URL de export CSV: `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>`

### Regra de Lead Qualificado (MQL)
Faturamento médio mensal **≥ 30 mil** (coluna **N** da aba Leads). Faixas que
qualificam: `entre_30_e_50_mil`, `entre_50_e_100_mil`, `mais_de_100_mil`.
`entre_20_e_30_mil` **não** qualifica. (Lógica em `build.py` → `is_qualified`.)

### Imposto Meta Ads
Toggle ON aplica **×1,13806** (+13,806%) sobre custos do Meta (Gasto, CPL, CPC,
CPM, CPMQL, CAC…). Constante `TAX_FACTOR` em `build.py` e `TAX` no template.

### Convenções de campanha (do cliente)
- `E2-CAP` = campanhas de Captura (esta dashboard). `E6-VEN` = Vendas.
- Field mapping Meta: Campaign Name = utm_campaign · Ad Set Name = utm_medium · Ad Name = utm_content.

## Arquitetura / arquivos

```
build/build.py            # lê os 2 CSVs (read-only), emite REGISTROS BRUTOS (leads[]/meta[]/ad_links); render() COSTURA os 4 arquivos abaixo
build/template.html       # esqueleto HTML. Placeholders __STYLES__, __APP_JS__, __DATA_JSON__, __BUILD_ID__, __GENERATED_BRT__
build/identidade-visual.css  # TODAS as cores (tema claro=padrão / escuro). Mexa AQUI p/ trocar só cor
build/estilos.css         # layout/componentes (sidebar, topbar, period-picker, funil, tabelas, gráficos, aba Relatório)
build/app.js              # lógica + renderização (KPIs, funil, tabelas, filtro cruzado, period-picker, heatmap, Relatório)
build/relatorios.json     # briefings do Gestor por período (aba Relatório) — VERSIONADO; lido no build, sem API
build/GUIA-RELATORIOS.md  # guia de métricas do funil + como redigir os briefings da aba Relatório
.github/workflows/deploy.yml  # roda build.py e publica no Pages (workflow_dispatch + schedule + push)
dist/index.html           # saída gerada (gitignored; o Actions reconstrói)
GUIA-REPLICACAO.md        # como replicar este modelo para outros relatórios
SETUP-CRON.md             # valores exatos do cron-job.org
```

### Aba Relatório (funil de evento presencial High Ticket)
Terceira página (sidebar, entre Meta Ads e o rodapé). **Espelha a Visão Geral**
(mesmo funil/KPIs/gráficos/tabela diária, via `renderGeralCore(REL_IDS)`) e, abaixo,
acrescenta 3 blocos novos:
- **Top Anúncios** e **Piores Anúncios** — 22 colunas (Anúncio · Campanha · Conjunto ·
  Gasto · Impr · CPM · CTR · Leads · CPL · MQLs · Tx‑MQL · CPMQL · Check‑ins · Tx‑Check‑in ·
  CPCIN · Presenças · CPP · Vendas · CAC · Faturamento · ROAS · **Link**). Ranking pelo
  **resultado mais profundo disponível** (Venda→Presença→Check‑in→MQL), amostra relevante
  primeiro; sem amostra → badge **“Em observação”** (nunca “vencedor”/“ruim” por 1 resultado
  ou por CTR/CPM/CPL isolados). Limiares em `build.py`: `SAMPLE_MIN_SPEND`, `SAMPLE_MIN_MQLS`,
  `TOP_ADS_N`. Scroll lateral **contido na tabela** (`.rel-adt` → `table-layout:auto`).
- **Briefing do Gestor** — texto interpretativo por período, **pré-gerado por IA** e lido de
  `build/relatorios.json` (sem chamada de API no build/navegador). Chaves de período fixas
  (`hoje/ontem/3d/7d/14d/30d/mes/mespass/todo`), tags `Escalar/Otimizar/Cortar/Observar`.
  Regras de escrita e interpretação do funil em `build/GUIA-RELATORIOS.md`. **Automação já
  ativa** (2 etapas diárias — ver seção "Automação em 2 etapas" no topo do guia): 23:50 BRT
  o workflow `gerar-relatorios-metrics.yml` busca as planilhas e commita
  `build/relatorios_metrics.json`; 23:59 BRT a **Routine do Claude Code** (`trig_014edxZX63uCgtjvXvwJmrqF`)
  redige os 9 briefings e dá push direto na `main`.

Funil completo do evento: `Impressões → Cliques → Leads → MQLs → Check-ins → Presenças →
Vendas → Faturamento`. Hoje só há Meta×Leads (vai até MQL); Check-ins/Presenças/Vendas/Fat
aparecem “-” até chegar a lista do comercial/evento — quando os campos `checkins`/`presencas`/
`vendas`/`fat` forem somados em `buildAgg/daily/totals`, `salesOf()` acende tudo sozinho.

### Link do criativo (aba Meta Ads)
`build.py` lê a coluna **Creative Instagram Permalink** da aba Meta Ads → mapa
`ad_links` (anúncio → 1 permalink). Usado no “Link” das tabelas Top/Piores (abre em
nova aba). Sem a coluna, o link vira “—”.

> **Layout modular (repaginação inspirada no dash da Larissa/Código da Rainha):** o front-end
> foi separado em `identidade-visual.css` + `estilos.css` + `app.js`, costurados por `render()`
> nos placeholders `__STYLES__`/`__APP_JS__`. Página 1 usa **funil vertical de leads** (Gasto →
> Impressões → Cliques → Leads → MQLs → Vendas/Faturamento "-") + KPIs secundários. Topbar tem
> **seletor de período em calendário** (period-picker) no lugar dos chips. **Heatmap** das tabelas
> diárias = cor FIXA por métrica (só opacidade varia): **Gasto=vermelho · Leads=azul · MQLs=verde**
> (`--heat-gasto/leads/mqls`), aplicado só nessas 3 colunas. A estrutura de dados e os nomes das
> métricas do Marcelo foram **preservados** — só o layout/visual mudou.

> **Ajustes de layout (rodada Mar01–05):**
> - Etapas **Gasto** (avermelhada) e **MQLs** (azulada) do funil ganham destaque de fundo + fonte
>   maior/negrito (`.step.hl-gasto`/`.hl-mql`, vars `--step-gasto/mql-bg/bd`).
> - Tabelas **diárias** (Geral+Meta): dados centralizados (`.dt-center`) e novas colunas
>   **Vendas · CAC · ROAS · TM**. Tabelas **hierárquicas**: + **ConvMQL · Vendas · CAC · Fat · TM · ROAS**.
> - **Camada de vendas** centralizada em `salesOf()` — hoje devolve `null` ("-"); quando a aba de
>   compradores chegar, some `vendas`/`fat` por linha e TODA a UI acende sozinha.
> - Página 2, seção "Anúncios" em **3 colunas** (`.trio`): MQLs por anúncio · **donut de Tx de
>   qualificação** (verde=MQL, vermelho=DSQ) · **Top anúncios por CAC**. Gráficos sob as tabelas
>   hierárquicas viram **MQLs por dimensão (campanha/conjunto/anúncio) por dia** (1 linha/membro,
>   tooltip com nome completo sem truncar via `wrapLabel`).
> - **Sem filtro de atribuição** (Mar04): `metaScope()` considera TODOS os leads/gastos de todas as
>   fontes (pronto p/ google/tiktok/orgânico); hoje só há Meta.
> - Distribuição de leads em **1 linha** (`.row4`); KPIs secundários trocados por métricas analíticas
>   (MQLs/dia, melhor CPMQL, top anúncio, concentração, ativos) em vez de repetir o funil.
> - **Tabelas diárias cabem 100% (sem scroll lateral)** via `cfg.fit`/`.dt-fit` (largura 100%, colunas
>   numéricas uniformes, dimensão quebra linha, R$ omitido nas células — cabeçalho já indica). Ficam
>   **dentro do `.panel`**, coladas ao gráfico (cada uma com ~metade da altura do painel, ao lado do
>   funil — `chart-box` 260px / `tbl-normal` 250px). Trio (`.trio`) com os 3 cards de **altura igual**
>   (`align-items:stretch` + conteúdo flex).

> **Ajustes de tabela (rodada pós-Mar05):**
> - Tabelas **hierárquicas** (Campanha/Conjunto/Anúncio) e **Leads Qualificados** voltam ao modo
>   **redimensionável** (não usam `.dt-fit`): a coluna de dimensão calcula a largura automática p/
>   caber o **nome inteiro por padrão** (`autoDimWidth()`, mede texto via canvas), **nunca quebra
>   linha** (só corta com "…" se encolhida manualmente), e pode ser **arrastada** ou **duplo-clique
>   na borda auto-ajusta** ao conteúdo (`autoColWidth()`) — como Google Sheets/Looker Studio. Isso
>   pode gerar scroll horizontal **contido dentro da própria tabela** quando há muitas colunas — é
>   esperado (equivalente ao comportamento dessas ferramentas), diferente de scroll na PÁGINA (nunca
>   aceitável).
> - Toda célula/cabeçalho ganhou **`title` (tooltip nativo)** com o valor completo — útil quando uma
>   tabela `.dt-fit` precisa abreviar para caber sem scroll.
> - **Bug corrigido:** grids com `1fr` puro (`.row4`, `.trio`, `.funnel-charts`, etc.) podiam "vazar"
>   e criar scroll horizontal na PÁGINA inteira quando um filho tinha conteúdo intrínseco largo (ex.:
>   rótulo comprido num gráfico de barras) — CSS Grid não limita um item a `1fr` por padrão
>   (`min-width:auto` do item vence). Fix: todos os grids fracionários usam `minmax(0,1fr)`, e
>   `.card`/`.chart-box` têm `min-width:0`. Sempre validar `document.documentElement.scrollWidth ===
>   clientWidth` (sem overflow) ao mexer em qualquer grid/card novo.

O `build.py` **não agrega**: exporta as linhas cruas e TODA a lógica (filtros de
data, filtro cruzado, KPIs, tabelas, gráficos, heatmap, imposto) roda no navegador.
Isso permite interatividade total sem servidor.

## Rodar/testar local

```bash
python build/build.py --leads-file leads.csv --meta-file meta.csv --out dist/index.html
# (o sandbox do agente NÃO alcança docs.google.com; use CSVs locais para testar.
#  O runner do GitHub Actions tem internet e busca os CSVs ao vivo.)
```
Para conferir o visual sem depender do CDN: baixe `chart.js@4.4.1` do npm, troque a
`<script src=...>` por um caminho local e rode um screenshot com o Chromium headless
em `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`.

## Especificação funcional (resumo das regras do cliente)

Três **páginas separadas** (sidebar, sem rolar entre elas):
1. **Visão Geral de Leads** — **funil vertical** (Gasto → Impressões → Cliques → Leads →
   MQLs → Vendas/Faturamento = "-", com CPM/CTR/CPC/CPL/ConvForm/Tx‑MQL/CPMQL inline) +
   **KPIs secundários** (Leads/MQLs Ads, Tx‑MQL Ads, Impressões, Cliques, CPM, Leads s/UTM,
   % Eficácia, Orgânicos, Org:Ads); gráfico combinado diário colado à **tabela diária com
   heatmap (todos os leads)**; barras por origem/faixa/plataforma/profissão.
2. **Captura Meta Ads** — funil em etapas; combinado diário; barras por utm_content;
   **tabela diária com heatmap (só Meta)**; **3 tabelas hierárquicas** Campanha →
   Conjunto → Anúncio, cada uma com **gráfico de linha colado embaixo**.
3. **Relatório** — espelha a Visão Geral e acrescenta **Top Anúncios · Piores Anúncios**
   (22 colunas com link do criativo) + **Briefing do Gestor** (texto por IA de
   `relatorios.json`). Ver seção "Aba Relatório" acima e `build/GUIA-RELATORIOS.md`.

**Ordem das colunas nas tabelas de heatmap/hierarquia:**
`Data · Dia · Gasto · CPM · CTR · ConvForm(=Leads/Cliques) · Leads · CPL · Tx‑MQL · MQLs · CPMQL`
(nas hierárquicas a 1ª coluna é a dimensão em vez de Data/Dia).

**Regras obrigatórias das tabelas** (ver `GUIA-REPLICACAO.md`): cabeçalho sticky;
ordenação tri‑state (asc→desc→reset); colunas redimensionáveis (persist localStorage);
linha "Total Geral" fixa; dimensão nunca truncada (400/250/600px, wrap, ≥11px);
seleção com toggle + **Ctrl multi (Set/OR)**; **filtro cruzado bidirecional** com
âncora Anúncio>Conjunto>Campanha, reconstruindo tudo da fonte filtrada; tabela diária
com **último dia no topo**. **Heatmap de cor fixa por métrica** (só a opacidade varia,
maior valor = mais vibrante), aplicado apenas em **Gasto (vermelho) · Leads (azul) ·
MQLs (verde)** — cores em `--heat-gasto/leads/mqls`. As demais colunas ficam sem heatmap.

## Lacunas de dados (aguardando o cliente)
- **Vendas, Faturamento, ROAS, CAC** → precisam da aba **Lista de Compradores** (gid a informar), com utm_source/produto.
- **Page Views, CR, CPV, ConvLP** → precisam de uma fonte de page views.
- **Página Google Ads** → não há dados de Google nas 2 abas atuais.
Enquanto não vierem, essas métricas aparecem como "-".

## Publicação — como resolver os problemas conhecidos

1. **Push:** a integração GitHub da sessão é somente‑leitura (git push e as MCP tools
   dão 403 "Resource not accessible by integration"). O caminho que funciona é `git push`
   direto para `github.com` usando o **PAT do usuário** (o proxy permite o túnel git bruto;
   a API REST do Actions/Pages é bloqueada). Nunca gravar o token no `.git/config`
   (usar URL efêmera `https://x-access-token:<TOKEN>@github.com/...`).
2. **cron-job.org só funciona na `main`:** `workflow_dispatch` só existe quando o
   workflow está na branch padrão. Levar `build/` + `.github/workflows/deploy.yml` para
   a `main` para ativar.
3. **Pages liga sozinho:** `actions/configure-pages@v5` com `enablement: true` habilita
   o Pages na 1ª execução (precisa `permissions: pages: write, id-token: write`).
4. **Proxy do sandbox:** o ambiente do agente NÃO alcança `docs.google.com`,
   `*.github.io` nem a API REST de Actions/Pages — mas o runner do GitHub Actions
   alcança tudo. Testar dados via CSV local; confiar no Actions para o resto.
5. **Token exposto:** se um PAT foi colado no chat, avisar para **revogar e gerar um novo**
   (fine‑grained, só Actions: read/write neste repo).

## Branch / git
- Desenvolver em `claude/leads-dashboard-github-pages-p78f56`; manter sincronizada com `main`.
- Commits com autor `Claude <noreply@anthropic.com>` (avisos "Unverified" do hook são só
  ausência de assinatura GPG — cosméticos, ignoráveis).
