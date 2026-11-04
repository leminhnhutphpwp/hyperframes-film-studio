# Quy trình làm một video lịch sử rối giấy

Tổng quan từ ý tưởng đến lúc đăng lên kênh. Các lệnh chạy ở thư mục gốc của studio.
Mỗi phim thuộc một kênh: `projects/<kênh>/<tên>`; bản sắc và luật riêng của kênh ở `channels/<kênh>/README.md` — đọc trước khi viết.
Chương mẫu có sẵn: `templates/film/examples/` (chương "Ides tháng Ba", dùng bộ asset khởi đầu trong `library/`).

```
nguồn → lời kể VI → giọng đọc → tài nguyên hình → dựng cảnh → kiểm tra → render → kiểm tra phim
      → thumbnail → tiêu đề/mô tả → đăng (riêng tư) → công khai khi đã duyệt
```

## Cấu trúc một dự án

```
projects/<kênh>/<tên>/
  source/            kịch bản gốc, facts.md (đối chiếu mốc, nguồn thứ hai ngoài Wikipedia)
  narration.vi.txt   lời kể: "NNN câu", dòng trống = ngắt đoạn, "# ── Chương N · Tên" = chương
  audio/vi-story/    pNN.wav, lines.json, timing.json, loi-ke-toan-bo.m4a
  audio/sfx/         âm thanh tự tạo (súng, đại bác, nền nhạc)
  chNN/              chapter.json + js/scenes.js (cảnh của chương); index.html, js/data.js do chapter_build sinh ra
  shared/            engine.js, stage.js, overlay.js, map.js, template.html, chapter_build.py, map/spec.json
  battles/<trận>/    battle.json → battles/render.sh → clips/<trận>.webm
  render_all.sh      dựng + render mọi chương, ghép, trộn nhạc nền → out/<tên>.mp4
  publish/           youtube-meta.json, thumb/ (art.png, art.txt, thumb.json), thumbnail.jpg, youtube.json (bản ghi đăng)
  archived.json      video/bản dựng đã chuyển sang ổ lưu trữ (tools/archive_videos.py ghi)
```

Dự án mới: `mkdir -p projects/<kênh>/<tên>` rồi chép `templates/film/shared` (engine mới nhất + lớp điện ảnh `fx.js`; xem `templates/film/README.md`).
Phim đã đăng **không dựng lại** để thêm hiệu ứng mới — cải tiến chỉ áp dụng từ phim sau.

## 0. Mỗi phim phải khác phim trước (đọc trước khi bắt đầu)

YouTube không cấm giọng máy hay hình AI, nhưng không cho kiếm tiền với kênh mà video "trông như dập khuôn" (chính sách
inauthentic content, 7/2025). Lỗi hay gặp: nhiều tập gần như cùng một phim — cùng phông, rối nhỏ đứng thành hàng
ở cảnh toàn, không cận cảnh, một màu suốt phim. Vì vậy mỗi phim:

1. **Trước khi viết** — ghi vào `source/facts.md`: một câu luận điểm của phim (góc nhìn, không kể kiểu bách khoa),
   2 chi tiết ít người biết hoặc chỗ sử gia tranh cãi, nguồn thứ hai ngoài Wikipedia.
2. **Trước khi dựng** — ghi trong README dự án: cảnh đặc trưng chỉ phim này có (ví dụ hai vòng vây của một trận công thành); kiểu mở đầu khác phim trước (cảnh mạnh / câu hỏi / một đồ vật); bảng màu theo chương
   (`fx.grade`); 1–2 tranh cận cảnh (`tools/tableau.py`) cho mỗi khoảnh khắc cảm xúc; ít nhất một cảnh đêm, thời tiết
   hay ánh lửa nếu câu chuyện có; số chương theo câu chuyện, không cố định.
3. **Phông và nhân vật** — vẽ phông mới cho bối cảnh chính của phim; không dùng lại phông đã là cảnh chính của phim
   trước. Camera không đứng mãi ở cảnh toàn: đẩy vào trung cảnh người đang nói (`fx.focus`).
4. **Trước khi render bản cuối** — đặt phim mới cạnh 2 phim trước:
   `.venv/bin/python -I tools/filmsheet.py /tmp/so.jpg <phim mới>.mp4 <phim trước>.mp4 <phim trước nữa>.mp4`.
   Hàng nào nhìn như cùng một phim thì sửa.
5. **Sau khi đăng** — ghim một bình luận có câu hỏi thảo luận; sau ~1 tuần xem biểu đồ giữ chân người xem trong Studio,
   ghi chỗ người xem bỏ đi vào README dự án để rút kinh nghiệm phim sau.

## 1. Nguồn và lời kể — `narration.vi.txt`

