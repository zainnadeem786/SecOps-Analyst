from app.services.parser import parse_log_content


def test_parse_apache_log_extracts_normalized_fields() -> None:
    raw_log = (
        '127.0.0.1 - - [09/Apr/2026:10:00:00 +0000] '
        '"GET /admin/login?next=/dashboard HTTP/1.1" 200 512 "-" "Mozilla/5.0"'
    )

    result = parse_log_content(raw_log)

    assert result.skipped_lines == 0
    assert len(result.events) == 1
    event = result.events[0]
    assert event.ip == "127.0.0.1"
    assert event.endpoint == "/admin/login"
    assert event.status_code == 200
    assert event.timestamp == "2026-04-09T10:00:00+00:00"


def test_parse_log_skips_invalid_lines_and_keeps_valid_entries() -> None:
    raw_log = "\n".join(
        [
            "this line should be ignored",
            '203.0.113.10 - - [09/Apr/2026:10:01:00 +0000] "GET /health HTTP/1.1" 200 120 "-" "curl/8.0"',
            "another bad line",
        ]
    )

    result = parse_log_content(raw_log)

    assert len(result.events) == 1
    assert result.skipped_lines == 2
    assert result.total_lines == 3


def test_parse_log_strips_utf8_bom_from_the_first_line() -> None:
    raw_log = (
        '\ufeff203.0.113.10 - - [09/Apr/2026:10:05:00 +0000] '
        '"POST /login HTTP/1.1" 401 182 "-" "Mozilla/5.0"'
    )

    result = parse_log_content(raw_log)

    assert len(result.events) == 1
    assert result.events[0].ip == "203.0.113.10"
