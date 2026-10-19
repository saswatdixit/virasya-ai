class VirasyaError(Exception):
    """Base error for user-facing CLI failures."""


class AudioError(VirasyaError):
    pass


class MissingAudioError(AudioError):
    pass


class EmptyAudioError(AudioError):
    pass


class CorruptAudioError(AudioError):
    pass


class UnsupportedFormatError(AudioError):
    pass


class TranscriptionProviderError(RuntimeError):
    """A provider could not be called or returned a provider-level failure."""
