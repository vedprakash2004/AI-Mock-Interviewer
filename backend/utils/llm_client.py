import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL_NAME = "openai/gpt-oss-120b"


def call_llm(prompt: str, temperature: float = 0.6, max_tokens: int = 2048) -> str:
    """
    Robust LLM caller with higher token limit
    and safe trimming.
    """
    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens
        )

        text = completion.choices[0].message.content.strip()

        return text

    except Exception as e:
        return f"LLM Error: {str(e)}"
