"""Give an older film project the cinematic layer of templates/film (fx.js, tableaux, styled transitions, soft
backdrops) without changing what its Vietnamese build draws: the layer is inert until a scene calls it, and a chapter
can have its own js/scenes.en.js that the English build plays instead of js/scenes.js.

  .venv/bin/python -I tools/port_fx.py projects/my-channel/my-film/part-1 [...]

Idempotent: a project already ported is left as it is.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TPL = ROOT / "templates/film/shared"


def sub(text, old, new, what):
    if new in text:
        return text
    if old not in text:
        sys.exit(f"port_fx: anchor for {what} not found")
    return text.replace(old, new, 1)


def port(proj):
    sh = proj / "shared"
    shutil.copy(TPL / "js/fx.js", sh / "js/fx.js")
    shutil.copy(TPL / "js/restage.js", sh / "js/restage.js")
    # the fixed puppet rig (neck, joints, sitting, kneeling, weapons, mounts) for the non-Vietnamese builds only:
    # the Vietnamese film keeps the rig it was published with
    (sh / "js-new").mkdir(exist_ok=True)
    for f in ("engine.js", "stage.js", "people.js"):
        shutil.copy(TPL / "js" / f, sh / "js-new" / f)

    # template: effect layers above the stage, letterbox and wipe on top
    t = (sh / "template.html").read_text()
    tpl = (TPL / "template.html").read_text()
    css = tpl[tpl.index("      #tableau,\n") : tpl.index("      #tint {\n")]
    t = sub(t, "      #tint {\n", css + "      #tint {\n", "template css")
    t = sub(t, '      <canvas id="stage"></canvas>\n', '      <canvas id="stage"></canvas>\n      <div id="tableau"></div>\n      <div id="grade"></div>\n      <div id="vignette"></div>\n      <canvas id="fx" width="1920" height="1080"></canvas>\n      <canvas id="light" width="1920" height="1080"></canvas>\n', "template layers")
    wipe = tpl[tpl.index('      <div id="bars"></div>') : tpl.index('      <div id="fade"></div>')]
    t = sub(t, '      <div id="fade"></div>\n', wipe + '      <div id="fade"></div>\n', "template wipe")
    (sh / "template.html").write_text(t)

    # main.js: scenes of the build's language, fx begin/finish, styled transitions, scene-less (tableau) runs
    m = (sh / "js/main.js").read_text()
    m = sub(m, 'import { SEGMENTS, DIPS } from "../../js/scenes.js";', 'import * as fx from "./fx.js";\nimport * as SC from "../../js/scenes.current.js";\n\nconst { SEGMENTS, DIPS } = SC;\n// TRANSITIONS: [{ t, kind: "ink" | "burn" | "paper" | "flash", d }] — a styled cut at t (d seconds each side)\nconst TRANSITIONS = SC.TRANSITIONS || [];', "main import")
    m = sub(m, "  ov.begin();\n", "  ov.begin();\n  fx.begin();\n", "main begin")
    m = sub(m, "    renderer.render(r.scene, r.camera);\n  }", "    if (r && r.scene) renderer.render(r.scene, r.camera);\n    else canvas.style.visibility = \"hidden\";\n  }\n  for (const tr of TRANSITIONS) {\n    const d = tr.d ?? 0.45;\n    if (t > tr.t - d && t < tr.t + d) fx.transition(tr.kind, 1 - Math.abs(t - tr.t) / d);\n  }\n  fx.finish();", "main render")
    (sh / "js/main.js").write_text(m)

    # stage.js: a pre-blurred copy of the backdrop for fx.focus
    s = (sh / "js/stage.js").read_text()
    s = sub(s, "  scene.add(bd);\n  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);\n  return { scene, camera, bd };",
            "  scene.add(bd);\n  const bdBlur = picture(`assets/lib/backdrops/${backdropId}.blur.jpg`, width, height);\n  bdBlur.material.transparent = true;\n  bdBlur.material.opacity = 0;\n  bdBlur.material.depthWrite = false;\n  bdBlur.visible = false;\n  bdBlur.position.set(0, y, z + 0.01);\n  scene.add(bdBlur);\n  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);\n  return { scene, camera, bd, bdBlur };", "stage blur")
    (sh / "js/stage.js").write_text(s)

    # chapter_build.py: blurred backdrops, tableaux, scenes.current.js, TABLEAUX
    c = (sh / "chapter_build.py").read_text()
    c = sub(c, "import imageio_ffmpeg\n", "import imageio_ffmpeg\nfrom PIL import Image, ImageFilter\n", "build import")
    c = re.sub(r'(\n(\s+)shutil\.copy\(LIB / \(kind or "backdrops"\) / bid / "image\.jpg", out / "backdrops" / f"\{bid\}\.jpg"\)\n)',
               lambda mm: mm.group(1) if "blur.jpg" in c else mm.group(1) + f'{mm.group(2)}blur = out / "backdrops" / f"{{bid}}.blur.jpg"  # fx.focus\n{mm.group(2)}if not blur.exists():\n{mm.group(2)}    Image.open(out / "backdrops" / f"{{bid}}.jpg").convert("RGB").filter(ImageFilter.GaussianBlur(9)).save(blur, quality=90)\n', c, count=1)
    if "blur.jpg" not in c:
        sys.exit("port_fx: backdrop copy anchor not found")
    c = re.sub(r'(\n(\s+)shutil\.copytree\(HERE, dst, ignore=[^\n]*\n)', lambda mm: mm.group(1) if "js-new" in c else mm.group(1) + f'{mm.group(2)}if lang != "vi":  # the fixed rig (tools/port_fx.py) for the other-language cut\n{mm.group(2)}    for f in (HERE / "js-new").glob("*.js"):\n{mm.group(2)}        shutil.copy(f, dst / "js" / f.name)\n', c, count=1)
    c = sub(c, '    scenes_js = (chdir / "js/scenes.js").read_text()', '''    # painted tableaux (tools/tableau.py → <project>/tableaux/<id>/)
    tab_files = []
    for tid in cfg.get("tableaux", []):
        dst_t = chdir / "assets" / "tableaux" / tid
        dst_t.mkdir(parents=True, exist_ok=True)
        for f in sorted((PROJECT / "tableaux" / tid).iterdir()):
            if f.suffix in (".jpg", ".png", ".webp"):
                shutil.copy(f, dst_t / f.name)
                tab_files.append(f"{tid}/{f.name}")
    # the scenes this build plays: js/scenes.<lang>.js when the chapter has one (a version re-staged for that language)
    scenes_name = f"scenes.{lang}.js" if lang != "vi" and (chdir / f"js/scenes.{lang}.js").exists() else "scenes.js"
    (chdir / "js/scenes.current.js").write_text(f'// generated by shared/chapter_build.py: the scenes this build plays\\nexport * from "./{scenes_name}";\\n')
    scenes_js = (chdir / "js" / scenes_name).read_text()''', "build scenes")
    c = sub(c, '        f"window.LANG = {json.dumps(lang)};\\nwindow.TR = {json.dumps(TR, ensure_ascii=False)};\\n"',
            '        f"window.LANG = {json.dumps(lang)};\\nwindow.TR = {json.dumps(TR, ensure_ascii=False)};\\n"\n        f"window.TABLEAUX = {json.dumps(tab_files)};\\n"', "build data")
    # drawn stand-ins for puppets in the other-language build (tools/cast_draw.py → cast.<lang>.json)
    tb = (TPL / "chapter_build.py").read_text()
    block = tb[tb.index("    # drawn stand-ins for puppets") : tb.index('    (out / "library.js").write_text(')]
    c = sub(c, '    (out / "library.js").write_text(', block + '    (out / "library.js").write_text(', "build cast")
    c = sub(c, '        f"window.TABLEAUX = {json.dumps(tab_files)};\\n"', '        f"window.TABLEAUX = {json.dumps(tab_files)};\\nwindow.CAST = {json.dumps(cast_map)};\\n"', "build cast data")
    (sh / "chapter_build.py").write_text(c)
    print("ported", proj.relative_to(ROOT))


if __name__ == "__main__":
    for a in sys.argv[1:]:
        port(Path(a).resolve())
