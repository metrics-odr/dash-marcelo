import os
import json
from google import genai
from google.genai import types

# 1. Autenticação na API
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# 2. Leitura dos arquivos
with open("build/relatorios_metrics.json", "r", encoding="utf-8") as f:
    metrics_data = f.read()

guia_regras = ""
if os.path.exists("build/GUIA-RELATORIOS.md"):
    with open("build/GUIA-RELATORIOS.md", "r", encoding="utf-8") as f:
        guia_regras = f.read()

# 3. Montagem do Prompt
prompt = f"""
Você é o gestor de tráfego responsável por atualizar os 9 briefings da aba 'Relatório' do dashboard.
Siga estritamente este guia de regras de interpretação do funil e tags:
{guia_regras}

Métricas atuais calculadas:
{metrics_data}

Sua tarefa:
1. Migre o HTML da chave 'hoje' do JSON para 'ontem'.
2. Escreva um novo 'hoje' analisando os dados atuais.
3. Reescreva do zero os outros 7 períodos (3d, 7d, 14d, 30d, mes, mespass, todo).
4. Use rigorosamente as tags CSS: <span class="tag escala|otimiza|corte|observar">.
5. Retorne APENAS um objeto JSON válido mantendo a estrutura exata de build/relatorios.json.
"""

# 4. Chamada da API
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.2
    )
)

# 5. Sobrescreve o arquivo relatorios.json
novo_relatorio = json.loads(response.text)
with open("build/relatorios.json", "w", encoding="utf-8") as f:
    json.dump(novo_relatorio, f, ensure_ascii=False, indent=2)

print("Briefings gerados e salvos com sucesso em build/relatorios.json!")
