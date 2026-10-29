#!/usr/bin/env python3
"""
Project Memory Monitor & Sync Utility for Antigravity.

Supports two execution modes:
1. Agent Skill CLI (`init`, `inspect`, `add`, `batch`, `mark-synced`, `validate`)
2. Antigravity Lifecycle Hook (`hook --event session-start|pre-invocation|stop`)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

SCRIPT_PATH = Path(__file__).resolve()
SKILL_DIR = SCRIPT_PATH.parent.parent
REPO_ROOT = SKILL_DIR.parent.parent.parent
MEMORY_FILE = REPO_ROOT / "PROJECT_MEMORY.md"
STATE_FILE = SKILL_DIR / ".state.json"

SECTIONS = {
    "rule": ("RULES", "1. Regras de Projeto & Diretrizes Inegociáveis"),
    "decision": ("DECISIONS", "2. Decisões Arquiteturais & Técnicas (ADR)"),
    "keypoint": ("KEYPOINTS", "3. Pontos-Chave, Diagnósticos & Comportamento de APIs"),
    "milestone": ("MILESTONES", "4. Registro Cronológico de Marcos da Conversa"),
}

RULE_SIGNAL_REGEX = re.compile(
    r"\b(sempre|nunca|priorize|regra|padrao|padrão|lembre|nao remova|não remova|"
    r"autoria|paridade|memoria|memória|decisao|decisão|obrigatorio|obrigatório)\b",
    re.IGNORECASE,
)


def now_brt_str() -> str:
    tz_brt = dt.timezone(dt.timedelta(hours=-3))
    return dt.datetime.now(tz_brt).strftime("%Y-%m-%d %H:%M BRT")


def today_brt_str() -> str:
    tz_brt = dt.timezone(dt.timedelta(hours=-3))
    return dt.datetime.now(tz_brt).strftime("%Y-%m-%d")


def load_state() -> Dict[str, Any]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"conversations": {}, "last_nudge_invocation": {}}


def save_state(state: Dict[str, Any]) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def default_memory_template() -> str:
    ts = now_brt_str()
    return (
        "# Memória Persistente do Projeto — MyWeatherNow\n\n"
        "> Documento vivo mantido automaticamente pela skill "
        "[`project-memory-monitor`](.agents/skills/project-memory-monitor/SKILL.md). "
        "Consolida regras inegociáveis, decisões arquiteturais, descobertas técnicas e marcos das conversas.\n\n"
        f"- **Última sincronização:** `{ts}`\n"
        "- **Resumo de registros:** `0` regras • `0` decisões • `0` pontos-chave • `0` marcos\n\n"
        "---\n\n"
        "## 1. Regras de Projeto & Diretrizes Inegociáveis\n\n"
        "<!-- SECTION:RULES:START -->\n"
        "<!-- SECTION:RULES:END -->\n\n"
        "---\n\n"
        "## 2. Decisões Arquiteturais & Técnicas (ADR)\n\n"
        "<!-- SECTION:DECISIONS:START -->\n"
        "<!-- SECTION:DECISIONS:END -->\n\n"
        "---\n\n"
        "## 3. Pontos-Chave, Diagnósticos & Comportamento de APIs\n\n"
        "<!-- SECTION:KEYPOINTS:START -->\n"
        "<!-- SECTION:KEYPOINTS:END -->\n\n"
        "---\n\n"
        "## 4. Registro Cronológico de Marcos da Conversa\n\n"
        "<!-- SECTION:MILESTONES:START -->\n"
        "<!-- SECTION:MILESTONES:END -->\n"
    )


def ensure_memory_file() -> str:
    if not MEMORY_FILE.exists():
        content = default_memory_template()
        MEMORY_FILE.write_text(content, encoding="utf-8")
        return content
    return MEMORY_FILE.read_text(encoding="utf-8")


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:64] or "entry"


def count_entries_in_block(block: str) -> int:
    return len(re.findall(r"<!-- ENTRY:[a-z0-9_-]+:START -->", block))


def refresh_header_metadata(content: str) -> str:
    counts = {}
    for cat, (marker, _) in SECTIONS.items():
        m = re.search(
            rf"<!-- SECTION:{marker}:START -->(.*?)<!-- SECTION:{marker}:END -->",
            content,
            flags=re.DOTALL,
        )
        counts[cat] = count_entries_in_block(m.group(1)) if m else 0

    ts = now_brt_str()
    content = re.sub(
        r"- \*\*Última sincronização:\*\* `[^`]*`",
        f"- **Última sincronização:** `{ts}`",
        content,
    )
    summary_line = (
        f"- **Resumo de registros:** `{counts['rule']}` regras • "
        f"`{counts['decision']}` decisões • "
        f"`{counts['keypoint']}` pontos-chave • "
        f"`{counts['milestone']}` marcos"
    )
    content = re.sub(r"- \*\*Resumo de registros:\*\* .*", summary_line, content)
    return content


def format_entry(
    category: str,
    entry_id: str,
    title: str,
    summary: str,
    files: Optional[List[str]] = None,
    date_str: Optional[str] = None,
) -> str:
    eid = slugify(entry_id or title)
    d_str = date_str or today_brt_str()
    clean_files = [f.strip() for f in (files or []) if f.strip()]
    files_md = ""
    if clean_files:
        linked = ", ".join(f"[`{f}`]({f})" for f in clean_files)
        files_md = f"\n  - **Arquivos relacionados:** {linked}"

    if category == "milestone":
        body = (
            f"<!-- ENTRY:{eid}:START -->\n"
            f"- **`[{d_str}]` {title.strip()}** — {summary.strip()}{files_md}\n"
            f"<!-- ENTRY:{eid}:END -->"
        )
    elif category == "rule":
        body = (
            f"<!-- ENTRY:{eid}:START -->\n"
            f"- **{title.strip()}** (`#{eid}`)\n"
            f"  - {summary.strip()}{files_md}\n"
            f"<!-- ENTRY:{eid}:END -->"
        )
    else:
        body = (
            f"<!-- ENTRY:{eid}:START -->\n"
            f"### {title.strip()} (`{d_str}` • `#{eid}`)\n"
            f"- {summary.strip()}{files_md}\n"
            f"<!-- ENTRY:{eid}:END -->"
        )
    return body


def upsert_entry(
    content: str,
    category: str,
    entry_id: str,
    title: str,
    summary: str,
    files: Optional[List[str]] = None,
    date_str: Optional[str] = None,
) -> Tuple[str, str]:
    if category not in SECTIONS:
        raise ValueError(f"Unknown category '{category}'. Expected one of: {list(SECTIONS.keys())}")

    marker, _ = SECTIONS[category]
    eid = slugify(entry_id or title)
    rendered = format_entry(category, eid, title, summary, files, date_str)

    sec_pattern = re.compile(
        rf"(<!-- SECTION:{marker}:START -->)(.*?)(<!-- SECTION:{marker}:END -->)",
        flags=re.DOTALL,
    )
    m = sec_pattern.search(content)
    if not m:
        raise RuntimeError(f"Missing section markers for {marker} in {MEMORY_FILE}")

    start_tag, inner, end_tag = m.group(1), m.group(2), m.group(3)
    entry_pattern = re.compile(
        rf"<!-- ENTRY:{re.escape(eid)}:START -->.*?<!-- ENTRY:{re.escape(eid)}:END -->",
        flags=re.DOTALL,
    )

    if entry_pattern.search(inner):
        new_inner = entry_pattern.sub(lambda _: rendered, inner)
        action = "updated"
    else:
        stripped = inner.strip()
        if stripped:
            sep = "\n" if category in ("rule", "milestone") else "\n\n"
            new_inner = f"\n{stripped}{sep}{rendered}\n"
        else:
            new_inner = f"\n{rendered}\n"
        action = "added"

    updated = content[: m.start()] + start_tag + new_inner + end_tag + content[m.end() :]
    return refresh_header_metadata(updated), action


def find_latest_transcript() -> Optional[Path]:
    candidates: List[Path] = []
    home = Path.home()
    for prod_dir in ("antigravity", "antigravity-ide", "antigravity-cli"):
        brain_dir = home / ".gemini" / prod_dir / "brain"
        if brain_dir.is_dir():
            for tpath in brain_dir.glob("*/.system_generated/logs/transcript.jsonl"):
                candidates.append(tpath)
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    # Prefer transcript mentioning current repo name if available among top recent
    repo_name = REPO_ROOT.name.lower()
    for cand in candidates[:6]:
        try:
            with cand.open("r", encoding="utf-8", errors="ignore") as fh:
                sample = ""
                for _ in range(25):
                    line = fh.readline()
                    if not line:
                        break
                    sample += line
                if repo_name in sample.lower():
                    return cand
        except Exception:
            continue
    return candidates[0]


def extract_clean_user_request(raw_content: str) -> str:
    if not raw_content:
        return ""
    m = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", raw_content, flags=re.DOTALL)
    if m:
        return m.group(1).strip()
    # Strip metadata blocks if no USER_REQUEST wrapper
    cleaned = re.sub(r"<ADDITIONAL_METADATA>.*?</ADDITIONAL_METADATA>", "", raw_content, flags=re.DOTALL)
    cleaned = re.sub(r"<USER_SETTINGS_CHANGE>.*?</USER_SETTINGS_CHANGE>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<SYSTEM_MESSAGE>.*?</SYSTEM_MESSAGE>", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


def parse_transcript_turns(transcript_path: Path, min_step_index: int = -1) -> Tuple[str, int, List[Dict[str, Any]]]:
    conv_id = transcript_path.parent.parent.parent.name
    max_step = -1
    events: List[Dict[str, Any]] = []

    if not transcript_path.exists():
        return conv_id, max_step, events

    with transcript_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue

            step_idx = int(obj.get("step_index", -1))
            if step_idx > max_step:
                max_step = step_idx
            if step_idx <= min_step_index:
                continue

            stype = obj.get("type", "")
            created_at = obj.get("created_at", "")

            if stype == "USER_INPUT":
                req = extract_clean_user_request(obj.get("content", ""))
                if req:
                    events.append(
                        {
                            "step_index": step_idx,
                            "type": "user_request",
                            "created_at": created_at,
                            "text": req,
                        }
                    )
            elif stype == "PLANNER_RESPONSE":
                content = (obj.get("content") or "").strip()
                tool_calls = obj.get("tool_calls") or []
                for tc in tool_calls:
                    tname = tc.get("name", "")
                    targs = tc.get("args") or {}
                    if tname == "run_command":
                        cmd_str = str(targs.get("CommandLine", ""))
                        if "git commit" in cmd_str:
                            events.append(
                                {
                                    "step_index": step_idx,
                                    "type": "git_commit",
                                    "created_at": created_at,
                                    "text": cmd_str[:260],
                                }
                            )
                # Final user-facing response in turn (no tool calls, non-empty content)
                if content and not tool_calls:
                    events.append(
                        {
                            "step_index": step_idx,
                            "type": "assistant_summary",
                            "created_at": created_at,
                            "text": content[:900],
                        }
                    )

    return conv_id, max_step, events


def cmd_init(_args: argparse.Namespace) -> int:
    ensure_memory_file()
    print(f"Initialized/verified: {MEMORY_FILE}")
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    tpath = Path(args.transcript) if args.transcript else find_latest_transcript()
    if not tpath or not tpath.exists():
        print(json.dumps({"error": "No transcript.jsonl found", "events": []}, indent=2))
        return 0

    state = load_state()
    conv_id = tpath.parent.parent.parent.name
    min_step = -1
    if args.since_last:
        min_step = int(state.get("conversations", {}).get(conv_id, {}).get("last_synced_step", -1))

    conv_id, max_step, events = parse_transcript_turns(tpath, min_step_index=min_step)
    if args.limit and args.limit > 0:
        events = events[-args.limit :]

    payload = {
        "conversation_id": conv_id,
        "transcript_path": str(tpath),
        "last_synced_step": min_step,
        "latest_step_index": max_step,
        "unsynced_events_count": len(events),
        "events": events,
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    content = ensure_memory_file()
    files_list = [f.strip() for f in (args.files or "").split(",") if f.strip()]
    updated, action = upsert_entry(
        content=content,
        category=args.category,
        entry_id=args.id or args.title,
        title=args.title,
        summary=args.summary,
        files=files_list,
        date_str=args.date,
    )
    MEMORY_FILE.write_text(updated, encoding="utf-8")
    print(f"[{action.upper()}] ({args.category}) {args.title} -> {MEMORY_FILE.name}")
    return 0


def cmd_batch(args: argparse.Namespace) -> int:
    raw = Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read()
    items = json.loads(raw)
    if not isinstance(items, list):
        raise ValueError("Batch input must be a JSON array of entry objects.")

    content = ensure_memory_file()
    results = []
    for item in items:
        cat = item["category"]
        title = item["title"]
        summary = item["summary"]
        eid = item.get("id") or title
        files = item.get("files") or []
        if isinstance(files, str):
            files = [f.strip() for f in files.split(",") if f.strip()]
        date_str = item.get("date")
        content, action = upsert_entry(content, cat, eid, title, summary, files, date_str)
        results.append(f"{action}:{cat}:{slugify(eid)}")

    MEMORY_FILE.write_text(content, encoding="utf-8")
    print(f"Processed {len(results)} entries into {MEMORY_FILE.name}: {', '.join(results)}")
    return 0


def cmd_mark_synced(args: argparse.Namespace) -> int:
    tpath = Path(args.transcript) if args.transcript else find_latest_transcript()
    state = load_state()
    if tpath and tpath.exists():
        conv_id = args.conversation_id or tpath.parent.parent.parent.name
        _, max_step, _ = parse_transcript_turns(tpath, min_step_index=-1)
        step_val = args.step_index if args.step_index is not None else max_step
    else:
        conv_id = args.conversation_id or "manual"
        step_val = args.step_index if args.step_index is not None else 0

    state.setdefault("conversations", {})[conv_id] = {
        "last_synced_step": int(step_val),
        "synced_at": now_brt_str(),
    }
    save_state(state)
    print(f"Checkpoint saved for conversation {conv_id} at step {step_val}.")
    return 0


def cmd_validate(_args: argparse.Namespace) -> int:
    if not MEMORY_FILE.exists():
        print(f"ERROR: {MEMORY_FILE} does not exist.", file=sys.stderr)
        return 1

    content = MEMORY_FILE.read_text(encoding="utf-8")
    errors: List[str] = []

    for cat, (marker, heading) in SECTIONS.items():
        if f"<!-- SECTION:{marker}:START -->" not in content:
            errors.append(f"Missing start marker for {marker}")
        if f"<!-- SECTION:{marker}:END -->" not in content:
            errors.append(f"Missing end marker for {marker}")
        if heading not in content:
            errors.append(f"Missing section heading '{heading}'")

    ids = re.findall(r"<!-- ENTRY:([a-z0-9_-]+):START -->", content)
    if len(ids) != len(set(ids)):
        errors.append("Duplicate ENTRY IDs detected in PROJECT_MEMORY.md")

    if errors:
        for err in errors:
            print(f"VALIDATION ERROR: {err}", file=sys.stderr)
        return 1

    print(f"VALID: {MEMORY_FILE.name} ({len(ids)} total curated entries, UTF-8 verified).")
    return 0


def cmd_hook(args: argparse.Namespace) -> int:
    """Lifecycle hook handler reading Antigravity hook JSON on stdin and writing JSON on stdout."""
    event = args.event
    try:
        raw_stdin = sys.stdin.read().strip()
        payload = json.loads(raw_stdin) if raw_stdin else {}
    except Exception:
        payload = {}

    try:
        conv_id = str(payload.get("conversationId") or "default")
        tpath_str = payload.get("transcriptPath") or ""
        last_input = str(payload.get("lastUserInput") or "")
        invocation_num = int(payload.get("invocationNum") or 0)

        if event == "session-start":
            ensure_memory_file()
            out = {
                "injectSteps": [
                    {
                        "systemMessage": {
                            "systemMessage": (
                                "Memória persistente ativa em PROJECT_MEMORY.md (gerenciada pela skill "
                                "`project-memory-monitor`). Consulte as regras do projeto e persista novas "
                                "regras, decisões arquiteturais e descobertas importantes em PROJECT_MEMORY.md."
                            )
                        }
                    }
                ]
            }
            print(json.dumps(out, ensure_ascii=False))
            return 0

        if event == "pre-invocation":
            state = load_state()
            conv_state = state.get("conversations", {}).get(conv_id, {})
            last_synced = int(conv_state.get("last_synced_step", -1))
            last_nudge = int(state.get("last_nudge_invocation", {}).get(conv_id, -99))

            has_rule_signal = bool(RULE_SIGNAL_REGEX.search(last_input))
            unsynced_user_turns = 0
            has_unsynced_commit = False

            if tpath_str and Path(tpath_str).exists():
                _, _, events = parse_transcript_turns(Path(tpath_str), min_step_index=last_synced)
                unsynced_user_turns = sum(1 for e in events if e["type"] == "user_request")
                has_unsynced_commit = any(e["type"] == "git_commit" for e in events)

            should_nudge = (
                (has_rule_signal or has_unsynced_commit or unsynced_user_turns >= 3)
                and (invocation_num - last_nudge >= 4 or invocation_num == 0)
            )

            if should_nudge:
                state.setdefault("last_nudge_invocation", {})[conv_id] = invocation_num
                save_state(state)
                out = {
                    "injectSteps": [
                        {
                            "ephemeralMessage": (
                                "[project-memory-monitor] Monitor de conversa detectou potenciais novas regras, "
                                "decisões ou commits ainda não sincronizados em PROJECT_MEMORY.md. "
                                "Se houver pontos-chave duráveis nesta interação, atualize PROJECT_MEMORY.md "
                                "usando a skill `project-memory-monitor` antes de encerrar."
                            )
                        }
                    ]
                }
                print(json.dumps(out, ensure_ascii=False))
                return 0

            print("{}")
            return 0

        if event == "stop":
            state = load_state()
            if tpath_str and Path(tpath_str).exists():
                _, max_step, _ = parse_transcript_turns(Path(tpath_str), min_step_index=-1)
                c_entry = state.setdefault("conversations", {}).setdefault(conv_id, {"last_synced_step": -1})
                c_entry["last_seen_step"] = max_step
                c_entry["updated_at"] = now_brt_str()
                save_state(state)
            print(json.dumps({"decision": "allow"}))
            return 0

    except Exception:
        # Never block or break the agent loop on any hook exception
        if event == "stop":
            print(json.dumps({"decision": "allow"}))
        else:
            print("{}")
        return 0

    print("{}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage and monitor persistent PROJECT_MEMORY.md")
    sub = parser.add_subparsers(dest="subcommand", required=True)

    sub.add_parser("init", help="Create PROJECT_MEMORY.md if missing")

    p_ins = sub.add_parser("inspect", help="Inspect unsynced conversation turns from transcript.jsonl")
    p_ins.add_argument("--transcript", help="Explicit path to transcript.jsonl")
    p_ins.add_argument("--since-last", action="store_true", help="Only return events after last synced step")
    p_ins.add_argument("--limit", type=int, default=40, help="Max events to output")

    p_add = sub.add_parser("add", help="Idempotently add or update a memory entry")
    p_add.add_argument("--category", required=True, choices=list(SECTIONS.keys()))
    p_add.add_argument("--id", help="Stable slug ID for deduplication")
    p_add.add_argument("--title", required=True, help="Short entry title")
    p_add.add_argument("--summary", required=True, help="Concise technical description")
    p_add.add_argument("--files", default="", help="Comma-separated repo-relative file paths")
    p_add.add_argument("--date", default=None, help="Optional YYYY-MM-DD override")

    p_batch = sub.add_parser("batch", help="Upsert a JSON list of entries from file or stdin")
    p_batch.add_argument("--input", help="JSON file path (reads stdin if omitted)")

    p_mark = sub.add_parser("mark-synced", help="Record transcript sync checkpoint")
    p_mark.add_argument("--transcript", help="Explicit path to transcript.jsonl")
    p_mark.add_argument("--conversation-id", help="Override conversation ID")
    p_mark.add_argument("--step-index", type=int, help="Override synced step index")

    sub.add_parser("validate", help="Validate PROJECT_MEMORY.md structure and markers")

    p_hook = sub.add_parser("hook", help="Antigravity lifecycle hook handler")
    p_hook.add_argument("--event", required=True, choices=["session-start", "pre-invocation", "stop"])

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    dispatch = {
        "init": cmd_init,
        "inspect": cmd_inspect,
        "add": cmd_add,
        "batch": cmd_batch,
        "mark-synced": cmd_mark_synced,
        "validate": cmd_validate,
        "hook": cmd_hook,
    }
    return dispatch[args.subcommand](args)


if __name__ == "__main__":
    sys.exit(main())
