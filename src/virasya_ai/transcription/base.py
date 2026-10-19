from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Dict

@dataclass
class TranscriptResult:
    """Provider-neutral transcript returned by a future transcription service."""

    text: str = ""
    language: str = "hi"
    status: str = "completed"
    error: str | None = None
    word_timestamps: list[dict[str, Any]] | None = None
    confidence: float | None = None
    audio_metadata: Dict[str, Any] = field(default_factory=dict)
    provider: str | None = None
    model: str | None = None
    provider_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "language": self.language,
            "status": self.status,
            "error": self.error,
            "word_timestamps": self.word_timestamps,
            "confidence": self.confidence,
            "audio_metadata": self.audio_metadata,
            "provider": self.provider,
            "model": self.model,
            "provider_metadata": self.provider_metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TranscriptResult":
        return cls(
            text=data.get("text", data.get("raw_text", "")),
            language=data.get("language", "hi"),
            status=data.get("status", "completed"),
            error=data.get("error"),
            word_timestamps=data.get("word_timestamps"),
            confidence=data.get("confidence"),
            audio_metadata=data.get("audio_metadata", {}),
            provider=data.get("provider"),
            model=data.get("model"),
            provider_metadata=data.get("provider_metadata", {}),
        )

@dataclass
class ReviewTask:
    source_filename: str
    language: str
    transcript: TranscriptResult | None = None
    asr_results: Dict[str, TranscriptResult] = field(default_factory=dict)
    model_differences: List[Dict[str, Any]] = field(default_factory=list)
    vocabulary_suggestions: List[Dict[str, Any]] = field(default_factory=list)
    verified_transcript: str = ""
    punctuated_model_text: str = ""
    punctuated_final_text: str = ""
    metadata: Dict[str, str] = field(default_factory=dict)
    review_status: str = "pending"  # pending, verified, rejected
    review: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": {
                "filename": self.source_filename,
                "language": self.language
            },
            "metadata": self.metadata,
            "transcript": self.transcript.to_dict() if self.transcript else None,
            "asr_results": {k: v.to_dict() for k, v in self.asr_results.items()},
            "analysis": {
                "model_differences": self.model_differences,
                "vocabulary_suggestions": self.vocabulary_suggestions
            },
            "verified_transcript": self.verified_transcript,
            "punctuated_model_text": self.punctuated_model_text,
            "punctuated_final_text": self.punctuated_final_text,
            "review_status": self.review_status,
            "review": self.review
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ReviewTask:
        source = data.get("source", {})
        analysis = data.get("analysis", {})
        
        asr_results = {
            k: TranscriptResult.from_dict(v)
            for k, v in data.get("asr_results", {}).items()
        }
        transcript_data = data.get("transcript")
        
        return cls(
            source_filename=source.get("filename", ""),
            language=source.get("language", "hi"),
            transcript=TranscriptResult.from_dict(transcript_data) if transcript_data else None,
            asr_results=asr_results,
            model_differences=analysis.get("model_differences", []),
            vocabulary_suggestions=analysis.get("vocabulary_suggestions", []),
            verified_transcript=data.get("verified_transcript", ""),
            punctuated_model_text=data.get("punctuated_model_text", ""),
            punctuated_final_text=data.get("punctuated_final_text", ""),
            metadata=data.get("metadata", {}),
            review_status=data.get("review_status", "pending"),
            review=data.get("review", {})
        )


