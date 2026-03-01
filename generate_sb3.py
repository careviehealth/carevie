"""
Generate a minimal valid Scratch 3 (.sb3) project file.
SB3 is a ZIP containing project.json and asset files (costumes/sounds) named by MD5.
"""
import json
import zipfile
import os
import base64
import hashlib
import struct
from io import BytesIO


def create_dummy_png(color="red"):
    """Create a minimal 1x1 pixel PNG as bytes (for costumes/backdrops)."""
    # 1x1 pixel PNGs in different colors
    pngs = {
        "red": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "blue": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "green": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="  # Note: green is same as blue for simplicity, but in practice vary
    }
    return base64.b64decode(pngs.get(color, pngs["red"]))


def create_dummy_wav():
    """Create a minimal valid WAV (short silence) as bytes."""
    sample_rate = 22050
    channels = 1
    bits = 16
    byte_rate = sample_rate * channels * (bits // 8)
    block_align = channels * (bits // 8)
    num_samples = 2205  # ~100ms
    data_size = num_samples * block_align
    buf = BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<HH", 1, channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<IHH", byte_rate, block_align, bits))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(b"\x00" * data_size)
    return buf.getvalue()


def md5_hex(data: bytes) -> str:
    """Return MD5 hash of data as hex string."""
    return hashlib.md5(data).hexdigest()


def build_project_json(png_md5s: list, wav_md5s: list) -> dict:
    """Build a well-made Scratch 3 project.json with multiple stage backdrops, sprites, costumes, sounds, and scripts."""
    # Assets: png_md5s[0] red, [1] blue, [2] green; wav_md5s[0] sound1, [1] sound2

    stage_backdrops = [
        {
            "assetId": png_md5s[0],
            "name": "Red Backdrop",
            "md5ext": f"{png_md5s[0]}.png",
            "dataFormat": "png",
            "rotationCenterX": 240,
            "rotationCenterY": 180,
        },
        {
            "assetId": png_md5s[1],
            "name": "Blue Backdrop",
            "md5ext": f"{png_md5s[1]}.png",
            "dataFormat": "png",
            "rotationCenterX": 240,
            "rotationCenterY": 180,
        },
    ]

    sprite1_costumes = [
        {
            "assetId": png_md5s[0],
            "name": "Red Costume",
            "md5ext": f"{png_md5s[0]}.png",
            "dataFormat": "png",
            "rotationCenterX": 16,
            "rotationCenterY": 16,
        },
        {
            "assetId": png_md5s[1],
            "name": "Blue Costume",
            "md5ext": f"{png_md5s[1]}.png",
            "dataFormat": "png",
            "rotationCenterX": 16,
            "rotationCenterY": 16,
        },
    ]

    sprite1_sounds = [
        {
            "assetId": wav_md5s[0],
            "name": "Sound1",
            "md5ext": f"{wav_md5s[0]}.wav",
            "dataFormat": "wav",
            "rate": 22050,
            "sampleCount": 2205,
        },
    ]

    sprite2_costumes = [
        {
            "assetId": png_md5s[2],
            "name": "Green Costume",
            "md5ext": f"{png_md5s[2]}.png",
            "dataFormat": "png",
            "rotationCenterX": 16,
            "rotationCenterY": 16,
        },
        {
            "assetId": png_md5s[0],
            "name": "Red Costume",
            "md5ext": f"{png_md5s[0]}.png",
            "dataFormat": "png",
            "rotationCenterX": 16,
            "rotationCenterY": 16,
        },
    ]

    sprite2_sounds = [
        {
            "assetId": wav_md5s[1],
            "name": "Sound2",
            "md5ext": f"{wav_md5s[1]}.wav",
            "dataFormat": "wav",
            "rate": 22050,
            "sampleCount": 2205,
        },
    ]

    # Scripts for Sprite1: on green flag, say "Hello", play sound
    sprite1_blocks = {
        "flag1": {
            "opcode": "event_whenflagclicked",
            "next": "say1",
            "parent": None,
            "inputs": {},
            "fields": {},
            "shadow": False,
            "topLevel": True,
            "x": 10,
            "y": 10,
        },
        "say1": {
            "opcode": "looks_say",
            "next": "play1",
            "parent": "flag1",
            "inputs": {
                "MESSAGE": [1, [10, "Hello World!"]],
            },
            "fields": {},
            "shadow": False,
            "topLevel": False,
        },
        "play1": {
            "opcode": "sound_play",
            "next": None,
            "parent": "say1",
            "inputs": {
                "SOUND_MENU": [1, "Sound1"],
            },
            "fields": {},
            "shadow": False,
            "topLevel": False,
        },
    }

    # Scripts for Sprite2: on green flag, move 10 steps, turn 15 degrees
    sprite2_blocks = {
        "flag2": {
            "opcode": "event_whenflagclicked",
            "next": "move2",
            "parent": None,
            "inputs": {},
            "fields": {},
            "shadow": False,
            "topLevel": True,
            "x": 200,
            "y": 10,
        },
        "move2": {
            "opcode": "motion_movesteps",
            "next": "turn2",
            "parent": "flag2",
            "inputs": {
                "STEPS": [1, [4, "10"]],
            },
            "fields": {},
            "shadow": False,
            "topLevel": False,
        },
        "turn2": {
            "opcode": "motion_turnright",
            "next": None,
            "parent": "move2",
            "inputs": {
                "DEGREES": [1, [4, "15"]],
            },
            "fields": {},
            "shadow": False,
            "topLevel": False,
        },
    }

    stage = {
        "isStage": True,
        "name": "Stage",
        "variables": {},
        "lists": {},
        "broadcasts": {},
        "blocks": {},
        "comments": {},
        "currentCostume": 0,
        "costumes": stage_backdrops,
        "sounds": [],
        "layerOrder": 0,
        "tempo": 60,
        "videoTransparency": 50,
        "videoState": "off",
    }

    sprite1 = {
        "isStage": False,
        "name": "Cat",
        "variables": {},
        "lists": {},
        "broadcasts": {},
        "blocks": sprite1_blocks,
        "comments": {},
        "currentCostume": 0,
        "costumes": sprite1_costumes,
        "sounds": sprite1_sounds,
        "layerOrder": 1,
        "visible": True,
        "x": -100,
        "y": 0,
        "size": 100,
        "direction": 90,
        "draggable": False,
        "rotationStyle": "all around",
    }

    sprite2 = {
        "isStage": False,
        "name": "Ball",
        "variables": {},
        "lists": {},
        "broadcasts": {},
        "blocks": sprite2_blocks,
        "comments": {},
        "currentCostume": 0,
        "costumes": sprite2_costumes,
        "sounds": sprite2_sounds,
        "layerOrder": 2,
        "visible": True,
        "x": 100,
        "y": 0,
        "size": 80,
        "direction": 90,
        "draggable": False,
        "rotationStyle": "all around",
    }

    return {
        "targets": [stage, sprite1, sprite2],
        "monitors": [],
        "extensions": [],
        "meta": {
            "semver": "3.0.0",
            "vm": "0.2.0",
            "agent": "generate_sb3.py",
        },
    }


