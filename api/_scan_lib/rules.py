"""Rule engine: confidence caps, deduplication, risk scoring."""

from __future__ import annotations

from _scan_lib.schema import (
    SEVERITY_ORDER,
    SEVERITY_WEIGHT,
    Finding,
    Verdict,
    cap_severity,
    severity_index,
)


def evaluate(target: str, findings: list[Finding]) -> Verdict:
    capped: list[Finding] = []
    index_by_id: dict[str, int] = {}
    for finding in findings:
        severity = cap_severity(finding.severity, finding.confidence)
        existing = index_by_id.get(finding.id)
        if existing is not None:
            if severity_index(severity) > severity_index(capped[existing].severity):
                capped[existing] = finding.with_severity(severity)
            continue
        index_by_id[finding.id] = len(capped)
        capped.append(finding.with_severity(severity))

    score = min(100, sum(SEVERITY_WEIGHT[f.severity] for f in capped))
    if capped:
        verdict_severity = max((f.severity for f in capped), key=severity_index)
    else:
        verdict_severity = "info"
    return Verdict(target=target, risk_score=score, severity=verdict_severity, findings=capped)