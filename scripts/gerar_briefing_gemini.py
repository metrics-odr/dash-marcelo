import os
import json
import re
import time
from google import genai
from google.genai import types

# 1. Autenticação na API
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("ERRO: A variável GEMINI_API_KEY não foi encontrada nos Secrets do GitHub!")

client = genai.Client(api_key=api_key)

# 2. Leitura dos arquivos
if not os.path.exists("build/relatorios_metrics.json"):
    raise FileNotFoundError("ERRO: O arquivo build/relatorios_metrics.json não foi encontrado.")

with open("build/relatorios_metrics.json", "r", encoding="utf-8") as f:
    metrics_data = f.read()

guia_regras = ""
if os.path.exists("build/GUIA-RELATORIOS.md"):
    with open("build/GUIA-RELATORIOS.md", "r", encoding="utf-8") as f:
        guia_regras = f.read()

relatorios_atuais = ""
if os.path.exists("build/relatorios.json"):
    with open("build/relatorios.json", "r", encoding="utf-8") as f:
        relatorios_atuais = f.read()

# 3. Montagem do Prompt
prompt = f"""
Você é o gestor de tráfego responsável por atualizar os 9 briefings da aba 'Relatório' do dashboard.
Siga estritamente este guia de regras de interpretação do funil e tags:
{guia_regras}

Métricas atuais calculadas:
{metrics_data}

Estado atual do build/relatorios.json (para migrar o 'hoje' atual para 'ontem'):
{relatorios_atuais}

Sua tarefa:
1. Copie o HTML de periodos.hoje do JSON atual para periodos.ontem.
2. Escreva um novo 'hoje' analisando os dados atuais de relatorios_metrics.json.
3. Reescreva do zero os outros 7 períodos (3d, 7d, 14d, 30d, mes, mespass, todo).
4. Use rigorosamente as tags CSS: <span class="tag escala|otimiza|corte|observar">.
5. Retorne APENAS um objeto JSON válido mantendo a estrutura exata de build/relatorios.json, sem textos ou comentários fora do JSON.
"""

# 4. Chamada da API com Fallback e Retries para evitar erro 429
modelos_para_testar = ["gemini-1.5-flash", "gemini-1.5-pro"]
response = None

for modelo in modelos_para_testar:
    for tentativa in range(3):
        try:
            print(f"Tentando gerar relatório com {modelo} (tentativa {tentativa + 1})...")
            response = client.models.generate_content(
                model=modelo,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2
                )
            )
            if response:
                break
        except Exception as e:
            print(f"Aviso no modelo {modelo}: {e}")
            time.sleep(10) # Aguarda 10 segundos caso seja rate-limit
    if response:
        break

if not response:
    raise RuntimeError("ERRO: Não foi possível obter resposta da API do Gemini após várias tentativas.")

# 5. Tratamento para remoção de formatação Markdown caso retorne
raw_text = response.text.strip()
if raw_text.startswith("```"):
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

# 6. Validação do JSON e salvamento
novo_relatorio = json.loads(raw_text)

with open("build/relatorios.json", "w", encoding="utf-8") as f:
    json.dump(novo_relatorio, f, ensure_ascii=False, indent=2)

print("✅ Briefings gerados e salvos com sucesso em build/relatorios.json!")
