#!/bin/bash
# Middle Eastern cavalry (2026-10-13). Mount parts + two rider kits, symbolic costumes.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
A=(.venv/bin/python -I tools/asset.py draw)
TROUSERS="loose trousers of undyed light cloth (the same light colour on the thigh piece and the lower-leg piece; only the coat skirt over the thigh is teal)"
m1() { "${A[@]}" mount ngua-trung-dong --names body,head,front-upper,front-lower,hind-upper,hind-lower,tail,saddle --desc "a slender light-grey desert horse with a fine head, arched neck and a white mane. Parts: (1) BODY: barrel and chest only, no head, no neck, no legs, no tail; (2) HEAD AND NECK together as one piece with a leather bridle decorated with small brass discs, the neck base at the lower left where it joins the shoulders; (3) FRONT UPPER LEG: shoulder to knee; (4) FRONT LOWER LEG: knee to hoof; (5) HIND UPPER LEG: hip and thigh down to the hock; (6) HIND LOWER LEG: hock to hoof; (7) TAIL carried high then falling down; (8) SADDLE seen from the side: a low leather saddle over a long saddle cloth whose cloth is teal with a plain light border and a short fringe, metal stirrups on leather straps"; }
k1() { "${A[@]}" kit trung-dong-trung-dai-ky-binh --era trung-dai --region trung-dong --role ky-binh --desc "generic medieval Middle Eastern armoured horseman: pointed iron helmet with a mail neck guard and a cloth wrapped around the helmet base whose cloth is teal, a mail shirt under a knee-length riding coat whose cloth is teal, $TROUSERS, soft leather riding boots; a long cavalry lance with a narrow iron head drawn vertically; a small round shield painted teal with an iron boss and rim"; }
k2() { "${A[@]}" kit trung-dong-trung-dai-ky-xa --era trung-dai --region trung-dong --role ky-binh --desc "generic medieval Middle Eastern mounted archer: a cloth turban whose cloth is teal wound around a small cap, a padded knee-length riding coat whose cloth is teal with a leather belt, $TROUSERS, soft leather riding boots; the main weapon is a short recurved composite bow drawn vertically with its string; instead of a shield draw a leather quiver of arrows with a teal cloth panel"; }
mkdir -p library/logs
for f in m1 k1 k2; do $f > library/logs/me-$f.log 2>&1 & done
wait
grep -h -E "^saved|did not|still not|grid" library/logs/me-{m1,k1,k2}.log
