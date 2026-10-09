#!/usr/bin/env python3
"""Makes Tape 7's footage (public/data/tape7/*.mp4): pictures from FFmpeg's own sources, noise and
tones, with text drawn (by Pillow) in the Home Video font (CC0, by GGBotNet:
https://ggbot.itch.io/home-video-font). Nothing filmed, so nothing to license.

    FONT=/path/to/HomeVideo-Regular.ttf python3 scripts/tape7-footage.py
"""

import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = os.environ.get(
    "FONT",
    str(Path.home() / "Downloads/Firefox/GGBot Fonts/HomeVideo_Font_0_9/TrueType (.ttf)/HomeVideo-Regular.ttf"),
)
OUT = Path(__file__).resolve().parent.parent / "public/data/tape7"
W, H = 320, 240
TMP = Path(tempfile.mkdtemp())


def layer(name: str, lines: list[tuple]) -> Path:
    """A transparent frame with text on it: (text, x, y, size[, colour]); x "center" or "right"."""
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.fontmode = "1"  # crisp, as a VCR's display
    for text, x, y, size, *colour in lines:
        font = ImageFont.truetype(FONT, size)
        width = draw.textlength(text, font=font)
        left = (W - width) / 2 if x == "center" else W - width - 10 if x == "right" else x
        fill = colour[0] if colour else (255, 255, 255, 255)
        if sum(fill[:3]) > 150:  # (a shadow, under light text)
            draw.text((left + 2, y + 2), text, font=font, fill=(0, 0, 0, 180))
        draw.text((left, y), text, font=font, fill=fill)
    path = TMP / f"{name}.png"
    image.save(path)
    return path


def tape(name: str, seconds: float, picture: str, texts=(), sound: str = "", after: str = ""):
    """A clip (its captions kept off the top corners, where the player shows PLAY and the
    counter): a picture (FFmpeg filters over a plain frame), text layers over it for a while
    each ((path, from, to)), filters after those (e.g. noise over it all), and a sound."""
    inputs = ["-f", "lavfi", "-i", f"color=c=0x101418:s={W}x{H}:r=25:d={seconds}"]
    for path, *_ in texts:
        inputs += ["-loop", "1", "-t", str(seconds), "-i", str(path)]
    graph = [f"[0:v]{picture}[p0]"]
    for i, (_, start, end) in enumerate(texts, 1):
        graph.append(f"[p{i - 1}][{i}:v]overlay=0:0:enable='between(t,{start},{end})'[p{i}]")
    last = f"p{len(texts)}"
    graph.append(f"[{last}]{after + ',' if after else ''}format=yuv420p[out]")
    command = ["ffmpeg", "-loglevel", "error", "-y", *inputs]
    if sound:
        command += ["-f", "lavfi", "-t", str(seconds), "-i", sound]
    command += ["-filter_complex", ";".join(graph), "-map", "[out]"]
    if sound:
        command += ["-map", f"{len(texts) + 1}:a", "-c:a", "aac", "-b:a", "32k", "-ac", "1"]
    else:
        command += ["-an"]
    command += ["-c:v", "libx264", "-crf", "30", "-preset", "slow", "-movflags", "+faststart",
                "-t", str(seconds), str(OUT / f"{name}.mp4")]
    subprocess.run(command, check=True)
    print(f"Wrote {OUT / name}.mp4")


HISS = "anoisesrc=color=pink:amplitude=0.04:r=22050"
HUM = "aevalsrc='0.06*sin(2*PI*60*t)+0.03*(random(0)*2-1)':s=22050"
AMBER = (255, 200, 60, 255)

OUT.mkdir(parents=True, exist_ok=True)

# ── the tapes ───────────────────────────────────────────────────────────────

tape("tape01", 9,
     "drawbox=x=0:y=150:w=320:h=90:color=0x283848:t=fill,"
     "drawbox=x=40:y=110:w=90:h=40:color=0x506070:t=fill,"
     "drawbox=x=180:y=90:w=110:h=60:color=0x3c4c5c:t=fill",
     [(layer("t01a", [("KEPLER RELAY STATION", "center", 26, 20), ("DAY 01  09:00", "right", 214, 12)]), 0, 9),
      (layer("t01b", [("CREW LOG · DAY 1", "center", 56, 14)]), 2, 9),
      (layer("t01c", [("ALL SYSTEMS NOMINAL.", "center", 168, 14)]), 4.5, 9),
      (layer("t01d", [("CREW OF FIVE ABOARD.", "center", 190, 14)]), 6, 9)],
     HUM, "noise=alls=14:allf=t,eq=saturation=0.7")

tape("tape04", 10,
     "drawbox=x=0:y=0:w=320:h=240:color=0x14241c:t=fill,"
     "drawbox=x=30:y=80:w=120:h=90:color=0x203a2c:t=fill,"
     "drawbox=x=60:y=110:w=30:h=30:color=0x6a8a5a:t=fill,"
     "drawbox=x=190:y=60:w=110:h=80:color=0xe8d860:t=fill:enable='between(t,6.5,8.5)'",
     [(layer("t04a", [("LAB 2", 14, 214, 12), ("DAY 06  14:22", "right", 214, 12)]), 0, 10),
      (layer("t04b", [("SAMPLE K-7, FROM THE ARRAY", "center", 186, 13)]), 2, 6.5),
      (layer("t04c", [("PASSWORD:", 200, 72, 12, (20, 20, 20, 255)), ("HALCYON", 198, 96, 18, (20, 20, 20, 255))]), 6.5, 8.5),
      (layer("t04d", [("DR. OSEI: IT IS... WARM.", "center", 186, 13)]), 8.5, 10)],
     HUM, "noise=alls=16:allf=t,eq=saturation=0.8")

