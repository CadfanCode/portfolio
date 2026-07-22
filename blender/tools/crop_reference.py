"""
Crop and enlarge part of a reference photograph.

Reference photos are the only way to check the things no drawing dimensions --
where a step in the coachroof falls, how far a keel bulb stands proud. Those
details are usually a few dozen pixels in a wide shot, so they need pulling out
and scaling up before they can be read.

Blender is used simply because it is the image library already installed. It has
to be: the Flatpak cannot see the host's /tmp, so scratch scripts have to live
under the project anyway.

    flatpak run org.blender.Blender -b --factory-startup \\
        --python blender/tools/crop_reference.py -- \\
        SOURCE OUT X0 Y0 X1 Y1 SCALE

Crop bounds are fractions of the image, 0-1, measured from the top left.
"""

import sys

import bpy
import numpy as np


def main() -> int:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) < 7:
        print("[crop] usage: SOURCE OUT X0 Y0 X1 Y1 SCALE")
        return 1

    source, out = args[0], args[1]
    x0f, y0f, x1f, y1f, scale = (float(a) for a in args[2:7])

    img = bpy.data.images.load(source)
    width, height = img.size
    print(f"[crop] source {width}x{height}")

    # Blender stores pixels bottom-up; flip so the crop can be given in the
    # same top-left coordinates anyone reading the picture would use.
    pixels = np.array(img.pixels[:], dtype=np.float32).reshape(height, width, 4)[::-1]

    crop = pixels[
        int(y0f * height) : int(y1f * height),
        int(x0f * width) : int(x1f * width),
    ]
    crop_h, crop_w = crop.shape[:2]
    if crop_w < 2 or crop_h < 2:
        print("[crop] crop is empty -- check the bounds")
        return 1

    result = bpy.data.images.new("crop", crop_w, crop_h, alpha=True)
    result.pixels = crop[::-1].ravel().tolist()
    result.scale(int(crop_w * scale), int(crop_h * scale))
    result.filepath_raw = out
    result.file_format = "PNG"
    result.save()

    print(f"[crop] wrote {out} at {int(crop_w * scale)}x{int(crop_h * scale)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
