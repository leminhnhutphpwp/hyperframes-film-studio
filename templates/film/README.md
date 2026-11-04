# Khuôn phim rối giấy (bản mới nhất)

`shared/` là bộ dựng phim dùng cho **mọi phim mới**: engine rối giấy cộng thêm lớp điện ảnh `fx.js`.
Phim đã đăng giữ nguyên mã cũ của chúng; khuôn này chỉ dùng từ phim sau trở đi.

Bắt đầu phim mới:

```bash
mkdir -p projects/<tên> && cp -r templates/film/shared projects/<tên>/shared
# sửa shared/js/cast.js (nhân vật của phim), shared/map/spec.json (vùng bản đồ) rồi tools/map_render.py
```

`examples/` — chương "Ides tháng Ba" làm thử với đủ hiệu ứng (`ides-scenes.js`, `ides-chapter.json`) và hai tranh
(`ides-dao`: 3 lớp, `ides-toga`: 1 lớp).

## Lớp điện ảnh — `shared/js/fx.js`

Gọi trong hàm cảnh, mỗi khung (tính theo t, tua tới đâu cũng đúng):

| Lệnh | Dùng khi |
|---|---|
| `fx.grade("night" \| "dusk" \| "dawn" \| "storm" \| "fire" \| "gold" \| "cold" \| "blood" \| "memory" \| "tense", a)` | màu theo không khí cảnh |
| `fx.particles("dust" \| "embers" \| "rain" \| "snow" \| "ash" \| "sparks" \| "petals" \| "smoke", t, a, {n, area, wind})` | bụi nắng, tàn lửa, mưa, hoa khải hoàn, khói cháy |
| `fx.fog(t, a, {y})` | sương sông, sáng sớm, chiến trường |
| `fx.glow([x, y], r, "#ff9a3c", a, t)` | ánh đuốc, lò lửa, đèn dầu — đặt nguồn ngoài mép khung nếu phông không có đuốc |
| `fx.rays(t, a, {from, angle})` | tia nắng qua cửa sổ, đền đài |
| `fx.lightning(t, [t1, t2])` | sét trong bão |
| `fx.bars(a)` | viền đen 2.35:1 cho khoảnh khắc lớn |
| `fx.focus(S, a)` | phông mờ khi camera đẩy vào cận cảnh (chapter_build tạo sẵn `<phông>.blur.jpg`) |
| `fx.shake(camera, t, amp)` | rung khi va chạm, đại bác |
| `fx.tableau(spec, t, a, b)` | tranh cận cảnh nhiều lớp, camera lướt có chiều sâu — hàm cảnh trả `null` |

Chuyển cảnh: `export const TRANSITIONS = [{ t, kind: "ink" | "burn" | "paper" | "flash", d }]` trong `scenes.js`
(thay cho `DIPS` mờ đen ở những chỗ cần).

Camera cận cảnh: đẩy `look()` từ z≈8.5 (toàn cảnh) xuống z≈4.5 (trung cảnh) vào người đang nói, kèm `fx.focus`.
Đầu rối 270×380 px nên trung cảnh vẫn nét.

## Tranh cận cảnh — `tools/tableau.py`

```bash
.venv/bin/python -I tools/tableau.py projects/<tên>/tableaux/<id>/tableau.json
```

`tableau.json`: `light` (chung cho mọi lớp), `bg` (tấm nền, không người), `mid`/`fg` (nhân vật trên nền hồng → tách
nền), hoặc `"flat": true` (một ảnh gồm cả người, không thị sai). Thêm `"tableaux": ["<id>"]` vào `chapter.json`.
Kinh nghiệm: lớp tiền cảnh dễ bị AI tô tối phần giữa — xem lớp trên nền xanh trước khi dùng; cảnh một nhân vật lặng
lẽ thì dùng `flat`. Không vẽ máu, vết thương; bạo lực chỉ gợi (dao giơ lên, ngã vào bóng tối).

## Nhân vật và con vật vẽ nguyên hình

Rối ghép mảnh (đầu, thân, đùi… xoay quanh khớp) sửa mãi vẫn lòi lỗi cổ, chân, khớp. Cách ngành hoạt hình làm với
những gì khớp không giả được là **thay hình**: vẽ nguyên hình cho mỗi tư thế, chiếu nối tiếp. mô hình ảnh vẽ một hình mẫu,
rồi vẽ lại từng khung từ chính hình mẫu đó (sửa ảnh theo ảnh mẫu) nên giữ đúng một nhân vật.

| Loại | Dùng cho | anim.json `type` |
|---|---|---|
| Con vật | ngựa, voi (đi, phi) — yên/bành và người rối ngồi trên lưng theo từng khung | `horse`, `elephant` |
| Người | nhân vật chính và nhân vật cận cảnh: đứng, các khung đi, mọi tư thế kịch bản cần | `person` |
| Người cưỡi ngựa | người và ngựa vẽ chung một hình (đi, phi) — không lỗi cổ, chân bàn đạp | `rider` |

```bash
mkdir -p library/anims/<id> && $EDITOR library/anims/<id>/anim.json     # mẫu: library/anims/tuong-la-ma, …-ngua, ngua-chien
.venv/bin/python -I tools/anim_frames.py library/anims/<id>              # vẽ hình mẫu rồi các khung (3 hình cùng lúc)
.venv/bin/python -I tools/anim_frames.py --cut library/anims/<id>        # tách nền, cùng cỡ, cùng mặt đất → frames/
.venv/bin/python -I tools/rigtest.py /tmp/x.png --anims <id>              # soi từng khung; --video 6 → /tmp/x.mp4
```

