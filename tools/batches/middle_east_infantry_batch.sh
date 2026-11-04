#!/bin/bash
# Middle Eastern infantry, archer, commander and faces (2026-10-13). Symbolic costumes matching the Middle Eastern cavalry kits.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
A=(.venv/bin/python -I tools/asset.py draw)
TROUSERS="loose trousers of undyed light cloth (the same light colour on the thigh piece and the lower-leg piece; only the coat skirt over the thigh is teal)"
k1() { "${A[@]}" kit trung-dong-trung-dai-bo-binh-nang --era trung-dai --region trung-dong --role bo-binh-nang --desc "generic medieval Middle Eastern heavy infantryman: pointed iron helmet with a mail neck guard and a cloth wrapped around the helmet base whose cloth is teal, a mail shirt under a knee-length padded coat whose cloth is teal with a leather belt, $TROUSERS, plain leather shoes; a long infantry spear with a broad iron head drawn vertically; a large round wooden shield painted teal with an iron boss and rim"; }
k2() { "${A[@]}" kit trung-dong-trung-dai-cung-thu --era trung-dai --region trung-dong --role cung-thu --desc "generic medieval Middle Eastern foot archer: a small cloth cap with a short cloth wrap whose cloth is teal, a knee-length quilted coat whose cloth is teal with a leather belt, $TROUSERS, plain leather shoes; the main weapon is a recurved composite bow drawn vertically with its string; instead of a shield draw a leather quiver of arrows with a teal cloth panel"; }
k3() { "${A[@]}" kit trung-dong-trung-dai-tuong --era trung-dai --region trung-dong --role tuong --desc "generic medieval Middle Eastern commander on foot: tall pointed iron helmet with a mail neck guard and a long cloth wrapped around the helmet base whose cloth is teal with a small plume, a scale-armour coat over a long robe whose cloth is teal with a light geometric border, a wide sash belt, $TROUSERS, tall soft leather boots; a curved sword drawn vertically; a round shield painted teal with a brass boss and a simple invented geometric emblem"; }
h1() { "${A[@]}" heads trung-dong-trung-dai --era trung-dai --region trung-dong --desc "eight generic medieval Middle Eastern soldiers and townspeople: some wearing pointed iron helmets with a teal cloth wrapped around the base, some wearing cloth turbans whose cloth is teal, some small cloth caps; trimmed beards, moustaches, a few clean-shaven young faces, one older man with a grey beard"; }
mkdir -p library/logs
for f in k1 k2 k3 h1; do $f > library/logs/mi-$f.log 2>&1 & done
wait
grep -h -E "^saved|did not|still not|grid" library/logs/mi-{k1,k2,k3,h1}.log
