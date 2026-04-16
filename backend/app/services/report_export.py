"""Generate a polished PDF incident report."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.log_model import AttackCampaign, Detection, TimelineItem, UploadResponse
from app.services.analysis_helpers import is_sensitive_endpoint

PAGE_WIDTH = letter[0] - (1.3 * inch)
NAVY = colors.HexColor("#0b1220")
NAVY_DEEP = colors.HexColor("#111b30")
INK = colors.HexColor("#0f172a")
SLATE = colors.HexColor("#475569")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#cbd5e1")
SURFACE = colors.HexColor("#f8fafc")
SURFACE_ALT = colors.HexColor("#eef4ff")
SURFACE_DARK = colors.HexColor("#162238")
WHITE = colors.white
ACCENT = colors.HexColor("#38bdf8")
ACCENT_SOFT = colors.HexColor("#dbeafe")
WATERMARK_TEXT = "SecOps-Analyst Presented by Zain Nadeem | Python Developer | Cybersecurity Specialist"


def build_incident_report_pdf(result: UploadResponse) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.62 * inch,
        title="AI Log Analyzer Incident Report",
        author="SecOps-Analyst",
    )
    styles = _styles()
    story = [
        _banner(result, styles),
        Spacer(1, 0.16 * inch),
        _metadata_strip(result, styles),
        Spacer(1, 0.16 * inch),
        _section("Executive Summary", "A concise security snapshot for rapid triage and incident review.", styles),
        _summary_grid(result, styles),
        Spacer(1, 0.16 * inch),
        _section("Incident Narrative", "Executive synopsis and immediate next action from the current snapshot.", styles),
        _briefing_panel(result, styles),
        Spacer(1, 0.16 * inch),
        _section("Risk Assessment", "Canonical scoring, key drivers, and detection distribution.", styles),
        _risk_panel(result, styles),
        Spacer(1, 0.16 * inch),
        _section("AI Analysis", "Model-assisted or fallback guidance aligned to the canonical risk score.", styles),
        _ai_card(result, styles),
        PageBreak(),
        _section("Attack Campaigns", "Correlated attacker storylines grouped by suspicious behavior.", styles),
    ]
    story.extend([_campaign_card(campaign, styles) for campaign in result.attack_campaigns] or [_empty("No attack campaigns were present in this snapshot.", styles)])
    story.extend([Spacer(1, 0.14 * inch), _section("Attack Timeline", "Chronological suspicious steps reconstructed from detections and related activity.", styles), _timeline_table(result.timeline, styles)])
    story.extend([Spacer(1, 0.14 * inch), _section("Detections", "Rule-based findings with severity-aware visual treatment and compact evidence preview.", styles)])
    story.extend([_detection_card(detection, styles) for detection in result.detections] or [_empty("No detections were present in this snapshot.", styles)])
    document.build(story, onFirstPage=_decorate_first_page, onLaterPages=_decorate_page)
    return buffer.getvalue()


def _styles():
    styles = getSampleStyleSheet()
    styles["BodyText"].fontSize = 9.4
    styles["BodyText"].leading = 13
    styles["BodyText"].textColor = SLATE
    styles.add(ParagraphStyle("Kicker", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8.4, leading=10, textColor=colors.HexColor("#7dd3fc")))
    styles.add(ParagraphStyle("BannerTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=27, textColor=WHITE))
    styles.add(ParagraphStyle("BannerBody", parent=styles["BodyText"], fontSize=10, leading=14, textColor=colors.HexColor("#cbd5e1")))
    styles.add(ParagraphStyle("SectionTitle", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=INK))
    styles.add(ParagraphStyle("Label", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=7.8, leading=10, textColor=MUTED))
    styles.add(ParagraphStyle("Value", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=INK))
    styles.add(ParagraphStyle("Small", parent=styles["BodyText"], fontSize=8.5, leading=11.5, textColor=SLATE))
    styles.add(ParagraphStyle("Strong", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=INK))
    styles.add(ParagraphStyle("WhiteStrong", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=WHITE))
    styles.add(ParagraphStyle("CenterChip", parent=styles["BodyText"], fontName="Helvetica-Bold", alignment=TA_CENTER, fontSize=8, leading=10, textColor=WHITE))
    styles.add(ParagraphStyle("MutedWhite", parent=styles["BodyText"], fontSize=8.8, leading=12, textColor=colors.HexColor("#94a3b8")))
    styles.add(ParagraphStyle("Tiny", parent=styles["BodyText"], fontSize=7.4, leading=9.5, textColor=MUTED))
    return styles


def _banner(result: UploadResponse, styles) -> Table:
    risk = result.risk_assessment
    summary = f"{len(result.events)} events • {len(result.detections)} detections • {len(result.attack_campaigns)} campaigns • {len(result.timeline)} timeline steps"
    right = Table([[[_p("OVERALL RISK", styles["Kicker"]), _p(str(risk.risk_score), styles["BannerTitle"]), _chip(f"{risk.risk_level} priority", _risk_color(risk.risk_level), styles), Spacer(1, 0.03 * inch), _p(datetime.now(UTC).strftime("%b %d, %Y %H:%M UTC"), styles["BannerBody"])]]], colWidths=[1.65 * inch])
    right.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#162238")), ("BOX", (0, 0), (-1, -1), 1, _risk_color(risk.risk_level)), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    table = Table([[[_p("SECOPS INCIDENT REPORT", styles["Kicker"]), _p("AI Log Analyzer", styles["BannerTitle"]), _p("A correlation-aware investigation export with risk scoring, suspicious storylines, and analyst guidance.", styles["BannerBody"]), Spacer(1, 0.08 * inch), _p(summary, styles["BannerBody"])], right]], colWidths=[5.35 * inch, 1.65 * inch])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#1e293b")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 16), ("BOTTOMPADDING", (0, 0), (-1, -1), 16), ("LEFTPADDING", (0, 0), (-1, -1), 16), ("RIGHTPADDING", (0, 0), (-1, -1), 16)]))
    return table


def _section(title: str, body: str, styles) -> KeepTogether:
    divider = Table([[""]], colWidths=[PAGE_WIDTH])
    divider.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.8, ACCENT_SOFT),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return KeepTogether([_p(title, styles["SectionTitle"]), _p(body, styles["Small"]), Spacer(1, 0.025 * inch), divider])


def _summary_grid(result: UploadResponse, styles) -> Table:
    suspicious_ips = len({d.source_ip for d in result.detections})
    cards = [_stat(label, value, note, styles) for label, value, note in [("Parsed Events", len(result.events), "Normalized log rows"), ("Detections", len(result.detections), "Suspicious behaviors"), ("Campaigns", len(result.attack_campaigns), "Correlated attacker storylines"), ("Suspicious IPs", suspicious_ips, "Unique suspicious sources")]]
    table = Table([cards], colWidths=[1.8 * inch] * 4)
    table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _stat(label: str, value: int, note: str, styles) -> Table:
    table = Table([[[_p(label, styles["Label"]), _p(str(value), styles["Value"]), _p(note, styles["Small"])]]], colWidths=[1.72 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.85, LINE),
                ("LINEABOVE", (0, 0), (-1, -1), 2.2, ACCENT_SOFT),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def _risk_panel(result: UploadResponse, styles) -> Table:
    risk_color = _risk_color(result.risk_assessment.risk_level)
    left = Table([[[_p("Risk posture", styles["Strong"]), Spacer(1, 0.04 * inch), _p(f"Incident score {result.risk_assessment.risk_score} / 100", styles["BodyText"]), _p(f"AI score {result.ai_analysis.risk_score} • Source {result.ai_analysis.source.title()}", styles["Small"])]]], colWidths=[2.1 * inch])
    left.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.Color(risk_color.red, risk_color.green, risk_color.blue, alpha=0.09)), ("BOX", (0, 0), (-1, -1), 0.8, risk_color), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    right = Table([[[_p("Risk score gauge", styles["Strong"]), _risk_bar(result.risk_assessment.risk_score, result.risk_assessment.risk_level), Spacer(1, 0.08 * inch), _p("Detection severity distribution", styles["Strong"]), _severity_chart(result.detections)]]], colWidths=[5.0 * inch])
    right.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.75, LINE), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    table = Table([[left, right]], colWidths=[2.15 * inch, 5.05 * inch])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _risk_bar(score: int, level: str) -> Drawing:
    drawing = Drawing(280, 48)
    drawing.add(Rect(12, 22, 78, 10, fillColor=colors.HexColor("#10b981"), strokeColor=None, rx=4, ry=4))
    drawing.add(Rect(90, 22, 104, 10, fillColor=colors.HexColor("#f59e0b"), strokeColor=None, rx=4, ry=4))
    drawing.add(Rect(194, 22, 74, 10, fillColor=colors.HexColor("#ef4444"), strokeColor=None, rx=4, ry=4))
    marker = 12 + (256 * (max(0, min(score, 100)) / 100))
    drawing.add(Line(marker, 16, marker, 38, strokeColor=_risk_color(level), strokeWidth=2))
    drawing.add(String(marker - 8, 4, str(score), fontName="Helvetica-Bold", fontSize=8, fillColor=_risk_color(level)))
    drawing.add(String(12, 10, "Low", fontName="Helvetica", fontSize=7, fillColor=MUTED))
    drawing.add(String(122, 10, "Medium", fontName="Helvetica", fontSize=7, fillColor=MUTED))
    drawing.add(String(223, 10, "High", fontName="Helvetica", fontSize=7, fillColor=MUTED))
    return drawing


def _severity_chart(detections: list[Detection]) -> Drawing:
    drawing = Drawing(280, 82)
    counts = Counter(d.severity for d in detections)
    ordered = [level for level in ["Critical", "High", "Medium", "Moderate", "Low"] if counts.get(level, 0)]
    max_count = max(counts.values(), default=1)
    y = 58
    if not ordered:
        drawing.add(String(12, 32, "No detections available.", fontName="Helvetica", fontSize=8, fillColor=MUTED))
        return drawing
    for level in ordered:
        count = counts[level]
        drawing.add(String(12, y + 2, level, fontName="Helvetica", fontSize=8, fillColor=SLATE))
        drawing.add(Rect(72, y, 160, 8, fillColor=colors.HexColor("#e2e8f0"), strokeColor=None, rx=3, ry=3))
        drawing.add(Rect(72, y, max(10, 160 * (count / max_count)), 8, fillColor=_severity_color(level), strokeColor=None, rx=3, ry=3))
        drawing.add(String(240, y + 1, str(count), fontName="Helvetica-Bold", fontSize=8, fillColor=INK))
        y -= 16
    return drawing


def _campaign_card(campaign: AttackCampaign, styles) -> KeepTogether:
    phases = ", ".join(phase.phase for phase in campaign.phases if phase.events) or "No populated phases"
    highlight = next((event for phase in campaign.phases for event in phase.events), None)
    details = f"Highlight: {highlight.title} on {highlight.endpoint} at {_fmt_ts(highlight.timestamp)}." if highlight else "No compact phase highlight was available."
    head = Table([[[_p(campaign.campaign_name, styles["WhiteStrong"]), _p(f"{campaign.attacker_ip} • Risk {campaign.risk_level} ({campaign.risk_score}) • Severity {campaign.severity}", styles["BannerBody"])]]], colWidths=[PAGE_WIDTH])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _severity_color(campaign.severity)), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    body = Table([[[_p("Active phases", styles["Label"]), _p(phases, styles["BodyText"]), Spacer(1, 0.03 * inch), _p(details, styles["Small"])]]], colWidths=[PAGE_WIDTH])
    body.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.75, LINE), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    return KeepTogether([head, body, Spacer(1, 0.1 * inch)])


def _timeline_table(timeline: list[TimelineItem], styles) -> Table:
    if not timeline:
        return _empty("No suspicious timeline steps were present in this snapshot.", styles)
    rows = [[_p("Timestamp", styles["CenterChip"]), _p("Source", styles["CenterChip"]), _p("Suspicious step", styles["CenterChip"]), _p("Severity", styles["CenterChip"])]]
    rows.extend([[_p(_fmt_ts(item.timestamp), styles["Small"]), _p(item.ip, styles["Small"]), _p(f"<b>{escape(item.title)}</b><br/>{escape(item.description)}", styles["Small"], markup=True), _p(item.severity, styles["Small"])] for item in timeline])
    table = Table(rows, colWidths=[1.35 * inch, 1.1 * inch, 4.0 * inch, 0.85 * inch], repeatRows=1)
    cmds = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("BOX", (0, 0), (-1, -1), 0.75, LINE), ("GRID", (0, 1), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]
    for row, item in enumerate(timeline, start=1):
        cmds.append(("BACKGROUND", (0, row), (-1, row), SURFACE if row % 2 else colors.HexColor("#eef2ff")))
        cmds.append(("TEXTCOLOR", (3, row), (3, row), _severity_color(item.severity)))
        cmds.append(("FONTNAME", (3, row), (3, row), "Helvetica-Bold"))
    table.setStyle(TableStyle(cmds))
    return table


def _ai_card(result: UploadResponse, styles) -> Table:
    content = [[_p("AI source", styles["Label"]), _p(result.ai_analysis.source.title(), styles["Strong"])], [_p("Risk alignment", styles["Label"]), _p(f"{result.ai_analysis.risk_level} ({result.ai_analysis.risk_score})", styles["Strong"])], [_p("Explanation", styles["Label"]), _p(result.ai_analysis.explanation, styles["BodyText"])], [_p("Recommended action", styles["Label"]), _p(result.ai_analysis.recommended_action, styles["BodyText"])]]
    if result.ai_analysis.warning:
        content.append([_p("Warning", styles["Label"]), _p(result.ai_analysis.warning, styles["Small"])])
    table = Table(content, colWidths=[1.55 * inch, 5.65 * inch])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.75, LINE), ("GRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    return table


def _detection_card(detection: Detection, styles) -> KeepTogether:
    evidence = "<br/>".join(f"• {escape(item)}" for item in detection.evidence[:4]) if detection.evidence else "No compact evidence preview was attached."
    head = Table([[[_p(_humanize(detection.type), styles["WhiteStrong"]), _p(f"{detection.source_ip} • Severity {detection.severity} • Count {detection.count}", styles["BannerBody"])]]], colWidths=[PAGE_WIDTH])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _severity_color(detection.severity)), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    body = Table([[[_p("Description", styles["Label"]), _p(detection.description, styles["BodyText"]), Spacer(1, 0.03 * inch), _p("Evidence preview", styles["Label"]), _p(evidence, styles["Small"], markup=True)]]], colWidths=[PAGE_WIDTH])
    body.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.75, LINE), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    return KeepTogether([head, body, Spacer(1, 0.1 * inch)])


def _empty(message: str, styles) -> Table:
    table = Table([[_p(message, styles["BodyText"])]], colWidths=[PAGE_WIDTH])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.75, LINE), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    return table


def _chip(label: str, color: colors.Color, styles) -> Table:
    table = Table([[_p(label, styles["CenterChip"])]], colWidths=[1.2 * inch])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return table


def _p(text: str, style, *, markup: bool = False) -> Paragraph:
    return Paragraph((text if markup else escape(text)).replace("\n", "<br/>"), style)


def _fmt_ts(value: str) -> str:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC).strftime("%b %d, %Y %H:%M UTC")
    except ValueError:
        return value


def _humanize(value: str) -> str:
    return value.replace("_", " ").title()


def _risk_color(level: str) -> colors.Color:
    return {"Low": colors.HexColor("#10b981"), "Medium": colors.HexColor("#f59e0b"), "High": colors.HexColor("#ef4444"), "Critical": colors.HexColor("#e11d48")}.get(level, colors.HexColor("#38bdf8"))


def _severity_color(level: str) -> colors.Color:
    return {"Low": colors.HexColor("#10b981"), "Moderate": colors.HexColor("#eab308"), "Medium": colors.HexColor("#f59e0b"), "High": colors.HexColor("#ef4444"), "Critical": colors.HexColor("#e11d48")}.get(level, colors.HexColor("#38bdf8"))


def _decorate_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, letter[1] - 0.42 * inch, letter[0] - doc.rightMargin, letter[1] - 0.42 * inch)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(doc.leftMargin, 0.32 * inch, "AI Log Analyzer • SOC Incident Report")
    canvas.drawRightString(letter[0] - doc.rightMargin, 0.32 * inch, f"Page {canvas.getPageNumber()}")
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.setFont("Helvetica-Oblique", 6.6)
    canvas.drawCentredString(letter[0] / 2, 0.18 * inch, WATERMARK_TEXT)
    canvas.restoreState()


def _chip(label: str, color: colors.Color, styles, *, width: float = 1.2 * inch) -> Table:
    table = Table([[_p(label, styles["CenterChip"])]], colWidths=[width])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return table


def _meta_card(label: str, value: str, note: str, styles) -> Table:
    table = Table([[[_p(label, styles["Label"]), _p(value, styles["Strong"]), _p(note, styles["Small"])]]], colWidths=[1.72 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.85, LINE),
                ("LINEABOVE", (0, 0), (-1, -1), 2, ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def _metadata_strip(result: UploadResponse, styles) -> Table:
    suspicious_ips = len({d.source_ip for d in result.detections})
    lead_detection = max(
        result.detections,
        key=lambda detection: (_severity_rank(detection.severity), detection.count, detection.source_ip),
        default=None,
    )
    cards = [
        _meta_card("Prepared by", "SecOps-Analyst", "Professional investigation export", styles),
        _meta_card("Presenter", "Zain Nadeem", "Python Developer | Cybersecurity Specialist", styles),
        _meta_card(
            "Lead Signal",
            _humanize(lead_detection.type) if lead_detection else "No detections",
            f"{lead_detection.source_ip} | {lead_detection.count} related findings" if lead_detection else "No suspicious signal was produced.",
            styles,
        ),
        _meta_card("Coverage", f"{suspicious_ips} suspicious IPs", f"{len(result.attack_campaigns)} campaigns | AI source {result.ai_analysis.source.title()}", styles),
    ]
    table = Table([cards], colWidths=[1.8 * inch] * 4)
    table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _content_card(title: str, body: str, styles, *, note: str | None = None, width: float = 3.48 * inch, background: colors.Color = WHITE) -> Table:
    stack = [_p(title, styles["Strong"]), Spacer(1, 0.04 * inch), _p(body, styles["BodyText"])]
    if note:
        stack.extend([Spacer(1, 0.06 * inch), _p(note, styles["Small"])])
    table = Table([[stack]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.85, LINE),
                ("LINEABOVE", (0, 0), (-1, -1), 2, ACCENT_SOFT),
                ("TOPPADDING", (0, 0), (-1, -1), 13),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    return table


def _severity_rank(level: str) -> int:
    return {"Low": 1, "Moderate": 2, "Medium": 3, "High": 4, "Critical": 5}.get(level, 0)


def _incident_synopsis(result: UploadResponse) -> str:
    suspicious_ips = len({detection.source_ip for detection in result.detections})
    if not result.detections:
        return "No suspicious detections were produced for this upload. The analyzed access log did not match the current rule set."

    primary_detection = max(result.detections, key=lambda item: (_severity_rank(item.severity), item.count, item.source_ip))
    time_window = ""
    if result.timeline:
        time_window = f" Activity was observed from {_fmt_ts(result.timeline[0].timestamp)} through {_fmt_ts(result.timeline[-1].timestamp)}."

    return (
        f"Correlated analysis identified {len(result.attack_campaigns)} campaign(s) across {suspicious_ips} suspicious source IP(s). "
        f"The strongest signal is {_humanize(primary_detection.type).lower()} from {primary_detection.source_ip}, with "
        f"{primary_detection.count} related finding(s). Canonical incident posture is "
        f"{result.risk_assessment.risk_level.lower()} at {result.risk_assessment.risk_score}/100.{time_window}"
    )


def _briefing_panel(result: UploadResponse, styles) -> Table:
    source_note = (
        "Model-assisted narrative aligned to the canonical risk assessment."
        if result.ai_analysis.source == "ollama"
        else "Fallback analyst narrative aligned to the canonical risk assessment."
    )
    if result.ai_analysis.warning:
        source_note = f"{source_note} {result.ai_analysis.warning}"

    left = _content_card(
        "Incident Synopsis",
        _incident_synopsis(result),
        styles,
        note=f"Risk posture: {result.risk_assessment.risk_level} ({result.risk_assessment.risk_score}/100)",
        width=2.55 * inch,
    )
    middle = _content_card(
        "Recommended Action",
        result.ai_analysis.recommended_action,
        styles,
        note="Immediate analyst action recommended for the current snapshot.",
        width=2.55 * inch,
        background=SURFACE_ALT,
    )
    right = _content_card(
        "Operational Outlook",
        f"{result.ai_analysis.source.title()} guidance with {len(result.ai_analysis.next_steps or [])} next step(s) prepared.",
        styles,
        note=source_note,
        width=2.05 * inch,
    )
    table = Table([[left, middle, right]], colWidths=[2.55 * inch, 2.55 * inch, 2.1 * inch])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _risk_surface(level: str) -> colors.Color:
    return {"Low": colors.HexColor("#ecfdf5"), "Medium": colors.HexColor("#fffbeb"), "High": colors.HexColor("#fef2f2"), "Critical": colors.HexColor("#fff1f2")}.get(level, SURFACE)


def _risk_summary_text(result: UploadResponse) -> str:
    suspicious_ips = len({detection.source_ip for detection in result.detections})
    return (
        f"This upload produced {len(result.detections)} suspicious detection(s) across {suspicious_ips} suspicious IP(s), "
        f"yielding {len(result.attack_campaigns)} campaign(s) for investigation."
    )


def _risk_driver_markup(result: UploadResponse) -> str:
    drivers: list[str] = []
    detection_types = {detection.type for detection in result.detections}
    if "brute_force" in detection_types:
        drivers.append("Credential attack indicators were detected.")
    if "scanning_fuzzing" in detection_types:
        drivers.append("404-driven scanning or fuzzing behavior was observed.")
    if "multi_endpoint_probe" in detection_types:
        drivers.append("Broad endpoint reconnaissance expanded attacker coverage.")
    if any(is_sensitive_endpoint(event.endpoint) for event in result.events):
        drivers.append("Sensitive or administrative paths were touched during activity.")
    if any(detection.count >= 10 for detection in result.detections):
        drivers.append("High-frequency suspicious bursts increased urgency.")
    if len({detection.source_ip for detection in result.detections}) >= 2:
        drivers.append("Repeated suspicious IP involvement widened the incident scope.")
    if not drivers:
        drivers.append("No elevated risk drivers were required for this report.")
    return "<br/>".join(f"&bull; {escape(driver)}" for driver in drivers[:4])


def _banner(result: UploadResponse, styles) -> Table:
    risk = result.risk_assessment
    generated_at = datetime.now(UTC).strftime("%b %d, %Y %H:%M UTC")
    suspicious_ips = len({detection.source_ip for detection in result.detections})
    lead_detection = max(
        result.detections,
        key=lambda detection: (_severity_rank(detection.severity), detection.count, detection.source_ip),
        default=None,
    )
    summary = (
        f"{len(result.events)} parsed events | {len(result.detections)} detections | "
        f"{len(result.attack_campaigns)} campaigns | {len(result.timeline)} timeline steps"
    )
    metrics = Table(
        [[
            _chip(f"{len(result.attack_campaigns)} campaign(s)", colors.HexColor("#10203a"), styles, width=1.48 * inch),
            _chip(f"{suspicious_ips} suspicious IPs", colors.HexColor("#17314d"), styles, width=1.48 * inch),
            _chip(f"{len(result.ai_analysis.next_steps or [])} response steps", _risk_color(risk.risk_level), styles, width=1.48 * inch),
        ]],
        colWidths=[1.5 * inch, 1.5 * inch, 1.5 * inch],
    )
    metrics.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    right = Table(
        [[[
            _p("INCIDENT PRIORITY", styles["Kicker"]),
            _p(str(risk.risk_score), styles["BannerTitle"]),
            _chip(f"{risk.risk_level} risk", _risk_color(risk.risk_level), styles, width=1.45 * inch),
            Spacer(1, 0.05 * inch),
            _p("Canonical score across the analyzed snapshot.", styles["BannerBody"]),
            Spacer(1, 0.05 * inch),
            _p(f"AI source: {result.ai_analysis.source.title()}", styles["BannerBody"]),
            _p(f"Primary signal: {_humanize(lead_detection.type) if lead_detection else 'No suspicious detections'}", styles["BannerBody"]),
        ]]],
        colWidths=[2.05 * inch],
    )
    right.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE_DARK),
                ("BOX", (0, 0), (-1, -1), 1, _risk_color(risk.risk_level)),
                ("LINEABOVE", (0, 0), (-1, -1), 2.2, _risk_color(risk.risk_level)),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    left = [[
        _p("CONFIDENTIAL SECURITY INVESTIGATION EXPORT", styles["Kicker"]),
        _p("AI Log Analyzer Incident Report", styles["BannerTitle"]),
        _p(
            "A premium SOC briefing that combines campaign correlation, timeline reconstruction, risk analytics, and guided response actions in one analyst-ready document.",
            styles["BannerBody"],
        ),
        Spacer(1, 0.09 * inch),
        metrics,
        Spacer(1, 0.08 * inch),
        _p(summary, styles["BannerBody"]),
        _p(
            f"Lead signal: {lead_detection.source_ip} | {_humanize(lead_detection.type)}" if lead_detection else "Lead signal: No suspicious detections were produced.",
            styles["MutedWhite"],
        ),
        _p(f"Prepared for security operations review | Generated {generated_at}", styles["BannerBody"]),
    ]]
    table = Table([[left[0], right]], colWidths=[5.15 * inch, 2.05 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#1e293b")),
                ("LINEBELOW", (0, 0), (-1, -1), 1.4, ACCENT),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 18),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 18),
                ("LEFTPADDING", (0, 0), (-1, -1), 18),
                ("RIGHTPADDING", (0, 0), (-1, -1), 18),
            ]
        )
    )
    return table


def _summary_grid(result: UploadResponse, styles) -> Table:
    suspicious_ips = len({d.source_ip for d in result.detections})
    cards = [_stat(label, value, note, styles) for label, value, note in [("Parsed Events", len(result.events), "Normalized web access rows"), ("Detections", len(result.detections), "Suspicious behaviors identified"), ("Suspicious IPs", suspicious_ips, "Unique attacker sources"), ("Timeline Steps", len(result.timeline), "Chronological suspicious milestones")]]
    table = Table([cards], colWidths=[1.8 * inch] * 4)
    table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _risk_panel(result: UploadResponse, styles) -> Table:
    risk_color = _risk_color(result.risk_assessment.risk_level)
    left = Table(
        [[[
            _p("CANONICAL RISK", styles["Kicker"]),
            _p(str(result.risk_assessment.risk_score), styles["BannerTitle"]),
            _chip(f"{result.risk_assessment.risk_level} priority", risk_color, styles, width=1.6 * inch),
            Spacer(1, 0.06 * inch),
            _p(_risk_summary_text(result), styles["BannerBody"]),
            Spacer(1, 0.08 * inch),
            _p("KEY DRIVERS", styles["Kicker"]),
            _p(_risk_driver_markup(result), styles["BannerBody"], markup=True),
        ]]],
        colWidths=[2.45 * inch],
    )
    left.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY_DEEP),
                ("BOX", (0, 0), (-1, -1), 1, risk_color),
                ("LINEABOVE", (0, 0), (-1, -1), 2, risk_color),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
            ]
        )
    )
    right = Table(
        [[[
            _p("Risk Score Gauge", styles["Strong"]),
            _risk_bar(result.risk_assessment.risk_score, result.risk_assessment.risk_level),
            Spacer(1, 0.08 * inch),
            _p("Detection Severity Distribution", styles["Strong"]),
            _severity_chart(result.detections),
        ]]],
        colWidths=[4.72 * inch],
    )
    right.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.85, LINE),
                ("LINEABOVE", (0, 0), (-1, -1), 2, ACCENT_SOFT),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    table = Table([[left, right]], colWidths=[2.48 * inch, 4.72 * inch])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _source_color(source: str) -> colors.Color:
    if source == "ollama":
        return colors.HexColor("#0891b2")
    return colors.HexColor("#6366f1")


def _campaign_highlight_markup(campaign: AttackCampaign) -> str:
    highlights: list[str] = []
    for phase in campaign.phases:
        for event in phase.events[:2]:
            highlights.append(f"{phase.phase}: {event.title} on {event.endpoint} at {_fmt_ts(event.timestamp)}")
            if len(highlights) >= 4:
                break
        if len(highlights) >= 4:
            break
    if not highlights and campaign.timeline:
        highlights.extend(f"{item.title} at {_fmt_ts(item.timestamp)}" for item in campaign.timeline[:3])
    if not highlights:
        highlights.append("No compact campaign highlights were available.")
    return "<br/>".join(f"&bull; {escape(item)}" for item in highlights)


def _campaign_phase_markup(campaign: AttackCampaign) -> str:
    phase_lines: list[str] = []
    for phase in campaign.phases:
        if not phase.events:
            continue
        first_event = phase.events[0]
        phase_lines.append(f"{phase.phase} ({len(phase.events)}) - {first_event.title}")
    if not phase_lines:
        phase_lines.append("No populated phases were attached.")
    return "<br/>".join(f"&bull; {escape(line)}" for line in phase_lines[:4])


def _campaign_card(campaign: AttackCampaign, styles) -> KeepTogether:
    populated_phases = [phase.phase for phase in campaign.phases if phase.events]
    phase_text = ", ".join(populated_phases) if populated_phases else "No populated phases"
    header = Table([[[_p(campaign.campaign_name, styles["WhiteStrong"]), _p(f"Attacker {campaign.attacker_ip} | {len(populated_phases)} active phase(s) | {len(campaign.timeline)} timeline step(s)", styles["BannerBody"])], [_chip(f"{campaign.risk_level} {campaign.risk_score}", _risk_color(campaign.risk_level), styles, width=1.3 * inch), Spacer(1, 0.04 * inch), _chip(campaign.severity, _severity_color(campaign.severity), styles, width=1.15 * inch)]]], colWidths=[5.55 * inch, 1.65 * inch])
    header.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY_DEEP), ("BOX", (0, 0), (-1, -1), 1, _severity_color(campaign.severity)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    details = Table([[ _p("Attacker IP", styles["Label"]), _p(campaign.attacker_ip, styles["Strong"])], [_p("Severity", styles["Label"]), _p(campaign.severity, styles["Strong"])], [_p("Risk posture", styles["Label"]), _p(f"{campaign.risk_level} ({campaign.risk_score}/100)", styles["Strong"])], [_p("Active phases", styles["Label"]), _p(phase_text, styles["BodyText"])], [_p("Timeline steps", styles["Label"]), _p(str(len(campaign.timeline)), styles["Strong"])]], colWidths=[0.95 * inch, 1.15 * inch])
    details.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("GRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
    phases = Table([[[_p("Phase Coverage", styles["Strong"]), Spacer(1, 0.04 * inch), _p(_campaign_phase_markup(campaign), styles["Small"], markup=True)]]], colWidths=[1.9 * inch])
    phases.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("LINEABOVE", (0, 0), (-1, -1), 2, ACCENT_SOFT), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    highlights = Table([[[_p("Campaign Highlights", styles["Strong"]), Spacer(1, 0.04 * inch), _p(_campaign_highlight_markup(campaign), styles["Small"], markup=True)]]], colWidths=[3.0 * inch])
    highlights.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE_ALT), ("BOX", (0, 0), (-1, -1), 0.8, ACCENT_SOFT), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    body = Table([[details, phases, highlights]], colWidths=[2.2 * inch, 2.0 * inch, 3.0 * inch])
    body.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    return KeepTogether([header, body, Spacer(1, 0.1 * inch)])


def _timeline_table(timeline: list[TimelineItem], styles) -> Table:
    if not timeline:
        return _empty("No suspicious timeline steps were present in this snapshot.", styles)
    rows = [[_p("#", styles["CenterChip"]), _p("Timestamp", styles["CenterChip"]), _p("Source", styles["CenterChip"]), _p("Suspicious Step", styles["CenterChip"]), _p("Severity", styles["CenterChip"])]]
    rows.extend([[_p(str(index), styles["CenterChip"]), _p(_fmt_ts(item.timestamp), styles["Small"]), _p(item.ip, styles["Small"]), _p(f"<b>{escape(item.title)}</b><br/>{escape(item.description)}", styles["Small"], markup=True), _p(item.severity, styles["Small"])] for index, item in enumerate(timeline, start=1)])
    table = Table(rows, colWidths=[0.3 * inch, 1.34 * inch, 1.18 * inch, 3.56 * inch, 0.82 * inch], repeatRows=1)
    commands = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("GRID", (1, 1), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]
    for row_index, item in enumerate(timeline, start=1):
        commands.append(("BACKGROUND", (1, row_index), (-1, row_index), SURFACE if row_index % 2 else SURFACE_ALT))
        commands.append(("BACKGROUND", (0, row_index), (0, row_index), _severity_color(item.severity)))
        commands.append(("TEXTCOLOR", (4, row_index), (4, row_index), _severity_color(item.severity)))
        commands.append(("FONTNAME", (4, row_index), (4, row_index), "Helvetica-Bold"))
        commands.append(("TEXTCOLOR", (0, row_index), (0, row_index), WHITE))
    table.setStyle(TableStyle(commands))
    return table


def _next_steps_row(steps: list[str], styles) -> Table:
    cards = []
    normalized_steps = steps[:3] or ["No next steps were attached."]
    width = 7.2 * inch / len(normalized_steps)
    for index, step in enumerate(normalized_steps, start=1):
        card = Table([[[_p(f"Step {index:02d}", styles["Label"]), Spacer(1, 0.04 * inch), _p(step, styles["BodyText"])]]], colWidths=[width - (0.08 * inch)])
        card.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE_ALT), ("BOX", (0, 0), (-1, -1), 0.8, ACCENT_SOFT), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
        cards.append(card)
    table = Table([cards], colWidths=[width] * len(cards))
    table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _ai_card(result: UploadResponse, styles) -> KeepTogether:
    header = Table([[[_p("Analyst Guidance", styles["WhiteStrong"]), _p("AI narrative aligned to the canonical incident score.", styles["BannerBody"])], [_chip(result.ai_analysis.source.title(), _source_color(result.ai_analysis.source), styles, width=1.2 * inch), Spacer(1, 0.04 * inch), _chip(f"{result.ai_analysis.risk_level} {result.ai_analysis.risk_score}", _risk_color(result.ai_analysis.risk_level), styles, width=1.45 * inch)]]], colWidths=[5.45 * inch, 1.75 * inch])
    header.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY_DEEP), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#1e293b")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    explanation = _content_card("Explanation", result.ai_analysis.explanation, styles, width=3.55 * inch)
    warning = result.ai_analysis.warning if result.ai_analysis.warning else "No runtime warning was attached to this analysis."
    action = _content_card("Recommended Action", result.ai_analysis.recommended_action, styles, note=warning, width=3.65 * inch, background=SURFACE_ALT)
    body = Table([[explanation, action]], colWidths=[3.55 * inch, 3.65 * inch])
    body.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    next_steps = _next_steps_row(result.ai_analysis.next_steps or ["No next steps were attached."], styles)
    return KeepTogether([header, body, Spacer(1, 0.08 * inch), next_steps])


def _evidence_markup(detection: Detection) -> str:
    if not detection.evidence:
        return "No compact evidence preview was attached."
    preview = list(detection.evidence[:4])
    if len(detection.evidence) > 4:
        preview.append("Additional evidence exists in the API payload.")
    return "<br/>".join(f"&bull; {escape(item)}" for item in preview)


def _detection_card(detection: Detection, styles) -> KeepTogether:
    header = Table([[[_p(_humanize(detection.type), styles["WhiteStrong"]), _p(f"Source {detection.source_ip} | Severity {detection.severity} | Count {detection.count}", styles["BannerBody"])], [_chip(detection.severity, _severity_color(detection.severity), styles, width=1.15 * inch)]]], colWidths=[5.95 * inch, 1.25 * inch])
    header.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY_DEEP), ("BOX", (0, 0), (-1, -1), 1, _severity_color(detection.severity)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    overview = Table([[ _p("Source IP", styles["Label"]), _p(detection.source_ip, styles["Strong"])], [_p("Count", styles["Label"]), _p(str(detection.count), styles["Strong"])], [_p("Severity", styles["Label"]), _p(detection.severity, styles["Strong"])], [_p("Evidence", styles["Label"]), _p(str(len(detection.evidence)), styles["Strong"])]], colWidths=[0.75 * inch, 1.15 * inch])
    overview.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("GRID", (0, 0), (-1, -1), 0.5, LINE), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
    description = Table([[[_p("Description", styles["Strong"]), Spacer(1, 0.04 * inch), _p(detection.description, styles["BodyText"])]]], colWidths=[2.45 * inch])
    description.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    evidence = Table([[[_p("Evidence Preview", styles["Strong"]), Spacer(1, 0.04 * inch), _p(_evidence_markup(detection), styles["Small"], markup=True)]]], colWidths=[2.85 * inch])
    evidence.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE_ALT), ("BOX", (0, 0), (-1, -1), 0.8, ACCENT_SOFT), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12)]))
    body = Table([[overview, description, evidence]], colWidths=[2.0 * inch, 2.4 * inch, 2.8 * inch])
    body.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SURFACE), ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    return KeepTogether([header, body, Spacer(1, 0.1 * inch)])


def _draw_page_watermark(canvas) -> None:
    canvas.saveState()
    try:
        canvas.setFillAlpha(0.18)
    except AttributeError:
        pass
    canvas.setFillColor(colors.HexColor("#9fb0c7"))
    canvas.setFont("Helvetica-Oblique", 6.9)
    canvas.drawCentredString(
        letter[0] / 2,
        0.28 * inch,
        "SecOps-Analyst Presented by Zain Nadeem | Python Developer | Cybersecurity Specialist",
    )
    canvas.restoreState()


def _decorate_first_page(canvas, doc) -> None:
    _decorate_page(canvas, doc, emphasize=True)


def _decorate_page(canvas, doc, emphasize: bool = False) -> None:
    canvas.saveState()
    canvas.setStrokeColor(ACCENT if emphasize else LINE)
    canvas.setLineWidth(1 if emphasize else 0.6)
    canvas.line(doc.leftMargin, letter[1] - 0.42 * inch, letter[0] - doc.rightMargin, letter[1] - 0.42 * inch)
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, 0.47 * inch, letter[0] - doc.rightMargin, 0.47 * inch)
    _draw_page_watermark(canvas)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(letter[0] - doc.rightMargin, 0.28 * inch, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()