- Văn **kể chuyện**, viết thẳng bằng tiếng Việt (không dịch từng câu); giọng đọc trước, hình chạy theo giọng.
- Mở 10–15 s bằng cảnh mạnh nhất rồi mới vào thẻ tiêu đề; chừa ~15 s cuối cho màn hình kết thúc YouTube.
- Mốc năm mở bằng "Vào năm…,"; năm bắt đầu bằng 5 viết "Vào năm… 52" để giọng ngắt giữa hai chữ "năm"; "5 năm" viết
  "nửa chục năm".
- Chỗ sử gia còn tranh cãi thì nói rõ, nhưng chỉ ở chỗ thật cần; số liệu của một bên (Caesar, Plutarch) ghi là của họ.

## 2. Giọng đọc

```bash
P=projects/<kênh>/<tên>; mkdir -p $P/audio/vi-story
runtime/venv-vieneu/bin/python tools/tts_vieneu.py $P/narration.vi.txt $P/audio/vi-story   # Quốc Tuấn
.venv/bin/python -I tools/assemble_narration.py $P/narration.vi.txt $P/audio/vi-story $P/audio/vi-story/loi-ke-toan-bo.m4a --pause 3=2.6
```

`runtime/` (venv + model VieNeu/Kokoro) không lên git — cài lại: `docs/setup.md`. Đọc theo đoạn (ngữ điệu liền mạch). `--pause N=giây` là khoảng lặng sau câu N cho thẻ tiêu đề. Sửa một đoạn:
`--only 5,7` rồi ghép lại.

## 3. Tài nguyên hình (thư viện `library/`)

Tra trước, chỉ vẽ cái còn thiếu: `.venv/bin/python -I tools/asset.py list --era ... --text ...`.
Vẽ qua mô hình ảnh cấu hình trong `.env` (`asset.py draw kit|heads|props|cutout|backdrop|terrain ...`), **tối đa 3 hình cùng lúc**, không chạy song
song với render hay TTS (máy hết RAM). Gom lệnh vẽ của một dự án vào `$P/batches/<tên>_batch.sh` để chạy lại được (đợt vẽ cho thư viện chung, không thuộc phim nào: `tools/batches/`).
Id tài nguyên không được trùng (chapter_build dừng nếu trùng). Bản đồ: `tools/map_render.py shared/map/spec.json ...`.
Thư viện âm thanh có sẵn: `library/sfx/CATALOG.md` (gió, mưa, chợ, thú vật, nhạc ngắn — đã kiểm giấy phép). Âm thanh tự tạo, không tải: `tools/synth_audio.py` (súng, đại bác, tiếng gươm, nền lyre/tanpura). Nhạc tải về: hỏi trước.

## 4. Dựng cảnh

Nhân vật chính, nhân vật cận cảnh, con vật, người cưỡi ngựa: **vẽ nguyên hình** từng tư thế
(`tools/anim_frames.py`, `templates/film/README.md`) — liệt kê trước mọi tư thế kịch bản cần. Rối ghép mảnh chỉ cho
đám đông, lính ở xa.
Trước khi dựng: chạy `tools/rigtest.py` cho mọi hành động phim dùng (đi, ngồi, quỳ, cưỡi ngựa/voi, con vật) với đúng
bộ đồ của phim — vài giây một tấm ảnh, lệch cổ/khớp/chân lún thấy ngay (`templates/film/README.md`).
Mỗi chương: `chNN/chapter.json` (tài nguyên, nền, clip trận) + `chNN/js/scenes.js`. Cảnh bám giọng bằng
`cue(n, "chữ")` — thời điểm chữ đó trong câu n. Trận đánh: `templates/battle` → `battles/<trận>/battle.json`
(`fire`, `rout`, `charge`, `volleyLoss`) → `battles/render.sh` → `clips/*.webm`.

```bash
.venv/bin/python -I $P/shared/chapter_build.py $P/ch03          # sinh index.html + js/data.js
.venv/bin/python -I tools/framecheck.py $P/ch0*                 # CUT / MAP / BIG
```

Lớp điện ảnh (màu, ánh sáng, bụi, mưa, viền đen, tranh cận cảnh, chuyển cảnh mực/giấy): `templates/film/README.md`.
Xem nhanh vài khung: `tools/frames.py <chương> /tmp/f --times 1,5,9 --scale 0.5`. Lỗi hay gặp: camera xa quá thấy mép bản đồ, tàu trên cạn, đạo cụ to bất thường,
nhân vật bị cắt ở mép.

## 5. Render

```bash
NODE_OPTIONS=--max-old-space-size=8192 $P/render_all.sh          # hoặc: $P/render_all.sh 03 04 (vài chương)
```

