# For LiveKit Cloud (`lk agent create` / `lk agent deploy`) or any container host.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /usr/local/bin/uv

RUN useradd --create-home --uid 10001 app
WORKDIR /home/app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY gym_agent ./gym_agent
RUN uv sync --frozen --no-dev && chown -R app /home/app

USER app
# Download the voice activity and turn models into the image.
RUN uv run python -m gym_agent.agent download-files

CMD ["uv", "run", "python", "-m", "gym_agent.agent", "start"]
