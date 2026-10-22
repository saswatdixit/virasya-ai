"""Exceptions exposed by the standalone transcription workflow."""


class VirasyaError(Exception):
    """Base class for expected user-facing failures."""


class AudioError(VirasyaError):
    """The input audio cannot be used."""


class MissingAudioError(AudioError):
    pass


class EmptyAudioError(AudioError):
    pass


class AudioTooLongError(AudioError):
    pass


class CorruptAudioError(AudioError):
    pass


class UnsupportedFormatError(AudioError):
    pass


class UnsupportedLanguageError(VirasyaError):
    """The selected language is not configured for the current provider."""


class UploadError(VirasyaError):
    """An uploaded web request is malformed or exceeds local limits."""


class StorageError(VirasyaError):
    """A transcript could not be read or written safely."""


class MissingApiKeyError(VirasyaError):
    """The provider credential is absent when transcription was requested."""


class TranscriptionProviderError(VirasyaError):
    """The configured transcription provider cannot complete a request."""


class ProviderAuthenticationError(TranscriptionProviderError):
    pass


class ProviderRequestError(TranscriptionProviderError):
    pass


class ProviderLanguageError(TranscriptionProviderError):
    pass


class ProviderRateLimitError(TranscriptionProviderError):
    pass


class ProviderUnavailableError(TranscriptionProviderError):
    pass


class ProviderResponseError(TranscriptionProviderError):
    pass


class ProviderTimeoutError(TranscriptionProviderError):
    pass


class ProviderConnectionError(TranscriptionProviderError):
    pass