4 tiến trình (`WORKERS=`), ~1–3 phút một chương. Chỉ một lần render một lúc. Ra `out/<tên>.mp4` + `out/chapters.txt`.
Sau khi ghép xong, bản render chương được chuyển sang ổ lưu trữ ở bước 11.

## 6. Kiểm tra phim

```bash
F=$P/out/<tên>.mp4
ffmpeg -v info -i $F -vf blackdetect=d=0.5:pix_th=0.06 -an -f null - 2>&1 | grep blackdetect   # chỉ được có đoạn mờ cuối
ffmpeg -v error -y -i $F -vf "select='isnan(prev_selected_t)+gte(t-prev_selected_t\,30)',scale=384:216,tile=5x4" -frames:v 1 /tmp/sheet.jpg
```

Chú ý: phải `-v info` thì blackdetect mới in ra; xem tờ ảnh để soát chữ, khung hình, clip trận có đủ dài không.

## 7. Thumbnail

Vẽ riêng, **không** cắt khung từ phim. Nên thử **ảnh tả thực kiểu phim điện ảnh** (`--real`, thường hút
người xem hơn tranh giấy) với câu chữ gợi tò mò nhưng đúng nội dung phim. Nguyên tắc (không phải khuôn cố định — mỗi video nghĩ ý riêng cho nổi bật):
một chủ thể lớn với cảm xúc rõ (mặt cận, đối đầu, tương phản quy mô, một đồ vật nói lên câu chuyện), ánh sáng gắt, nền
tối; 2–4 chữ in đậm làm "móc" — không lặp tiêu đề; nhãn nhỏ cho loạt (JULIUS CAESAR · PHẦN 1). Xem ở cỡ ~200 px.

```bash
.venv/bin/python -I tools/thumb_art.py $P/publish/thumb/art.png --real --side left "Close-up of ... tense stare ..."
python3 tools/thumbnail.py $P/publish/thumb/thumb.json        # → publish/thumbnail.jpg (+ bản phụ nếu có)
```

`thumb.json`: mỗi mục `art`, `out`, `lines` (dòng 1 trắng, dòng 2 vàng), `badge`, `side` (left/right/top/bottom),
`font` (sans/serif), `fs`, `pos` (khung cắt), `c1`/`c2`, `fade`, `margin`. Lưu mô tả vẽ vào `art.txt` để vẽ lại được.

## 8. Tiêu đề, mô tả — `publish/youtube-meta.json`

`title`, `description` (tóm tắt, ghi chú nguồn/độ chính xác, **mốc chương** theo `out/chapters.txt`, danh sách nguồn,
hashtag), `tags`, `language: "vi"`, `privacyStatus: "private"`, `localizations.en` (tiêu đề + mô tả tiếng Anh).
**Không phụ đề** — lời kể đã là tiếng Việt.

## 9. Đăng

Chỉ đăng khi đã duyệt xong video đó. Lệnh chung cho mọi kênh (kênh suy ra từ thư mục project):

```bash
node publish/youtube/upload.js $P            # xem trước: file, thumbnail, kênh của token, playlist
node publish/youtube/upload.js $P --yes      # tải lên RIÊNG TƯ
```

Đọc `publish/youtube-meta.json` + `publish/thumbnail.jpg`, tìm video trong `out/` hoặc kho lưu trữ, kiểm token đúng kênh,
đặt thumbnail, bản dịch, danh sách phát; ghi `publish/youtube.json` và `channels/<kênh>/published/<videoId>.json`.
Đổi chế độ hiển thị, tiêu đề, bản dịch: `publish/README.md`. Công khai, lên lịch, màn hình kết thúc: làm trong YouTube Studio.

## 10. Bản tiếng Anh

Giọng Anh dùng kokoro (`tools/tts_vieneu.py --engine kokoro`), chuỗi chữ trong `strings.en.json`, dựng với `LANG_FILM=en`.
Bản khác ngôn ngữ có thể đăng lên kênh chị em (`languageChannels` trong `channel.js`).

## 11. Lưu trữ video

Đăng xong thì chuyển video và bản dựng ra ổ lưu trữ, giữ lại mã nguồn của phim:

```bash
.venv/bin/python -I tools/archive_videos.py $P            # xem trước
.venv/bin/python -I tools/archive_videos.py $P --apply    # chuyển sang $STUDIO_ARCHIVE/<kênh>/<tên>/ (mặc định archive/)
```

Chuyển mọi thứ git bỏ qua trong dự án (`out/*.mp4`, `chNN/renders/`, bản chép `shared/`, `assets/`, `shorts/*/build/`,
log); chữ trong `out/` (chapters.txt…) ở lại. Danh sách ghi vào `archived.json`. Không xóa gì.
Commit thẳng lên `main`.
