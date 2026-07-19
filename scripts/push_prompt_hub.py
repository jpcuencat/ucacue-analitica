"""Sube el SYSTEM_PROMPT al LangSmith Hub para versionado (item 7).

Ejecutar UNA VEZ para publicar el prompt. Después activa Hub en .env:
    LANGSMITH_HUB_PROMPT=ucacue-analitica/system-prompt

Uso:
    python scripts/push_prompt_hub.py
    python scripts/push_prompt_hub.py --repo mi-org/system-prompt
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(override=True)

DEFAULT_REPO = "ucacue-analitica/system-prompt"


def push_prompt(repo: str) -> None:
    from langsmith import Client
    from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate
    from src.agent.api_agent import SYSTEM_PROMPT

    prompt = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(SYSTEM_PROMPT),
    ])
    url = Client().push_prompt(repo, object=prompt, is_public=False,
                               description="System prompt del Asistente Analítico UCACUE")
    print(f"✅ Prompt subido: {url}")
    print(f"\nPara activarlo en la app, agrega al .env:")
    print(f"  LANGSMITH_HUB_PROMPT={repo}")
    print(f"\nPara jalarlo con versión específica:")
    print(f"  LANGSMITH_HUB_PROMPT={repo}:latest")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sube SYSTEM_PROMPT al LangSmith Hub")
    parser.add_argument("--repo", default=DEFAULT_REPO,
                        help=f"Repositorio en Hub (default: {DEFAULT_REPO})")
    args = parser.parse_args()
    push_prompt(args.repo)
