#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera a dashboard estatica (index.html) cruzando duas abas da planilha central:

  - "Leads"    (gid 2135966057): leads reais + coluna N (faturamento) => qualificacao
  - "Meta Ads" (gid 1245628405): investimento/impressoes/cliques do gerenciador

Criterio de Lead Qualificado (MQL): faturamento medio mensal >= 30 mil (coluna N).

O script roda 100% na nuvem (GitHub Actions). Ele apenas LE as planilhas via
export CSV publico; nunca escreve nada de volta. Para teste local, use
--leads-file / --meta-file apontando para CSVs baixados.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone, timedelta

SPREADSHEET_ID = "1_lj4IlJyylkC1MyW12ujCR7lpg90VOqzIbxO1XSvxXQ"
GID_LEADS = "2135966057"
GID_META = "1245628405"
EXPORT_URL = "https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"

BRT = timezone(timedelta(hours=-3))  # horario de Brasilia, so para exibicao


# --------------------------------------------------------------------------- #
# Leitura das planilhas
# --------------------------------------------------------------------------- #
def fetch_csv(url: str) -> list[list[str]]:
    req = urllib.request.Request(url, headers={"User-Agent": "dash-marcelo-bot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return list(csv.reader(io.StringIO(raw)))


def read_csv_file(path: str) -> list[list[str]]:
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.reader(f))


def load_rows(url: str, local: str | None) -> list[list[str]]:
    if local:
        return read_csv_file(local)
    return fetch_csv(url)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def norm(s: str | None) -> str:
    return strip_accents((s or "").strip().lower())


def to_float(v) -> float:
    """Converte '1.234,56' / 'R$ 30,89' / '30.89' em float."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return 0.0
    s = re.sub(r"[^\d,.\-]", "", s)
    if "," in s and "." in s:          # 1.234,56 -> 1234.56
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:                     # 30,89 -> 30.89
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_date(v: str) -> str | None:
    """Devolve 'YYYY-MM-DD' a partir de varios formatos."""
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)  # ISO / created_time
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d/%m/%y", "%b %d, %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def is_test_lead(rowtext: str) -> bool:
    return "<test lead" in rowtext.lower()


# Criterio de qualificacao: faturamento medio mensal >= 30 mil (coluna N).
_NUM_RE = re.compile(r"\d+")


def is_qualified(bucket: str | None) -> bool:
    s = norm(bucket)
    if not s or "test lead" in s:
        return False
    nums = [int(n) for n in _NUM_RE.findall(s)]
    if not nums:
        return False
    if "menos" in s or "ate " in s or "abaixo" in s:
        return False                    # faixa abaixo de X => nao qualifica
    if "entre" in s:
        return min(nums) >= 30          # limite inferior da faixa >= 30 mil
    if any(k in s for k in ("mais", "acima", "superior", "maior")):
        return max(nums) >= 30
    return max(nums) >= 30              # fallback


def bucket_lower(bucket: str) -> int:
    """Chave de ordenacao das faixas de faturamento (menor -> maior)."""
    s = norm(bucket)
    nums = [int(n) for n in _NUM_RE.findall(s)]
    if not nums:
        return 10**9                    # sem resposta vai pro fim
    if "menos" in s or "ate " in s or "abaixo" in s:
        return -1
    return min(nums)


def pretty_bucket(bucket: str) -> str:
    s = (bucket or "").strip()
    if not s:
        return "Sem resposta"
    return s.replace("_", " ").replace(" e ", " a ").capitalize()


def mask_email(e: str) -> str:
    e = (e or "").strip()
    if "@" not in e:
        return "—"
    user, dom = e.split("@", 1)
    keep = user[:2] if len(user) > 2 else user[:1]
    return f"{keep}{'*' * 4}@{dom}"


def mask_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p or "")
    if len(digits) < 4:
        return "—"
    return f"…{digits[-4:]}"


def first_last_initial(name: str) -> str:
    parts = (name or "").strip().split()
    if not parts:
        return "—"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][:1]}."


# --------------------------------------------------------------------------- #
# Indexacao das colunas (por cabecalho, com fallback posicional)
# --------------------------------------------------------------------------- #
def header_index(header: list[str], wanted: dict[str, list[str]], fallback: dict[str, int]) -> dict[str, int]:
    idx = {}
    hn = [norm(h) for h in header]
    for key, aliases in wanted.items():
        found = None
        for a in aliases:
            a = norm(a)
            for i, h in enumerate(hn):
                if h == a or (a and a in h):
                    found = i
                    break
            if found is not None:
                break
        idx[key] = found if found is not None else fallback.get(key)
    return idx


def cell(row: list[str], i: int | None) -> str:
    if i is None or i < 0 or i >= len(row):
        return ""
    return (row[i] or "").strip()


# --------------------------------------------------------------------------- #
# Processamento
# --------------------------------------------------------------------------- #
def process(leads_rows, meta_rows):
    # ---- Leads ----
    lheader = leads_rows[0] if leads_rows else []
    lidx = header_index(
        lheader,
        {
            "created": ["created_time", "data", "created"],
            "ad_name": ["ad_name"],
            "campaign": ["campaign_name"],
            "is_organic": ["is_organic"],
            "platform": ["platform"],
            "profession": ["qual_sua_profissao", "profiss"],
            "faturamento": ["qual_seu_faturamento", "faturamento"],
            "name": ["full_name", "nome"],
            "email": ["email"],
            "phone": ["phone_number", "phone", "telefone"],
        },
        {"created": 1, "ad_name": 3, "campaign": 7, "is_organic": 10, "platform": 11,
         "profession": 12, "faturamento": 13, "name": 14, "email": 15, "phone": 16},
    )

    leads = []
    for row in leads_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        rowtext = " ".join(str(c) for c in row)
        if is_test_lead(rowtext):
            continue
        created = cell(row, lidx["created"])
        date = parse_date(created)
        organic = norm(cell(row, lidx["is_organic"])) in ("true", "1", "sim", "verdadeiro")
        platform = norm(cell(row, lidx["platform"]))
        campaign = cell(row, lidx["campaign"])
        ad = cell(row, lidx["ad_name"])
        fat = cell(row, lidx["faturamento"])
        if organic:
            source = "Orgânico"
        elif platform in ("ig", "fb", "instagram", "facebook") or campaign:
            source = "Meta Ads"
        else:
            source = "Outros"
        leads.append({
            "date": date,
            "source": source,
            "platform": platform or "—",
            "campaign": campaign or "(sem campanha)",
            "ad": ad or "(sem anúncio)",
            "profession": cell(row, lidx["profession"]) or "Sem resposta",
            "bucket": fat,
            "qualified": is_qualified(fat),
            "name": first_last_initial(cell(row, lidx["name"])),
            "email": mask_email(cell(row, lidx["email"])),
            "phone": mask_phone(cell(row, lidx["phone"])),
        })

    # ---- Meta Ads ----
    mheader = meta_rows[0] if meta_rows else []
    midx = header_index(
        mheader,
        {
            "day": ["day", "data"],
            "campaign": ["campaign name", "campaign"],
            "adset": ["ad set name", "adset"],
            "ad": ["ad name"],
            "spent": ["amount spent", "valor gasto", "gasto"],
            "impr": ["impressions", "impress"],
            "clicks": ["link clicks", "clicks", "cliques"],
            "leads": ["leads"],
        },
        {"day": 0, "campaign": 1, "adset": 2, "ad": 3, "spent": 4, "impr": 5, "clicks": 6, "leads": 7},
    )

    meta = []
    for row in meta_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        day = parse_date(cell(row, midx["day"]))
        meta.append({
            "date": day,
            "campaign": cell(row, midx["campaign"]) or "(sem campanha)",
            "ad": cell(row, midx["ad"]) or "(sem anúncio)",
            "spent": to_float(cell(row, midx["spent"])),
            "impr": to_float(cell(row, midx["impr"])),
            "clicks": to_float(cell(row, midx["clicks"])),
            "meta_leads": to_float(cell(row, midx["leads"])),
        })

    # ---- Totais ----
    gasto = sum(m["spent"] for m in meta)
    impr = sum(m["impr"] for m in meta)
    clicks = sum(m["clicks"] for m in meta)
    meta_leads = sum(m["meta_leads"] for m in meta)

    leads_total = len(leads)
    leads_ads = sum(1 for l in leads if l["source"] == "Meta Ads")
    leads_org = sum(1 for l in leads if l["source"] == "Orgânico")
    mqls = sum(1 for l in leads if l["qualified"])
    mqls_ads = sum(1 for l in leads if l["qualified"] and l["source"] == "Meta Ads")

    # ---- Serie diaria (eixo x compartilhado) ----
    dates = sorted({d for d in (
        [l["date"] for l in leads if l["date"]] + [m["date"] for m in meta if m["date"]]
    )})
    daily = []
    for d in dates:
        daily.append({
            "date": d,
            "gasto": round(sum(m["spent"] for m in meta if m["date"] == d), 2),
            "impr": sum(m["impr"] for m in meta if m["date"] == d),
            "clicks": sum(m["clicks"] for m in meta if m["date"] == d),
            "leads": sum(1 for l in leads if l["date"] == d),
            "mqls": sum(1 for l in leads if l["date"] == d and l["qualified"]),
        })

    # ---- Breakdowns ----
    def group(items, keyfn, spentmap=None):
        out = {}
        for it in items:
            k = keyfn(it)
            g = out.setdefault(k, {"leads": 0, "mqls": 0, "gasto": 0.0})
            g["leads"] += 1
            g["mqls"] += 1 if it["qualified"] else 0
        return out

    by_source = {}
    for l in leads:
        g = by_source.setdefault(l["source"], {"leads": 0, "mqls": 0})
        g["leads"] += 1
        g["mqls"] += 1 if l["qualified"] else 0

    by_platform = {}
    for l in leads:
        g = by_platform.setdefault(l["platform"], {"leads": 0, "mqls": 0})
        g["leads"] += 1
        g["mqls"] += 1 if l["qualified"] else 0

    # Faixas de faturamento (ordenadas menor -> maior)
    bucket_groups = {}
    for l in leads:
        key = l["bucket"] or ""
        g = bucket_groups.setdefault(key, {"leads": 0, "qualified": is_qualified(key), "lower": bucket_lower(key)})
        g["leads"] += 1
    by_bucket = sorted(
        ({"label": pretty_bucket(k), "leads": v["leads"], "qualified": v["qualified"], "lower": v["lower"]}
         for k, v in bucket_groups.items()),
        key=lambda x: x["lower"],
    )

    # Profissao (top 12)
    prof = {}
    for l in leads:
        prof[l["profession"]] = prof.get(l["profession"], 0) + 1
    by_profession = sorted(
        ({"label": k.replace("_", " ").capitalize(), "leads": v} for k, v in prof.items()),
        key=lambda x: -x["leads"],
    )[:12]

    # Cruzamento por campanha: gasto (Meta) x leads/mqls (Leads)
    camp = {}
    for m in meta:
        g = camp.setdefault(m["campaign"], {"gasto": 0.0, "leads": 0, "mqls": 0})
        g["gasto"] += m["spent"]
    for l in leads:
        g = camp.setdefault(l["campaign"], {"gasto": 0.0, "leads": 0, "mqls": 0})
        g["leads"] += 1
        g["mqls"] += 1 if l["qualified"] else 0
    by_campaign = sorted(
        ({"label": short_campaign(k), "full": k, "gasto": round(v["gasto"], 2),
          "leads": v["leads"], "mqls": v["mqls"]} for k, v in camp.items()),
        key=lambda x: (-x["gasto"], -x["leads"]),
    )

    # Cruzamento por anuncio
    adm = {}
    for m in meta:
        g = adm.setdefault(m["ad"], {"gasto": 0.0, "leads": 0, "mqls": 0})
        g["gasto"] += m["spent"]
    for l in leads:
        g = adm.setdefault(l["ad"], {"gasto": 0.0, "leads": 0, "mqls": 0})
        g["leads"] += 1
        g["mqls"] += 1 if l["qualified"] else 0
    by_ad = sorted(
        ({"label": k, "gasto": round(v["gasto"], 2), "leads": v["leads"], "mqls": v["mqls"]}
         for k, v in adm.items()),
        key=lambda x: (-x["gasto"], -x["leads"]),
    )

    # Tabela de leads qualificados (contatos mascarados)
    qualified_leads = sorted(
        ({"date": l["date"] or "—", "name": l["name"], "profession": l["profession"].replace("_", " ").capitalize(),
          "bucket": pretty_bucket(l["bucket"]), "source": l["source"], "campaign": short_campaign(l["campaign"]),
          "email": l["email"], "phone": l["phone"]}
         for l in leads if l["qualified"]),
        key=lambda x: x["date"], reverse=True,
    )

    date_min = dates[0] if dates else None
    date_max = dates[-1] if dates else None

    return {
        "build": {
            "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generated_at_brt": datetime.now(BRT).strftime("%d/%m/%Y %H:%M"),
            "build_id": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
            "date_min": date_min,
            "date_max": date_max,
            "tax_factor": 1.1385,
        },
        "base": {
            "gasto": round(gasto, 2), "impr": impr, "clicks": clicks, "meta_leads": meta_leads,
            "leads_total": leads_total, "leads_ads": leads_ads, "leads_org": leads_org,
            "mqls": mqls, "mqls_ads": mqls_ads,
        },
        "daily": daily,
        "by_source": [{"label": k, **v} for k, v in sorted(by_source.items(), key=lambda x: -x[1]["leads"])],
        "by_platform": [{"label": k, **v} for k, v in sorted(by_platform.items(), key=lambda x: -x[1]["leads"])],
        "by_bucket": by_bucket,
        "by_profession": by_profession,
        "by_campaign": by_campaign,
        "by_ad": by_ad,
        "qualified_leads": qualified_leads,
    }


def short_campaign(name: str) -> str:
    """Encurta 'BTBExp | E2-CAP | ... | 2026-07-25 | Teste' para algo legivel."""
    if not name or name == "(sem campanha)":
        return "(sem campanha)"
    parts = [p.strip() for p in name.split("|")]
    tag = next((p for p in parts if re.search(r"E\d-\w+", p)), None)
    head = parts[0] if parts else name
    label = f"{head} · {tag}" if tag and tag != head else head
    return label[:48]


# --------------------------------------------------------------------------- #
# Render
# --------------------------------------------------------------------------- #
def render(data: dict, template_path: str) -> str:
    with open(template_path, "r", encoding="utf-8") as f:
        tpl = f.read()
    payload = json.dumps(data, ensure_ascii=False)
    tpl = tpl.replace("__DATA_JSON__", payload)
    tpl = tpl.replace("__BUILD_ID__", data["build"]["build_id"])
    tpl = tpl.replace("__GENERATED_BRT__", data["build"]["generated_at_brt"])
    return tpl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--leads-file")
    ap.add_argument("--meta-file")
    ap.add_argument("--template", default="build/template.html")
    ap.add_argument("--out", default="dist/index.html")
    args = ap.parse_args()

    leads_rows = load_rows(EXPORT_URL.format(sid=SPREADSHEET_ID, gid=GID_LEADS), args.leads_file)
    meta_rows = load_rows(EXPORT_URL.format(sid=SPREADSHEET_ID, gid=GID_META), args.meta_file)

    data = process(leads_rows, meta_rows)

    import os
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    html = render(data, args.template)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)

    b, base = data["build"], data["base"]
    print("== build ok ==", file=sys.stderr)
    print(f"  periodo   : {b['date_min']} -> {b['date_max']}", file=sys.stderr)
    print(f"  gasto     : R$ {base['gasto']:.2f}", file=sys.stderr)
    print(f"  leads     : {base['leads_total']} (ads {base['leads_ads']} / org {base['leads_org']})", file=sys.stderr)
    print(f"  MQLs >=30k: {base['mqls']}  (CPMQL R$ {base['gasto']/base['mqls']:.2f})" if base["mqls"] else "  MQLs: 0", file=sys.stderr)
    print(f"  out       : {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
