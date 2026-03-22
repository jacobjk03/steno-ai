"""Error types for the Steno SDK."""


class StenoError(Exception):
    """Raised when the Steno API returns a non-OK response."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.status = status

    def __repr__(self) -> str:
        return f"StenoError(code={self.code!r}, message={self.args[0]!r}, status={self.status})"
