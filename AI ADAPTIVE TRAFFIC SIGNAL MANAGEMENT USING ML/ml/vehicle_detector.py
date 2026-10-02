"""Optional YOLO vehicle detector integration.

The web dashboard does not require this file. Install Ultralytics separately
when you have a compatible Python environment and a YOLO weights file.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Any


def detect_vehicles(image_path: str, weights: str = "yolov8n.pt") -> Dict[str, Any]:
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Optional YOLO support requires the 'ultralytics' package. "
            "Install it in your ML environment before using detect_vehicles()."
        ) from exc

    source = Path(image_path)
    if not source.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    model = YOLO(weights)
    results = model(str(source), verbose=False)
    allowed = {"car", "motorcycle", "bus", "truck", "train"}
    counts = {name: 0 for name in sorted(allowed)}

    for result in results:
        names = result.names
        for cls_id in result.boxes.cls.tolist():
            name = names[int(cls_id)]
            if name in allowed:
                counts[name] += 1

    counts["total"] = sum(counts.values())
    return counts


if __name__ == "__main__":
    print("Use detect_vehicles('path/to/frame.jpg') from your Python code.")
