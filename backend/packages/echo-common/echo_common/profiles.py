"""Named configuration presets, switched with one env var.

A service declares bundles of tuning values in ``PROFILES`` and selects one
via ``<PREFIX>PROFILE`` (e.g. ``ECHO_BP_PROFILE=strict``). Precedence:
explicit env var > profile value > field default, so a profile never hides a
deliberate per-environment override.
"""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import model_validator
from pydantic_settings import BaseSettings


class ProfiledSettings(BaseSettings):
    PROFILES: ClassVar[dict[str, dict[str, Any]]] = {}

    profile: str = "default"

    @model_validator(mode="before")
    @classmethod
    def _apply_profile(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        name = str(data.get("profile") or "default")
        if name == "default":
            return data

        try:
            preset = cls.PROFILES[name]
        except KeyError:
            options = ", ".join(sorted(cls.PROFILES)) or "none"
            raise ValueError(f"Unknown profile {name!r} — available: {options}") from None

        for field, value in preset.items():
            if field not in cls.model_fields:
                raise ValueError(f"Profile {name!r} sets unknown field {field!r}")
            data.setdefault(field, value)

        return data