clock = [(layer(f"t09c{s}", [(f"03:14:0{s}", "right", 214, 12)]), s, s + 1) for s in range(5)]
tape("tape09", 9,
     "drawbox=x=0:y=0:w=320:h=240:color=0x26282a:t=fill,"
     "drawbox=x=110:y=60:w=100:h=150:color=0x3a3d40:t=fill,"
     "drawbox=x=158:y=60:w=4:h=150:color=0x18191a:t=fill",
     [(layer("t09a", [("CAM 3 · AIRLOCK", 14, 214, 12)]), 0, 5), *clock],
     HISS,
     "noise=alls=18:allf=t,noise=alls=100:allf=t:enable='between(t,4,5.5)',"
     "drawbox=x=0:y=0:w=320:h=240:color=black:t=fill:enable='gte(t,5.5)'")
# (the words after the screen goes black: a second pass, over the black)
os.replace(OUT / "tape09.mp4", TMP / "tape09-black.mp4")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(TMP / "tape09-black.mp4"),
                "-loop", "1", "-t", "9", "-i", str(layer("t09b", [("SIGNAL LOST", "center", 96, 20), ("CAM 3 · 03:14:07", "center", 130, 14)])),
                "-filter_complex", "[0:v][1:v]overlay=0:0:enable='gte(t,5.5)',format=yuv420p[out]",
                "-map", "[out]", "-map", "0:a", "-c:v", "libx264", "-crf", "30", "-preset", "slow",
                "-c:a", "copy", "-movflags", "+faststart", str(OUT / "tape09.mp4")], check=True)

tape("tape07", 13,
     "drawbox=x=0:y=0:w=320:h=240:color=0x202224:t=fill,"
     "drawbox=x=110:y=60:w=100:h=150:color=0x34373a:t=fill,"
     "drawbox=x='mod(t*9,140)+60':y=95:w=34:h=110:color=0x08090a@0.85:t=fill:enable='gte(t,3)'",
     [(layer("t07a", [("DAY 11 · CAM 3 · AIRLOCK", 14, 218, 12)]), 0, 11),
      (layer("t07b", [("THE AIRLOCK OPENED FROM INSIDE.", "center", 180, 12)]), 3.5, 6.5),
      (layer("t07c", [("IT IS STILL ABOARD.", "center", 178, 14, AMBER)]), 7, 10)],
     "aevalsrc='0.03*(random(0)*2-1)+min(t/12,1)*0.25*sin(2*PI*48*t)':s=22050",
     "noise=alls=18:allf=t,noise=alls=45:allf=t:enable='gte(t,6)',"
     "noise=alls=100:allf=t:enable='gte(t,9.5)',"
     "drawbox=x=0:y=0:w=320:h=240:color=black:t=fill:enable='gte(t,11)'")
os.replace(OUT / "tape07.mp4", TMP / "tape07-black.mp4")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(TMP / "tape07-black.mp4"),
                "-loop", "1", "-t", "13", "-i", str(layer("t07d", [("SIGNAL LOST", "center", 104, 20)])),
                "-filter_complex", "[0:v][1:v]overlay=0:0:enable='gte(t,11)',format=yuv420p[out]",
                "-map", "[out]", "-map", "0:a", "-c:v", "libx264", "-crf", "30", "-preset", "slow",
                "-c:a", "copy", "-movflags", "+faststart", str(OUT / "tape07.mp4")], check=True)

# ── the security cameras: loops, with no sound ──────────────────────────────

tape("cam1", 6,
     "drawbox=x=0:y=0:w=320:h=240:color=0x2a2c2e:t=fill,drawbox=x=0:y=170:w=320:h=70:color=0x3a3c3e:t=fill,"
     "drawbox=x=60:y=90:w=200:h=80:color=0x45474a:t=fill,"
     "drawbox=x='150+20*sin(t)':y=40:w=20:h=8:color=0xd0d0c0:t=fill",
     after="noise=alls=20:allf=t,eq=saturation=0")
tape("cam2", 6,
     "drawbox=x=0:y=0:w=320:h=240:color=0x1e2a24:t=fill,drawbox=x=30:y=80:w=120:h=90:color=0x2a3c32:t=fill,"
     "drawbox=x=240:y=50:w=10:h=10:color=red:t=fill:enable='lt(mod(t,1),0.5)'",
     after="noise=alls=20:allf=t,eq=saturation=0.4")
tape("cam3", 6,
     "drawbox=x=0:y=0:w=320:h=240:color=0x202224:t=fill,drawbox=x=110:y=60:w=100:h=150:color=0x34373a:t=fill,"
     "drawbox=x=140:y=95:w=34:h=110:color=0x08090a@0.8:t=fill",
     after="noise=alls=60:allf=t,eq=saturation=0")
tape("cam4", 8,
     "drawbox=x=0:y=0:w=320:h=240:color=0x18191c:t=fill,drawbox=x=20:y=120:w=110:h=50:color=0x26282c:t=fill,"
     "drawbox=x=190:y=120:w=110:h=50:color=0x26282c:t=fill,"
     "drawbox=x='mod(t*55,420)-50':y=80:w=28:h=100:color=0x050506@0.9:t=fill",
     after="noise=alls=26:allf=t,eq=saturation=0")
