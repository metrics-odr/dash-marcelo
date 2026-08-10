# GUIA — Briefing do Gestor da aba Relatório (funil de evento presencial High Ticket)

> Lido pela rotina/IA que redige `build/relatorios.json`. **Não usa a API paga da
> Anthropic no build nem no navegador** — a página só exibe o texto já pronto.
> Os números vêm dos mesmos dados do site (Meta Ads × Leads); a IA apenas
> **interpreta e redige**. A aba Relatório espelha a Visão Geral e, abaixo,
> mostra **Top Anúncios · Piores Anúncios · Briefing do Gestor**.

## Automação em 2 etapas (já configurada)

1. **23:50 BRT** — workflow `.github/workflows/gerar-relatorios-metrics.yml`
   (GitHub Actions, `schedule` nativo + `workflow_dispatch`) roda
   `build/gerar_relatorios.py`, busca os CSVs ao vivo do Google Sheets e
   commita `build/relatorios_metrics.json` direto na `main` — **só números,
   sem IA**. 100% independente de qualquer sessão de agente; roda sozinho
   para sempre.
2. **23:59 BRT** — **Routine do Claude Code** ("Briefing diário do Gestor
   (dash-marcelo)", trigger `trig_014edxZX63uCgtjvXvwJmrqF`) dispara uma
   sessão nova que faz `git pull`, lê `build/relatorios_metrics.json` +
   este guia, migra o texto de `hoje` para `ontem`, redige os 9 briefings do
   zero e dá `git push` **direto na `main`** (sem PR — a sessão da Routine
   não tem acesso às tools de API do GitHub, só `git`/Bash puro). O deploy
   normal (`deploy.yml`) then publica o texto no site em ~30 min.

Rodar às 23:59 (não de manhã) garante que "hoje" seja analisado com o dia
quase completo — por isso a migração hoje→ontem no passo 4 do guia abaixo.
Para editar o agendamento/prompt da Routine, use `update_trigger`
(`trigger_id` acima) a partir de qualquer sessão do Claude Code deste
projeto; `list_triggers` lista o estado atual (habilitada, próximo horário
etc.).

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

## Formato "Insights de Tráfego" (por período) — foco em AÇÃO

> A seção da aba chama-se **Insights de Tráfego**. O tom é de **analista de
> performance**: cada período fecha com decisão, não só leitura de número.
> Português, profundo mas sem enrolação. **Sempre** use exatamente estes 5–6
> blocos, nesta ordem (cada um é um `<h3>`):

1. **Resumo do período** — números brutos (gasto, leads, MQLs, Tx‑MQL, CPL, CPMQL)
   **+ comparação obrigatória contra as janelas de 7, 14 e 30 dias**. Toda métrica
   citada vem com referência: a **meta/teto** da conta **ou**, se não definida, a
   comparação com o próprio histórico + o aviso **"meta não definida"** (nunca deixe
   um número sem referência de bom/ruim). Abra com a linha de status das metas.
2. **Leitura do funil** — o que está **funcionando**, o que é **ruído por volume
   baixo** (e quantos MQLs/dias/R$ faltam para virar amostra confiável), e o que é
   **gargalo de dado**. Nunca conclua nada abaixo do volume mínimo amostral.
3. **Classificação por campanha/conjunto** — `<ul>` onde **cada** estrutura recebe
   obrigatoriamente **uma das 4 tags** com o **critério numérico** que levou a ela:
   - **`Escalar`** — volume ≥ mínimo amostral **E** Tx‑MQL estável/subindo nas 2
     últimas janelas.
   - **`Observar`** — volume < mínimo amostral; **informe** o gasto/dias que faltam
     até volume suficiente.
   - **`Otimizar`** — volume suficiente, mas Tx‑MQL caindo **ou** CPL subindo por 2
     janelas consecutivas; **aponte a hipótese** (fadiga de criativo, saturação de
     público, frequência alta, mudança de qualificação) antes de generalizar.
   - **`Cortar`** — volume suficiente, **zero** conversão qualificada, e CPL/CPMQL
     acima do **teto** por **N dias** consecutivos (N do painel; padrão 5). **Cortar
     exige meta/teto definido** — se a meta não estiver preenchida, não classifique
     nada como Cortar; diga que depende de definir a meta.
4. **Gargalo de dado — prioridade alta** — sempre que uma etapa (check‑in, presença,
   venda, faturamento) **não tiver fonte conectada**, isso é um item de ação próprio,
   **separado** dos gargalos de campanha, com prioridade alta (otimizar sem essa
   etapa é decisão às cegas). Enquanto o funil só for até MQL, este bloco existe em
   todos os períodos.
5. **Ações recomendadas** — com **números concretos** (%, R$, dias). Para escala,
   recomende o **tamanho do incremento** (ex.: +10–20% a cada 3–4 dias) e **alerte
   sobre resetar o aprendizado** se o salto for maior. Cada ação diz: o que fazer,
   em qual estrutura/etapa, quais métricas justificam, resultado esperado e a
   métrica de validação.
6. **Próxima decisão** — **gatilho** (o que muda a classificação de cada campanha)
   **+ prazo/gasto** para revisitar (ex.: "revisar em 4 dias ou ~R$ 600 de gasto").

Ao citar um anúncio (ex. "AD05"), **sempre** diga a campanha (e o conjunto quando
ajudar) — o mesmo nome de anúncio pode rodar em campanhas diferentes.

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

Compare o período com: período anterior de mesma duração; média histórica;
metas; outras campanhas/conjuntos/anúncios. Ao apontar variação, mostre valor
atual, anterior, variação absoluta e %, e o impacto no funil. **Não invente**
métricas/benchmarks; **não** trate ausência de dado como zero; **não** compare
janelas de maturação diferentes; **não** penalize leads recentes ainda não
trabalhados; **não** recomende cortar/escalar com amostra insuficiente; **não**
culpe o tráfego por perda que acontece depois do MQL, nem o comercial se o MQL
estiver ruim.

## Lead Ads × Página de captura (para o futuro)

Se entrar página de captura, inclua **Connect Rate** (visitas ÷ cliques) e
**Conversão da página** (leads ÷ visitas), e compare os métodos por CPMQL, CPCIN,
CPP, CAC, volume de presenças, faturamento e ROAS — **nunca só por CPL/Tx MQL**.

## Formato de `build/relatorios.json`

```json
{
  "generated_at": "DD/MM/AAAA HH:MM",
  "fonte": "Gerado automaticamente a partir dos dados do funil (Meta Ads × Leads).",
  "periodos": {
    "hoje":    {"html": "<h3>Resumo do período</h3><p>…</p><h3>Leitura do funil</h3><p>…</p><h3>Classificação por campanha/conjunto</h3><ul>…</ul><h3>Gargalo de dado — prioridade alta</h3><p>…</p><h3>Ações recomendadas</h3><p>…</p><h3>Próxima decisão</h3><p>…</p>"},
    "ontem":   {"html": "…"},
    "3d":      {"html": "…"},
    "7d":      {"html": "…"},
    "14d":     {"html": "…"},
    "30d":     {"html": "…"},
    "mes":     {"html": "…"},
    "mespass": {"html": "…"},
    "todo":    {"html": "…"}
  }
}
```

- **Chaves de período fixas** (mesmos ids do seletor da topbar). O briefing só
  aparece nos períodos predefinidos; em intervalo personalizado ou dias
  selecionados a aba mostra uma mensagem orientando a escolher um preset.
- HTML permitido no `html`: `<h3> <p> <ul> <li> <b>` e
  `<span class="tag escala|otimiza|corte|observar">Escalar|Otimizar|Cortar|Observar</span>`
  (a classe de “Otimizar” é `otimiza`, não `otimizar`).
- Se um período não tiver dados, escreva um `html` curto dizendo que não houve
  investimento/atividade. Se o arquivo não existir, a aba mostra tudo menos o
  briefing (cards/tabelas seguem funcionando).