def create_sb3(output_path: str = "project.sb3") -> str:
    """
    Generate a well-made SB3 file at output_path.
    Returns the absolute path of the created file.
    """
    # Generate assets: 3 PNGs (red, blue, green), 2 WAVs
    png_red = create_dummy_png("red")
    png_blue = create_dummy_png("blue")
    png_green = create_dummy_png("green")
    wav1 = create_dummy_wav()
    wav2 = create_dummy_wav()

    png_md5s = [md5_hex(png_red), md5_hex(png_blue), md5_hex(png_green)]
    wav_md5s = [md5_hex(wav1), md5_hex(wav2)]

    project = build_project_json(png_md5s, wav_md5s)
    project_bytes = json.dumps(project, separators=(",", ":")).encode("utf-8")

    assets = [
        (f"{png_md5s[0]}.png", png_red),
        (f"{png_md5s[1]}.png", png_blue),
        (f"{png_md5s[2]}.png", png_green),
        (f"{wav_md5s[0]}.wav", wav1),
        (f"{wav_md5s[1]}.wav", wav2),
    ]

    out_path = os.path.abspath(output_path)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.json", project_bytes)
        for name, data in assets:
            zf.writestr(name, data)

    return out_path


def verify_sb3(path: str) -> bool:
    """Verify that path is a valid SB3 (ZIP with project.json)."""
    if not os.path.isfile(path):
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            if "project.json" not in zf.namelist():
                return False
            data = json.loads(zf.read("project.json").decode("utf-8"))
            if "targets" not in data or "meta" not in data:
                return False
        return True
    except Exception:
        return False


if __name__ == "__main__":
    out = create_sb3("project.sb3")
    print(f"Created: {out}")
    if verify_sb3(out):
        print("Verification: OK (valid SB3)")
    else:
        print("Verification: FAILED")
