# GUIA — Briefing do Gestor da aba Relatório (funil de evento presencial High Ticket)

> Lido pela rotina/IA que redige `build/relatorios.json`. **Não usa a API paga da
> Anthropic no build nem no navegador** — a página só exibe o texto já pronto.
> Os números vêm dos mesmos dados do site (Meta Ads × Leads); a IA apenas
> **interpreta e redige**. A aba Relatório espelha a Visão Geral e, abaixo,
> mostra **Top Anúncios · Piores Anúncios · Ações Agendadas · Briefing do
> Gestor**. A mesma Routine também processa `build/acoes_agendadas.json`
> (lembretes escritos no site) — ver seção "Ações Agendadas" no fim deste
> guia.

## Automação em 2 etapas (já configurada)

1. **23:50 BRT** — workflow `.github/workflows/gerar-relatorios-metrics.yml`
   (GitHub Actions, `schedule` nativo + `workflow_dispatch`) roda
   `build/gerar_relatorios.py`, busca os CSVs ao vivo do Google Sheets e
   commita `build/relatorios_metrics.json` direto na `main` — **só números,
   sem IA**. Por período, já traz **pré-calculados**: `nota_saude` (0–10),
   `comparativo_periodo_anterior` (com o método correto por janela — ver §
   "Comparações" abaixo — e `variacao` métrica a métrica só com mudanças
   relevantes marcadas `material:true`), `criativos_consolidado` (mesmo
   anúncio em várias estruturas) e `whatsapp_numeros` (valores já formatados
   em R$/%). 100% independente de qualquer sessão de agente; roda sozinho
   para sempre.
