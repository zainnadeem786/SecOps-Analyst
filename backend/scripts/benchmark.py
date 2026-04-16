from __future__ import annotations

import argparse
import json
import sys
import tracemalloc
from pathlib import Path
from time import perf_counter

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.correlation_engine import build_attack_campaigns
from app.services.detector import detect_suspicious_activity
from app.services.parser import parse_log_content
from app.services.risk_engine import calculate_risk_assessment
from app.services.rules_service import load_rules_config
from app.services.timeline import build_attack_timeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark log parsing and detection performance.")
    parser.add_argument(
        "--file",
        type=Path,
        default=Path("tests/fixtures/sample_access_demo.log"),
        help="Path to the log fixture or file to benchmark.",
    )
    parser.add_argument(
        "--line-counts",
        type=int,
        nargs="+",
        default=[100_000, 1_000_000],
        help="Target line counts to benchmark by amplifying the seed fixture.",
    )
    args = parser.parse_args()

    seed_lines = [line for line in args.file.read_text(encoding="utf-8").splitlines() if line.strip()]
    rules = load_rules_config()
    results = [run_benchmark(seed_lines=seed_lines, target_lines=line_count, file_path=args.file, rules=rules) for line_count in args.line_counts]
    print(json.dumps(results, indent=2))


def run_benchmark(*, seed_lines: list[str], target_lines: int, file_path: Path, rules) -> dict[str, object]:
    content = amplify_lines(seed_lines, target_lines)
    tracemalloc.start()

    started = perf_counter()
    parse_result = parse_log_content(content)
    parse_elapsed = perf_counter() - started

    started = perf_counter()
    detections = detect_suspicious_activity(parse_result.events, rules, inspected_events=parse_result.inspected_events)
    detect_elapsed = perf_counter() - started

    started = perf_counter()
    timeline = build_attack_timeline(parse_result.events, detections)
    campaigns = build_attack_campaigns(parse_result.events, detections, timeline, rules=rules)
    risk = calculate_risk_assessment(parse_result.events, detections, include_repeated_ip_bonus=True, rules=rules)
    correlate_elapsed = perf_counter() - started

    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    return {
        "file": str(file_path),
        "target_lines": target_lines,
        "total_lines": parse_result.total_lines,
        "events": len(parse_result.events),
        "detections": len(detections),
        "campaigns": len(campaigns),
        "timeline_steps": len(timeline),
        "risk_score": risk.risk_score,
        "timings_ms": {
            "parse": round(parse_elapsed * 1000, 2),
            "detect": round(detect_elapsed * 1000, 2),
            "correlate": round(correlate_elapsed * 1000, 2),
        },
        "peak_memory_mb": round(peak_bytes / (1024 * 1024), 3),
    }


def amplify_lines(seed_lines: list[str], target_lines: int) -> str:
    if target_lines <= 0:
        raise ValueError("target_lines must be positive.")
    if not seed_lines:
        raise ValueError("seed fixture must contain at least one line.")

    repeated = [seed_lines[index % len(seed_lines)] for index in range(target_lines)]
    return "\n".join(repeated)


if __name__ == "__main__":
    main()
