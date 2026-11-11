"""Claude wrapper shared by every agent.

- `ask_json`: structured output (guaranteed-valid JSON against a schema).
- `research`: free-form answer with the server-side web search tool.
Both fall back to the caller-provided offline function when no credentials are
configured or STUDIO_OFFLINE=1, so the whole studio still runs end-to-end.
"""
import json
import os

from . import config, db

_client = None
_disabled_reason: str | None = None


def _get_client():
    global _client, _disabled_reason
    if config.OFFLINE:
        _disabled_reason = "STUDIO_OFFLINE=1"
        return None
    if _client is None and _disabled_reason is None:
        try:
            import anthropic

            has_creds = any(
                os.environ.get(k) for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE")
            ) or os.path.exists(os.path.expanduser("~/.config/anthropic"))
            if not has_creds:
                _disabled_reason = "no Anthropic credentials (set ANTHROPIC_API_KEY in studio/.env)"
                return None
            _client = anthropic.Anthropic(max_retries=3, timeout=600)
        except Exception as e:  # pragma: no cover
            _disabled_reason = f"anthropic SDK unavailable: {e}"
    return _client


def status() -> dict:
    c = _get_client()
    return {"online": c is not None, "model": config.MODEL, "reason": _disabled_reason}


def _text(resp) -> str:
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")


def _create(**kw):
    client = _get_client()
    return client.beta.messages.create(
        model=config.MODEL,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        **kw,
    )


def ask_json(agent: str, project: str | None, system: str, prompt: str, schema: dict, offline, effort="high"):
    """Return a dict matching `schema`. `offline` is a zero-arg callable used without credentials."""
    if _get_client() is None:
        db.log(project, agent, f"offline mode ({_disabled_reason}) — using built-in playbook")
        return offline()
    try:
        resp = _create(
            max_tokens=16000,
            system=system,
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}],
        )
        if resp.stop_reason == "refusal":
            db.log(project, agent, "model declined — falling back to playbook")
            return offline()
        return json.loads(_text(resp))
    except Exception as e:
        db.log(project, agent, f"API error {type(e).__name__}: {e} — falling back to playbook")
        return offline()


def research(agent: str, project: str | None, system: str, prompt: str, offline, max_searches=8) -> str:
    """Free-form research with web search. Returns markdown notes."""
    if _get_client() is None:
        db.log(project, agent, f"offline mode ({_disabled_reason}) — web research skipped")
        return offline()
    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}]
    try:
        for _ in range(4):  # handle pause_turn continuation
            resp = _create(max_tokens=16000, system=system, tools=tools,
                           output_config={"effort": "high"}, messages=messages)
            if resp.stop_reason == "pause_turn":
                messages = [*messages, {"role": "assistant", "content": resp.content}]
                continue
            if resp.stop_reason == "refusal":
                return offline()
            return _text(resp)
        return _text(resp)
    except Exception as e:
        db.log(project, agent, f"API error {type(e).__name__}: {e} — web research skipped")
        return offline()