2. **23:59 BRT** — **Routine do Claude Code** ("Briefing diário do Gestor
   (dash-marcelo)", trigger `trig_014edxZX63uCgtjvXvwJmrqF`) dispara uma
   sessão nova que faz `git pull`, lê `build/relatorios_metrics.json` +
   este guia, migra o texto de `hoje` para `ontem`, redige os 9 briefings do
   zero (no **formato de 4 quadrantes** — ver seção abaixo) e dá `git push`
   **direto na `main`** (sem PR — a sessão da Routine não tem acesso às
   tools de API do GitHub, só `git`/Bash puro). O deploy normal
   (`deploy.yml`) então publica o texto no site em ~30 min.

Rodar às 23:59 (não de manhã) garante que "hoje" seja analisado com o dia
quase completo — por isso a migração hoje→ontem no passo 4 do guia abaixo.
Para editar o agendamento/prompt da Routine, use `update_trigger`
(`trigger_id` acima) a partir de qualquer sessão do Claude Code deste
projeto; `list_triggers` lista o estado atual (habilitada, próximo horário
etc.).

> **Nota histórica:** este repositório teve, por um período, um segundo
> pipeline concorrente (`.github/workflows/rotina_briefings.yml` +
> `scripts/gerar_briefing_gemini.py`) escrevendo `build/relatorios.json` no
> mesmo horário via API paga do Gemini. Foi **removido** por decisão do
> cliente — a Routine do Claude Code acima é a única fonte de verdade dos
> Insights de Tráfego. Não recrie esse workflow sem confirmar com o usuário.

## Contexto do funil

Funil de aquisição para um **evento presencial gratuito** destinado a empresários
seletos. Captação por **Lead Ads** (formulário nativo da Meta), podendo futuramente
usar página de captura. Fluxo:

```
Impressões → Cliques/abertura do formulário → Leads → MQLs → Check-ins → Presenças → Vendas → Faturamento
```

- **MQL** = advogados, contadores, representantes comerciais **ou** quem fatura
  **> R$ 30 mil/mês** (coluna N da aba Leads; ver `build.py` → `is_qualified`).
- **Check-in** = vaga confirmada pelo comercial **antes** do evento.
- **Presença** = comparecimento efetivo, validado no local.

> **Estado atual dos dados:** hoje só há **Meta Ads × Leads**, então o funil vai
> até **MQL**. **Check-ins, Presenças, Vendas e Faturamento** (e as métricas
> derivadas: Tx-Check-in, CPCIN, Tx-Presença, CPP, Tx-Venda, CAC, ROAS, Ticket)
> aparecem como “-” até chegar a lista do comercial/evento. Quando os campos
> `checkins`/`presencas`/`vendas`/`fat` forem somados por linha em
> `buildAgg/daily/totals`, **toda a UI acende sozinha** (funil, tabelas, Top/Piores).

## Fórmulas fundamentais

- **Tx MQL** = MQLs ÷ Leads · **CPMQL** = Investimento ÷ MQLs
- **Tx Check-in** = Check-ins ÷ MQLs · **CPCIN** = Investimento ÷ Check-ins
- **Tx Presença** = Presenças ÷ Check-ins · **CPP** = Investimento ÷ Presenças
- **Tx Venda** = Vendas ÷ Presenças · **CAC** = Investimento ÷ Vendas
- **ROAS** = Faturamento ÷ Investimento · **Ticket** = Faturamento ÷ Vendas
- Conversões acumuladas úteis: Lead→Check-in, Lead→Presença, Lead→Venda,
  MQL→Presença, MQL→Venda, Check-in→Venda.

Regra de ouro: **acumulativas somam** (impressões, cliques, leads, MQLs, gasto);
**derivadas recalculam dos totais** (nunca some percentuais).

## Princípio de interpretação

Trate cada métrica como **diagnóstico probabilístico**, nunca regra absoluta.
Uma métrica ruim raramente identifica sozinha a causa. Leia **sempre** com a etapa
anterior e a posterior, o histórico, o **volume da amostra** e o **tempo de
maturação**. O objetivo não é o menor CPL nem o maior volume de leads — é gerar
**empresários qualificados que confirmem, compareçam e comprem**.

**CPMQL, CPCIN, CPP, CAC e ROAS são resultados acumulados (efeito), não causas.**
Ao ver um deles ruim, aponte a **etapa** que perdeu eficiência — não recomende
“reduzir o CAC/CPP/ROAS” de forma abstrata.

### Leitura por etapa (resumo)
- **CTR** (Cliques/Impressões): interesse do criativo. CTR baixo **pode ser bom**
  se qualifica melhor (CPMQL/CPP/CAC saudáveis). Só é problema junto de custo ruim.
- **CPL**: custo do cadastro. CPL alto pode ser saudável se gera mais MQL/presença.
  CPL baixo pode ser ruim se atrai gente fora do ICP.
- **Tx MQL / CPMQL**: mídia+criativo+form atraindo o perfil certo. Tx alta com
  pouco volume pode ser segmentação estreita ou critério permissivo — o MQL só
  vale se avançar para check-in, presença e venda.
- **Tx Check-in / CPCIN**: qualidade do MQL + atratividade do evento + eficiência
  do comercial (tempo até 1º contato, taxa de contato, tentativas, script).
- **Tx Presença / CPP**: compromisso após a confirmação (reconfirmação, lembretes,
  logística, valor percebido). **CPP é uma das principais métricas operacionais.**
- **Tx Venda / CAC / Ticket / ROAS**: qualidade real da sala + oferta + pitch +
  follow-up + maturação (venda high-ticket costuma fechar dias depois).

### Heurísticas obrigatórias
- CTR baixo + CPMQL/CPP/CAC saudáveis → o anúncio qualifica melhor (não mexer).
- CPL baixo + Tx MQL baixa → mídia atraindo fora do ICP.
- Tx MQL boa + Tx Check-in baixa → investigar **comercial**/disponibilidade/script,
  não o tráfego automaticamente.
- Tx Check-in boa + Tx Presença baixa → confirmação/lembretes/logística.
- Tx Presença boa + Tx Venda baixa → sala/conteúdo/pitch/oferta/follow-up
  (sala cheia ≠ sala qualificada).
- CPMQL bom + CPCIN ruim → perda entre qualificação e confirmação.
- CPCIN bom + CPP ruim → perda entre confirmação e comparecimento.
- CPP bom + CAC ruim → perda entre evento e venda.
- Evento recente + ROAS baixo → verificar **maturação** antes de julgar.
- Só uma campanha piorou → investigar a própria (segmentação/criativo), não geral.

## Top Anúncios e Piores Anúncios (o que a tabela já faz)

A aba calcula sozinha, por anúncio (com gasto no período):
- **Top**: ranqueado pelo **resultado mais profundo disponível** (Venda → Presença →
  Check-in → MQL), maior volume + menor custo, **amostra relevante primeiro**.
  Anúncio promissor **sem amostra suficiente** entra marcado **“Em observação”** —
  nunca é “vencedor” só por 1 resultado com pouco gasto.
- **Piores**: só anúncios com **investimento relevante** e resultado profundo
  fraco / custo pior que a média; **nunca** por CTR/CPM/CPL isolados. Sem amostra
  suficiente → **“Em observação”**, não “ruim”.
- Limiares em `build.py`: `SAMPLE_MIN_SPEND`, `SAMPLE_MIN_MQLS`, `TOP_ADS_N`.
- **Link** abre o criativo no Instagram (coluna *Creative Instagram Permalink* da
  aba Meta Ads → `ad_links`).

O briefing deve **explicar** o ranking (por quê), não repeti-lo.

## Nota de saúde do funil (0–10)

`relatorios_metrics.json` já traz `nota_saude` calculada por período (mesma
metodologia sempre — nunca recalcule esse número na redação, só reporte/
explique). Subnotas: **aquisição** (CPM/CTR vs. baseline de 30d),
**conversão da página** (hoje sempre `null` — sem fonte de Page Views),
**qualificação** (Tx‑MQL/CPMQL vs. meta ou baseline), **vendas** (`null` até
check-in/presença/venda terem dado real — ver "Estado atual dos dados"
acima), **consistência** (variação da Tx‑MQL entre janelas 7/14/30d) e
**confiabilidade dos dados** (volume de MQLs vs. volume mínimo amostral). A
nota geral é a média das subnotas disponíveis; quando alguma é `null`,
`provisoria=true` e `motivo` explica qual dado falta — **nunca trate a
subnota ausente como 0**. Classificação (`classificacao`): Excelente (≥8) ·
Saudável, com atenção (≥6,5) · Atenção (≥5) · Crítico (≥3) · Crítico grave
(<3). Redija 1–2 frases citando as subnotas mais baixas — não reinvente a
metodologia.

## Formato "Insights de Tráfego" — 4 quadrantes + bloco WhatsApp

> A seção da aba chama-se **Insights de Tráfego**. O tom é de **analista de
> performance**: cada quadrante fecha com decisão, não só leitura de número
> — escaneável, não narrativo. Português, profundo mas sem enrolação. Use
> os números JÁ CALCULADOS de `relatorios_metrics.json` (`total`,
> `comparativo_periodo_anterior.variacao`, `nota_saude`,
> `criativos_consolidado`, `whatsapp_numeros`) — não recalcule soma/média/
> variação/ranking, só interprete e redija.

Cada período em `relatorios.json` tem 6 campos: `nota_saude` (objeto,
copiado de `relatorios_metrics.json`), `whatsapp` (string pronta pra
copiar) e 4 quadrantes em HTML (`quadro1_resumo`, `quadro2_diagnostico`,
`quadro3_campeoes`, `quadro4_acoes`).

### Bloco WhatsApp (`whatsapp`, string com quebras de linha `\n`)

Monte a partir de `whatsapp_numeros` (já formatado em R$/%) — **copie os
valores literalmente**, nunca invente/recalcule:

```
📊 RESUMO DO PERÍODO
Período: {periodo_range}
Gasto: {gasto}
CPM: {cpm}
CTR: {ctr}
Connect Rate: {connect_rate}
Conversão da LP: {conv_lp}
Leads: {leads}
CPL: {cpl}
MQLs: {mqls}
CPA/CPMQL: {cpa_cpmql}
Vendas: {vendas}
Faturamento: {faturamento}
CAC: {cac}
ROAS: {roas}
Ticket médio: {ticket_medio}
Saúde do funil: {saude_funil}
Principais destaques:
• …
• …
Principais ações:
• …
• …
```

`CPA/CPMQL` é a nomenclatura oficial única (custo por MQL) — não crie um
"CPA" separado. Campos sem fonte conectada já chegam como **"Não
disponível"** — mantenha assim, nunca escreva "R$ 0". Em "Principais
destaques"/"Principais ações" escreva 2–3 itens curtos — é a única parte
deste bloco que você redige; o resto é template preenchido.

### Quadrante 1 — Resumo executivo e saúde do funil (`quadro1_resumo`)
Nota de saúde + status das metas + números do período + mudanças
**materiais** vs. período anterior (`comparativo_periodo_anterior.variacao`,
só `material:true` — diferencie `delta_pp`, em pontos percentuais para
CTR/Tx‑MQL/ConvForm, de `delta_pct`, variação relativa das demais) +
destaques/alertas + a decisão mais importante do período.

### Quadrante 2 — Diagnóstico do funil (`quadro2_diagnostico`)
Suficiência de amostra (MQLs do período vs. `sample_min_mqls`), melhoras/
pioras/estáveis (com explicação do porquê provável), gargalos + hipóteses
no formato do `GUIA-INTERPRETACAO`/heurísticas acima (o que mudou → quanto →
onde → hipótese → evidência a favor → evidência contra → ação → prazo de
reavaliação), e o **Gargalo de dado (prioridade alta)**: enquanto Check-in/
Presença/Venda/Faturamento não tiverem fonte conectada, este item aparece
sempre, separado dos gargalos de campanha.

### Quadrante 3 — Campanhas, estruturas e anúncios campeões (`quadro3_campeoes`)
Campanha campeã de **volume** e de **eficiência** (podem ser diferentes —
diga qual é qual). Estrutura completa campeã sempre pelos 3 níveis:
`Campanha: [nome completo] · Conjunto: [nome completo] · Anúncio: [nome
completo]` — nomes **nunca abreviados**. Ranking das estruturas
(`top_anuncios`/`piores_anuncios`, já ranqueados) por CPA/CPMQL com volume
ao lado. Para cada item de `criativos_consolidado` com `n_estruturas > 1`,
as duas análises: (a) consolidada — resultado total, quantas estruturas,
eficiência geral; (b) por ocorrência — `melhor_estrutura`/`pior_estrutura`
nomeadas, deixando explícito que a **decisão é por ocorrência** ("cortar
esta ocorrência nesta estrutura" ≠ "cortar o criativo"). Nunca recomende
corte global de um criativo vencedor por causa de 1 estrutura fraca.

### Quadrante 4 — Ações priorizadas (`quadro4_acoes`)
Listas separadas, cada uma um `<h4>`+`<ul>`: **Fazer hoje** · **Escalar** ·
**Manter** · **Observar** · **Otimizar/investigar** · **Cortar** ·
**Produzir/testar** · **Evitar** · **Próxima revisão**. Regras:
- Toda entrada de Escalar/Manter/Otimizar/Cortar cita **campanha e conjunto
  completos** e o **nível certo de orçamento** (ABO → ajuste no conjunto;
  CBO → ajuste na campanha). A fonte de dados atual **não informa o tipo de
  orçamento** por estrutura — nunca assuma ABO/CBO; escreva "ajustar o
  orçamento no nível do conjunto/campanha, conforme configuração real
  (confirmar no Gerenciador de Anúncios)" quando não for possível confirmar.
  No anúncio, as ações possíveis são ativar/pausar/duplicar/substituir/
  replicar — nunca "aumentar a verba do anúncio".
- **Fazer hoje**: só decisões com evidência suficiente para execução
  imediata. **Escalar**: percentual/valor do incremento (+10–20% a cada
  3–4 dias, alertando sobre resetar aprendizado em saltos maiores).
  **Observar**: diga o que falta (dias/gasto/leads/MQLs) para virar decisão.
  **Otimizar/investigar**: relacione o gargalo a uma verificação prática
  (criativo, público, formulário, comercial, oferta do evento, verba).
  **Cortar**: local exato + critério numérico ultrapassado — **nunca sem
  meta/teto definido**. **Produzir/testar**: anúncio de referência, o que
  variar, estrutura, orçamento do teste, critério de sucesso. **Evitar**:
  ações que parecem óbvias mas os dados não sustentam.
- **Próxima revisão**: gatilho (o que muda a classificação) + prazo/gasto.

Ao citar um anúncio, **sempre** diga campanha e conjunto — o mesmo nome de
anúncio pode rodar em estruturas diferentes com resultados diferentes.

### Leitura cruzada das 9 janelas
Não trate os 9 relatórios como leituras isoladas: hoje/ontem = anomalia; 3d
= direção recente; 7d = janela operacional principal; 14d/30d =
consistência/saturação; mês×mês passado = evolução mensal; máximo =
benchmark interno. Ao recomendar escala, confirme que a campanha também é
campeã em 14d/30d; ao recomendar corte, confirme que a queda persiste em
mais de uma janela. Se duas janelas indicarem decisões opostas, explique o
conflito e diga qual pesa mais para aquela decisão — nunca produza
recomendações contraditórias sem justificar.

### Metas & parâmetros (painel editável da aba)
O gestor preenche no topo da aba: **Meta CPMQL**, **Meta CAC**, **Volume mínimo
amostral (MQLs)** e **N dias p/ corte**. Defaults em `build.py` (`META_CPMQL`,
`META_CAC` = None → "não definida"; `VOLUME_MIN_AMOSTRAL`, `N_DIAS_CORTE`) e também
em `relatorios_metrics.json`. As tabelas de anúncio **recoram CPMQL/CAC** vs meta
(verde ≤ meta · amarelo até +30% · vermelho acima) e o badge **Em observação/
Avaliável** usa o volume mínimo — tudo ao vivo. O texto dos Insights **cita a meta
(ou "meta não definida")** e usa o volume mínimo/N dias configurados como critério
das classificações. Se `META_CPMQL`/`META_CAC` estiverem None, escreva comparando
contra as janelas 7/14/30 d e sinalize que a meta não foi definida.

## Comparações e segurança analítica

Cada uma das 9 janelas usa o período anterior CORRETO (já resolvido em
`comparativo_periodo_anterior`, campo `metodo` explica qual regra foi
usada): imediatamente anterior de mesma duração (hoje/ontem/3d/7d/14d/30d);
mesmo intervalo de dias do mês anterior (mês); mês retrasado completo (mês
passado); metade antiga vs. metade recente do histórico, só quando há ≥14
dias de dados (máximo — **nunca inventa** um período anterior inexistente;
com histórico curto, `total` vem `null` e o texto deve dizer que o
histórico serve só como benchmark). **Não invente** métricas/benchmarks;
**não** trate ausência de dado como zero; **não** compare janelas de
maturação diferentes; **não** penalize leads recentes ainda não
trabalhados; **não** recomende cortar/escalar com amostra insuficiente;
**não** culpe o tráfego por perda que acontece depois do MQL, nem o
comercial se o MQL estiver ruim.

## Lead Ads × Página de captura (para o futuro)

Se entrar página de captura, inclua **Connect Rate** (visitas ÷ cliques) e
**Conversão da página** (leads ÷ visitas), e compare os métodos por CPMQL, CPCIN,
CPP, CAC, volume de presenças, faturamento e ROAS — **nunca só por CPL/Tx MQL**.

## Formato de `build/relatorios.json`

```json
{
  "generated_at": "DD/MM/AAAA HH:MM",
  "fonte": "Insights de Tráfego redigidos pelo Claude (Routine diária, 23h59 BRT) a partir dos números agregados em relatorios_metrics.json (Meta Ads × Leads).",
  "periodos": {
    "hoje": {
      "nota_saude": {"nota": 7.4, "provisoria": true, "classificacao": "Saudável, com atenção",
                      "motivo": "Nota provisória: sem dados suficientes para conversao_pagina, vendas.",
                      "subnotas": {"aquisicao": 7.8, "conversao_pagina": null, "qualificacao": 8.1,
                                    "vendas": null, "consistencia": 6.9, "confiabilidade_dados": 10.0}},
      "whatsapp": "📊 RESUMO DO PERÍODO\nPeríodo: 08/07/2026 a 08/08/2026\nGasto: R$ 2.400,00\n…",
      "quadro1_resumo": "<p>…</p>",
      "quadro2_diagnostico": "<p>…</p><ul>…</ul>",
      "quadro3_campeoes": "<p>Campanha: …</p>",
      "quadro4_acoes": "<h4>Fazer hoje</h4><ul>…</ul><h4>Escalar</h4>…"
    },
    "ontem": "…", "3d": "…", "7d": "…", "14d": "…", "30d": "…",
    "mes": "…", "mespass": "…", "todo": "…"
  }
}
```

- **Chaves de período fixas** (mesmos ids do seletor da topbar). O briefing só
  aparece nos períodos predefinidos; em intervalo personalizado ou dias
  selecionados a aba mostra uma mensagem orientando a escolher um preset.
- HTML permitido nos quadrantes: `<p> <ul> <li> <b> <h4>` e
  `<span class="tag escala|otimiza|corte|observar">Escalar|Otimizar|Cortar|Observar</span>`
  (a classe de "Otimizar" é `otimiza`, não `otimizar`).
- **Variação numérica em cor (Quadrantes 1 e 2 sobretudo):** todo número que expressa uma
  mudança material vs. período anterior (`comparativo_periodo_anterior.variacao`, só
  `material:true`) — "melhorou X%", "CPMQL caiu Y%", "Tx‑MQL subiu Z p.p." — vai dentro de
  `<span class="delta-up">…</span>` (verde, negrito) se a mudança foi **boa** para o negócio,
  `<span class="delta-down">…</span>` (vermelho, negrito) se foi **ruim**, ou
  `<span class="delta-mid">…</span>` (laranja, negrito) para mudança pequena/mista/ambígua.
  **O sinal aritmético não decide a cor** — o que decide é se a métrica melhorou ou piorou:
  gasto/CPL/CPMQL/CAC **caindo** = `delta-up` (bom), **subindo** = `delta-down` (ruim); já
  Leads/MQLs/Tx‑MQL/Vendas/ROAS **subindo** = `delta-up`, **caindo** = `delta-down`. Envolva só
  o trecho do número/percentual (ex.: `CPMQL <span class="delta-up">caiu 12%</span>`), nunca a
  frase inteira. Não use essas classes em números sem comparação (ex.: total absoluto do
  período) nem em variações `material:false`.
- Se um período não tiver dados, `nota_saude` vem com `nota:null`,
  `whatsapp` usa "Não disponível" nos campos numéricos, e os quadrantes
  trazem um texto curto dizendo que não houve investimento/atividade.
- **Compatibilidade:** o site (`build/app.js` → `renderRelBrief`) ainda
  reconhece o formato antigo (`{"html": "…"}` por período) como fallback,
  usado só enquanto o `relatorios.json` commitado não tiver passado pela
  primeira execução no novo formato — não é um formato válido para novas
  gerações. Se o arquivo não existir, a aba mostra tudo menos o
  briefing (cards/tabelas seguem funcionando).

## Ações Agendadas (`build/acoes_agendadas.json`) — processar TODA execução

Lembretes que o Marcelo escreve direto no dashboard (ícone ⏱ nas tabelas
Campanha/Conjunto/Anúncio e Top Anúncios), ex.: *"Se não gerar MQL até
amanhã, cortar"* ou *"Conferir CAC em 5 dias, se continuar baixo, aumenta
pra R$ 100/dia"*. O clique grava direto em `build/acoes_agendadas.json`
(commit via GitHub Contents API, PAT embutido no site — não depende desta
Routine). **Esta Routine é quem interpreta o texto livre e calcula a
data-alvo** — sem isso o lembrete nunca sai de "pendente".

Schema:
```json
{
  "pendentes": [
    {"id":"a1b2c3", "texto":"Conferir CAC em 5 dias, se continuar baixo, aumenta pra R$ 100/dia",
     "nivel":"anuncio", "nome":"AD015_VIDEO_BTBExp-CAP",
     "campanha":"BTBExp | E2-CAP | P2-FRIO | LEAD | ABO | 2026-07-25 | Teste de Ads",
     "conjunto":"AUTO | Advantage | AD15", "criado_em":"2026-08-12T14:32:00-03:00"}
  ],
  "agendadas": [
    {"id":"a1b2c3", "texto":"...", "nivel":"anuncio", "nome":"AD015_VIDEO_BTBExp-CAP",
     "campanha":"...", "conjunto":"...", "criado_em":"...",
     "data_alvo":"2026-08-17", "acao_resumo":"Conferir CAC, escalar se baixo",
     "status":"agendado", "concluido_em":null}
  ]
}
```
`nivel` é `"campanha"`, `"conjunto"` ou `"anuncio"` — a estrutura exata onde o
ícone foi clicado (o site já resolve `campanha`/`conjunto` automaticamente
pela combinação de maior gasto, então normalmente já vêm preenchidos).

**A cada execução desta Routine, além de reescrever os 9 Insights:**
1. Leia `build/acoes_agendadas.json`. Se não existir ou estiver vazio, pule
   este passo (não é erro).
2. Para cada item em `pendentes`: interprete o texto livre usando
   `criado_em` como data-âncora — "amanhã" = `criado_em + 1 dia`, "em N
   dias"/"daqui a N dias" = `criado_em + N dias`, "hoje" = `criado_em`, uma
   data explícita (DD/MM ou DD/MM/AAAA) usa a data literal. Sem prazo
   explícito no texto, use `criado_em + 3 dias` como padrão razoável e diga
   isso em `acao_resumo`. Gere `acao_resumo` (máx. ~6 palavras, ex.:
   "Conferir CAC, escalar se baixo" ou "Cortar se sem MQL"). Mova o item de
   `pendentes` para `agendadas` com `status:"agendado"` (ou `"atrasado"` se
   `data_alvo` já é anterior a hoje) e `concluido_em:null`.
3. Para cada item já em `agendadas` com `status` diferente de `"feito"`:
   reavalie `status` — `"atrasado"` se `data_alvo < hoje`, senão
   `"agendado"`. **Nunca** altere itens com `status:"feito"` (é o usuário
   quem marca, clicando "Feito 👍🏻" no site — não a Routine).
4. Escreva `build/acoes_agendadas.json` de volta (mesmo schema, `pendentes`
   deve ficar vazio de itens já processados) e inclua no mesmo commit/push
   que já publica `relatorios.json` (`git add build/relatorios.json
   build/acoes_agendadas.json`).

Nunca invente uma ação agendada que o usuário não escreveu, e nunca decida
sozinha "cortar"/"escalar" uma campanha com base num lembrete — a Routine só
organiza o lembrete e calcula a data; a decisão de agir continua manual (o
usuário vê o badge "Atrasado" no site e decide).