Trong `chapter.json`: `"assets": ["anims/<id>", …]`. Trong cảnh:
- con vật: `makeAnimMount(scene, "<id>@anim")` + `poseAnimMount(m, "walk" | "gallop", sải)`; người rối ngồi lên:
  `rideOn(m, figure)` + `applyPose(figure, RIDING)`.
- người, người cưỡi: `makeAnimPerson(scene, "<id>@anim")` + `poseAnimPerson(p, "walk", sải)` hoặc
  `poseAnimPerson(p, "act3")`; quay mặt: `p.root.scale.x = -1`.
- Nhịp: đi ~6–8 hình/giây (người ~1 sải/giây, ngựa ~0,9, voi ~0,6), phi ~2 sải/giây.

**Kế thừa, không vẽ lại:** con vật và vai phụ (đám đông, lính, dân) dùng lại giữa các phim. Mỗi loại áo chỉ một
người được vẽ khung đi và các dáng; những người cùng áo chỉ có hình đứng (mặt riêng) và mượn khung của người đó
(`tools/cast_draw.py` LEADS, `chapter_build.py`). Chỉ vai chính có tên của mỗi phim mới vẽ trọn bộ.

Thiếu tư thế thì thêm một dòng vào `cycles` trong anim.json và chạy lại (chỉ vẽ hình còn thiếu). Rối ghép mảnh vẫn
dùng được cho đám đông, lính ở xa.

## Rig rối — kiểm tra nhanh bằng canvas, không render

```bash
.venv/bin/python -I tools/rigtest.py /tmp/rig.png                               # 5 nhân vật × 14 tư thế, ~8 s
.venv/bin/python -I tools/rigtest.py /tmp/rig.png <kit>[:<bộ đầu>:<headN>] --poses "đứng,ngồi,quỳ" --marks
.venv/bin/python -I tools/rigtest.py /tmp/all.png --all --per 6                  # cả thư viện, ~20 s
.venv/bin/python -I tools/rigtest.py /tmp/thu.png --mounts                         # ngựa, voi: đứng, 4 pha bước, phi
.venv/bin/python -I tools/rigtest.py /tmp/thu.png --mounts voi-chien --rider <kit>  # một con, người cưỡi khác
```

Sửa engine/khớp xong thì chạy cái này, đừng render cả chương. Làm phim mới: chạy trước cho **mọi hành động phim dùng**
(đi, ngồi, quỳ, cưỡi, con vật) với đúng bộ đồ của phim. `--marks`: chấm đỏ cổ, xanh dương vai/hông, xanh lá
khuỷu/gối. Rig:
- **Cổ** — đầu xoay ở gáy (`neck`, `neckLen` trong `parts.json`, đo trên ảnh: `asset.py` tự đo khi cắt; thư viện cũ
  đã chạy `repivot`), cổ lún vào hốc cổ áo (`neckSocket`) theo độ dài cổ của từng hình; chỉnh chung ở `NECK`.
- **Tiếp đất** — hông nâng theo điểm thấp nhất: đế giày, mũi chân (bàn chân vẽ trên mảnh cẳng chân) hay đầu gối.
- **Ngồi** (`SEATED`, `sit`) — đặt `root.position.y` = mặt ghế (hoặc `seatH`) trước `applyPose`: chân tự gập cho bàn
  chân chạm đất; ngai quá cao thì chân buông.
- **Quỳ** (`KNEEL`, `kneel`) — chân trước giữ góc, chân sau tự tính cho đầu gối và mũi chân cùng chạm đất.
- **Giáo, súng, gậy dựng đứng** — đuôi không bao giờ xuyên đất (chống đất; trên ngựa thì tựa ngang bàn đạp); tay buông
  thì cầm hơi ra trước cho cán khỏi che mặt.
- **Khiên** — ngồi hoặc quỳ thì đặt xuống (`keepShield: true` để giữ).
- **Viền hồng** ở mép mảnh (đầu gối, khuỷu) được khử trong shader.
- **Ngựa, voi** — mỗi khung thân con vật hạ/nâng cho móng thấp nhất chạm đất (trước đây chân vung là cả con lơ lửng);
  chỉ khi phi (`amp > 1`) mới nảy khỏi đất. Người cưỡi voi ngồi sau thành bành (chân khuất, ngực trên thành).

## Thêm từ các phim gần đây

- `chapter.json` của chương: `"hold": giây` — cắt sang chương sau đúng chừng ấy giây sau câu cuối (thay vì giữa khoảng
  lặng), để chỗ cho một clip như intro kênh. Mốc `at`/`until` nhận `[n, "end+0.3"]` (giây sau khi câu n đọc xong) —
  đúng cho mọi bản ngôn ngữ.
- Clip `"overlay": true`: WebM có nền trong suốt (`hyperframes render --format webm`) đè lên hình thay vì thay hình —
  dùng cho thẻ thông tin đầu phim. Clip theo ngôn ngữ: `clips/<tên>.<lang>.webm`.
- Chuyển cảnh mực: bộ lọc SVG dùng `color-interpolation-filters="sRGB"` (trước đây mực ngả xanh lá).
- Phông vẽ mới có nền đất cao: góc máy mặc định chỉ thấy đất → dùng phông nhỏ, gần, thấp hơn
  (`stage(id, { width: 18, height: 12, z: -5, y: 2.6 })`, xem `projects/my-channel/hannibal/shared/js/stage.js`); soát
  bằng `tools/frames.py` trước khi render.
- Tư liệu thật (ảnh có ghi nguồn) và bàn cờ trận nhìn từ trên: `projects/my-channel/hannibal/shared/js/han.js`
  (`archival`, `board`, `block`, `track`). Nhạc nền đàn oud: `tools/synth_audio.py --bed oud`.
