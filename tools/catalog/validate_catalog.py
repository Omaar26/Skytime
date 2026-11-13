#!/usr/bin/env python3
"""Validate catalog.json without third-party dependencies."""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

TARGET_FIELDS = ("id", "name", "observations")
OBSERVATION_FIELDS = (
    "date", "observationId", "release", "detector", "image", "fitsSource", "source", "sourceUrl"
)
PLACEHOLDERS = re.compile(r"\b(sample|unknown|todo|tbd|placeholder|example|guessed|fake|not verified)\b", re.I)
DATE_FORMAT = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate(catalog_path: Path, images_root: Path) -> list[str]:
    errors: list[str] = []
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"Catalog file does not exist: {catalog_path}"]
    except json.JSONDecodeError as exc:
        return [f"Invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"]

    if not isinstance(catalog, dict) or not isinstance(catalog.get("targets"), list):
        return ["Catalog must be an object containing a 'targets' list."]
    if not catalog["targets"]:
        errors.append("'targets' must contain at least one target.")
    if catalog.get("sampleData") is True:
        errors.append("Catalog is explicitly marked as sample data; replace it with verified values before release.")

    def check_value(value: object, label: str) -> None:
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{label} is empty or is not a string.")
        elif PLACEHOLDERS.search(value):
            errors.append(f"{label} looks guessed or is a placeholder: {value!r}.")

    for ti, target in enumerate(catalog["targets"]):
        label = f"targets[{ti}]"
        if not isinstance(target, dict):
            errors.append(f"{label} must be an object.")
            continue
        for field in TARGET_FIELDS:
            if field not in target:
                errors.append(f"{label} is missing required field '{field}'.")
        for field in ("id", "name"):
            if field in target:
                check_value(target[field], f"{label}.{field}")
        observations = target.get("observations")
        if not isinstance(observations, list):
            errors.append(f"{label}.observations must be a list.")
            continue
        for oi, observation in enumerate(observations):
            ol = f"{label}.observations[{oi}]"
            if not isinstance(observation, dict):
                errors.append(f"{ol} must be an object.")
                continue
            for field in OBSERVATION_FIELDS:
                if field not in observation:
                    errors.append(f"{ol} is missing required field '{field}'.")
                else:
                    check_value(observation[field], f"{ol}.{field}")
            value = observation.get("date")
            if isinstance(value, str):
                if not DATE_FORMAT.fullmatch(value):
                    errors.append(f"{ol}.date must use YYYY-MM-DD format.")
                else:
                    try:
                        date.fromisoformat(value)
                    except ValueError:
                        errors.append(f"{ol}.date is not a real calendar date: {value}.")
            image = observation.get("image")
            if isinstance(image, str) and image.strip():
                if not image.startswith("/images/"):
                    errors.append(f"{ol}.image must start with '/images/'.")
                else:
                    relative = Path(image.removeprefix("/images/").replace("/", "/"))
                    resolved = (images_root / relative).resolve()
                    try:
                        resolved.relative_to(images_root.resolve())
                    except ValueError:
                        errors.append(f"{ol}.image points outside the images folder.")
                    else:
                        if not resolved.is_file():
                            errors.append(f"{ol}.image file does not exist: {resolved}.")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Check required catalog fields, dates, values, and image files.")
    project_root = Path(__file__).resolve().parents[2]
    parser.add_argument("catalog", nargs="?", type=Path, default=project_root / "data" / "catalog.json")
    parser.add_argument("--images", type=Path, default=project_root / "images")
    args = parser.parse_args()
    errors = validate(args.catalog, args.images)
    if errors:
        print(f"Catalog validation failed with {len(errors)} error(s):")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Catalog is valid: {args.catalog}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
