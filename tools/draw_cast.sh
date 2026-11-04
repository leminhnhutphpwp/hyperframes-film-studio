#!/bin/bash
# Draw the cast of one project, then cut the frames: tools/draw_cast.sh projects/<channel>/<film>/<part>
# Drawings go through tools/imagegen.py; ANIM_WORKERS sets how many run at once (default 3).
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
P=$1; L=library/anims/cast-$(basename "$P").log
for pass in 1 2; do  # a second pass retries whatever failed in the first
  ANIM_WORKERS=${ANIM_WORKERS:-3} .venv/bin/python -I tools/cast_draw.py "$P" >> "$L" 2>&1
done
.venv/bin/python -I tools/anim_frames.py --cut $(python3 -c "
import json,re
c=json.load(open('$P/cast.json'))
print(' '.join('library/anims/cast/'+re.sub(r'[^a-z0-9]+','-',k.replace('@','-').replace('|','-').lower()).strip('-') for k in c))") >> "$L" 2>&1
echo ALLDONE >> "$L"
