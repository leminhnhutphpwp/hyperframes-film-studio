#!/bin/zsh
# Redraws after reviewing the starter set (2026-10-13).
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
A=(.venv/bin/python -I tools/asset.py draw)
FEATHER="headdress shaped like the figures on Dong Son bronze drums: a simple cloth or bronze band around the head with a few long bird feathers standing straight up and slightly swept back, like a bird crest. It must NOT look like a Native American war bonnet: no feather fan, no row of many feathers, no beadwork, no hanging tails"
r1() { $A kit dong-nam-a-co-dai-bo-binh-nhe --force --era co-dai --region dong-nam-a --role bo-binh-nhe --desc "symbolic ancient Southeast Asian Bronze Age warrior: $FEATHER; bare chest with simple bronze armbands, short wrap skirt whose cloth is teal, bare feet, a bronze-tipped spear, an oval woven rattan shield with a teal painted band"; }
r2() { $A kit dong-nam-a-co-dai-tuong --force --era co-dai --region dong-nam-a --role tuong --desc "symbolic ancient Southeast Asian Bronze Age chieftain commander: taller $FEATHER, slightly more feathers than a soldier; bronze chest disc ornament, a long robe whose cloth is teal draped over one shoulder, bronze anklets, a bronze battle axe with a crescent blade, a round bronze shield with concentric rings"; }
r3() { $A props vu-khi-chung --force --names longbow,crossbow,banner,war-drum,torch,war-horn,battle-axe,quiver --desc "Flat solid magenta #FF00FF background behind every prop, no dark background, no glow, no vignette, no lighting effects. Props: longbow drawn vertically; crossbow drawn vertically; a tall pole carrying a rectangular teal cloth banner with a simple invented emblem; a large bronze kettle drum seen from the side with plain geometric bands; an unlit wooden torch with a cloth-wrapped head, vertical; a curved animal horn; a two-handed battle axe drawn vertically; a full quiver of arrows"; }
r4() { $A terrain chan-thanh --force --desc "siege approach to a fortified town: a thick stone-and-earth city wall with square towers runs horizontally across the top quarter, a large gatehouse in the middle, a dry moat in front of the wall crossed by a road, then a trampled grassy field with a few tents and supply carts near the bottom edge"; }
r1 > library/logs/r1.log 2>&1 &
r2 > library/logs/r2.log 2>&1 &
r3 > library/logs/r3.log 2>&1 &
r4 > library/logs/r4.log 2>&1 &
wait
grep -h -E "^saved|did not" library/logs/r?.log
