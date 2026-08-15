"""TrustWatch verdict schema — stable JSON contract.

Shared by engine, bot, worker and website teaser. Not tied to Telegram.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, replace
from typing import Any, Literal

Severity = Literal["critical", "high", "medium", "low", "info"]
Confidence = Literal["high", "medium", "low"]

SEVERITY_ORDER: tuple[str, ...] = ("info", "low", "medium", "high", "critical")

SEVERITY_WEIGHT: dict[str, int] = {
    "critical": 50,
    "high": 30,
    "medium": 12,
    "low": 3,
    "info": 0,
}

CONFIDENCE_CAP: dict[str, Severity] = {
    "high": "critical",
    "medium": "high",
    "low": "low",
}


def severity_index(severity: str) -> int:
    return SEVERITY_ORDER.index(severity)


def max_severity(a: str, b: str) -> str:
    return a if severity_index(a) >= severity_index(b) else b


def cap_severity(severity: str, confidence: str) -> str:
    allowed = CONFIDENCE_CAP[confidence]
    if severity_index(severity) <= severity_index(allowed):
        return severity
    return allowed


@dataclass(slots=True)
class Finding:
    id: str
    severity: Severity
    title: str
    evidence: str
    confidence: Confidence
    explanation: str = ""
    remediation: str = ""

    def with_severity(self, severity: str) -> "Finding":
        return replace(self, severity=severity)

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclass(slots=True)
class Verdict:
    target: str
    risk_score: int
    severity: Severity
    findings: list[Finding] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "risk_score": self.risk_score,
            "severity": self.severity,
            "findings": [f.to_dict() for f in self.findings],
        }