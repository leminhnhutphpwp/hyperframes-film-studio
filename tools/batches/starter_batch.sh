#!/bin/zsh
# Starter library: ancient Mediterranean, medieval Europe, ancient Vietnam (symbolic costumes).
# Four streams run in parallel; each stream draws sequentially. Already-drawn ids are skipped by asset.py.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
A=(.venv/bin/python -I tools/asset.py draw)
mkdir -p library/logs

stream_med() {
  $A kit dia-trung-hai-co-dai-bo-binh-nang --era co-dai --region dia-trung-hai --role bo-binh-nang --desc "generic ancient Mediterranean heavy infantryman: bronze helmet with a horsehair crest and cheek guards, bronze breastplate over a short tunic whose cloth is teal, leather strip skirt, bronze greaves, sandals, a short straight double-edged sword, a large round bronze-rimmed shield painted teal"
  $A kit dia-trung-hai-co-dai-cung-thu --era co-dai --region dia-trung-hai --role cung-thu --desc "generic ancient Mediterranean archer: simple cloth cap, short tunic whose cloth is teal, leather belt, sandals; weapon cell: a recurve composite bow drawn vertically; last cell: a leather quiver full of arrows instead of a shield"
  $A kit dia-trung-hai-co-dai-tuong --era co-dai --region dia-trung-hai --role tuong --desc "generic ancient Mediterranean commander: ornate bronze helmet with a tall crest, decorated bronze breastplate, a long cape whose cloth is teal hanging from the shoulders drawn as part of the torso, greaves, sandals, a sword, a round shield painted teal with a gold rim"
  $A heads dia-trung-hai-co-dai --era co-dai --region dia-trung-hai --desc "eight ancient Mediterranean soldiers and civilians: some wearing bronze crested helmets, some bare-headed with short curly hair, some bearded, one older man, one young recruit"
}
stream_eu() {
  $A kit chau-au-trung-dai-bo-binh-nang --era trung-dai --region chau-au --role bo-binh-nang --desc "generic medieval European foot soldier: rounded steel kettle hat, padded gambeson under a sleeveless tabard whose cloth is teal, mail sleeves, woollen hose and leather boots, a long spear, a kite-shaped wooden shield painted teal"
  $A kit chau-au-trung-dai-cung-thu --era trung-dai --region chau-au --role cung-thu --desc "generic medieval European archer: cloth hood, short padded jacket whose cloth is teal, belt with pouch, hose and boots; weapon cell: a tall wooden longbow drawn vertically; last cell: a quiver of arrows instead of a shield"
  $A kit chau-au-trung-dai-tuong --era trung-dai --region chau-au --role tuong --desc "generic medieval European knight commander on foot: steel great helm with an open face, mail and plate armour under a surcoat whose cloth is teal, armoured legs, a longsword, a heater shield painted teal with a simple invented light-coloured geometric emblem"
  $A heads chau-au-trung-dai --era trung-dai --region chau-au --desc "eight medieval European soldiers and peasants: kettle hats, mail coifs, cloth hoods, bare heads with long or short hair, beards, one older man, one young man"
}
stream_vn() {
  $A kit dong-nam-a-co-dai-bo-binh-nhe --era co-dai --region dong-nam-a --role bo-binh-nhe --desc "symbolic ancient Southeast Asian Bronze Age warrior loosely inspired by Dong Son drum art: tall feathered headdress, bare chest with simple bronze armbands, short wrap skirt whose cloth is teal, bare feet, a bronze-tipped spear, an oval woven rattan shield with a teal painted band"
  $A kit dong-nam-a-co-dai-cung-thu --era co-dai --region dong-nam-a --role cung-thu --desc "symbolic ancient Southeast Asian Bronze Age crossbowman: feathered headband, bare chest with a teal cloth sash across it, short wrap skirt whose cloth is teal, bare feet; weapon cell: a wooden crossbow drawn vertically with the stock pointing down; last cell: a bamboo quiver of bolts instead of a shield"
  $A kit dong-nam-a-co-dai-tuong --era co-dai --region dong-nam-a --role tuong --desc "symbolic ancient Southeast Asian Bronze Age chieftain commander: large feathered headdress, bronze chest disc ornament, a long robe whose cloth is teal draped over one shoulder, bronze anklets, a bronze battle axe with a crescent blade, a round bronze shield with concentric rings"
  $A heads dong-nam-a-co-dai --era co-dai --region dong-nam-a --desc "eight ancient Southeast Asian Bronze Age people: feathered headbands, hair tied in buns, short hair, one elder, one young warrior, two women with hair in buns"
}
stream_common() {
  $A props vu-khi-chung --names longbow,crossbow,banner,war-drum,torch,war-horn,battle-axe,quiver --desc "longbow drawn vertically; crossbow drawn vertically; a tall pole carrying a rectangular teal cloth banner with a simple invented emblem; a large bronze kettle drum seen from the side with plain geometric bands; a burning wooden torch held vertical; a curved animal horn; a two-handed battle axe drawn vertically; a full quiver of arrows"
  $A terrain ven-song --desc "a grassy plain crossed diagonally by a wide calm river with sandy banks, reeds and a few trees, region-neutral"
  $A terrain chan-thanh --desc "a long defensive earth rampart topped with a wooden palisade running horizontally across the upper third, a gate opening in the middle, trampled open field in front"
  $A terrain dong-co-on-doi --desc "a temperate European meadow: green grass, wildflower patches, a dirt road, a few oak trees, low broken stone walls"
}

stream_med > library/logs/med.log 2>&1 &
stream_eu > library/logs/eu.log 2>&1 &
stream_vn > library/logs/vn.log 2>&1 &
stream_common > library/logs/common.log 2>&1 &
wait
.venv/bin/python -I tools/asset.py list
