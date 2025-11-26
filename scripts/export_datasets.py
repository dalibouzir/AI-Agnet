#!/usr/bin/env python3
"""Extract router and writer datasets from orchestrator logs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import IO, Iterable, Tuple


def _iter_events(handle: IO[str]) -> Iterable[Tuple[str, dict]]:
    for raw_line in handle:
        line = raw_line.strip()
        if "\t" not in line:
            continue
        tag, payload = line.split("\t", 1)
        if tag not in {"ROUTER_DECISION", "WRITER_SAMPLE"}:
            continue
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        yield tag, data


def _open_input(path: Path | None) -> IO[str]:
    if path is None:
        return sys.stdin
    return path.open("r", encoding="utf-8")


def _write_jsonl(path: Path, records: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract router and writer datasets from orchestrator logs."
    )
    parser.add_argument(
        "logfile",
        nargs="?",
        type=Path,
        help="Path to orchestrator log file (defaults to stdin).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("datasets"),
        help="Directory to place the dataset files (default: ./datasets).",
    )
    args = parser.parse_args()

    router_records: list[dict] = []
    writer_records: list[dict] = []

    with _open_input(args.logfile) as handle:
        for tag, payload in _iter_events(handle):
            if tag == "ROUTER_DECISION":
                router_records.append(payload)
            elif tag == "WRITER_SAMPLE":
                writer_records.append(payload)

    if not router_records and not writer_records:
        print("No dataset events detected in input.", file=sys.stderr)
        return 1

    router_path = args.output_dir / "router_dataset.jsonl"
    writer_path = args.output_dir / "writer_dataset.jsonl"

    if router_records:
        _write_jsonl(router_path, router_records)
        print(f"Wrote {len(router_records)} router samples → {router_path}")
    if writer_records:
        _write_jsonl(writer_path, writer_records)
        print(f"Wrote {len(writer_records)} writer samples → {writer_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
