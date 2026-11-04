# Battle template

A top-down battle on a terrain map: two sides in ranks, archers' volleys, cavalry, banners and a moving camera.
`tools/battle.py` copies this template and fills it from `battle.json`.

```bash
.venv/bin/python -I tools/battle.py new my-battle          # creates samples/my-battle from this template
# edit samples/my-battle/battle.json, then:
.venv/bin/python -I tools/battle.py build samples/my-battle
cd samples/my-battle && npx --yes hyperframes@0.8.152 render
```

## Assets it needs

The starter library has no soldiers or terrain, so draw what `battle.json` names first (an image backend must be
set in `.env`, see the README). With the ids in the template's `battle.json`:

```bash
A=".venv/bin/python -I tools/asset.py draw"
$A terrain grassland --desc "top-down open grassland with a dirt road, a low stone wall and scattered bushes"
$A kit medieval-europe-heavy-infantry --era medieval --region europe --role heavy-infantry \
  --desc "foot soldier, mail shirt, kettle helmet, spear and kite shield"
$A kit medieval-europe-archer --era medieval --region europe --role archer --desc "archer, padded jacket, longbow, quiver"
$A kit medieval-europe-general --era medieval --region europe --role general --desc "commander in plate armour and a cloak, sword"
$A heads medieval-europe-soldier-faces --era medieval --region europe --desc "8 varied soldiers' faces under simple helmets"
$A props battle-props --names banner,arrow,spear,shield,sword,helmet,drum,tent --desc "a side's banner on a pole, an arrow, a spear, a round shield, a sword, a helmet, a war drum, a small tent"
```

For cavalry, also draw a rider kit (`--role cavalry`) and a mount (`asset.py draw mount war-horse --names body,head,front-upper,front-lower,hind-upper,hind-lower,tail,saddle --desc "a war horse in side view, cut into those parts"`).
Kits and heads are drawn in teal and dyed per side; `battle.py build` makes the colour variants.

`samples/battle-paper` in this repository is a finished battle you can render as it is.
