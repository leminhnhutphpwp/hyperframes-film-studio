# Khuôn Shorts dọc (1080×1920)

Một Short đứng riêng (không cắt từ phim dài): tranh dọc vẽ riêng phủ kín khung, camera trôi chậm, hoà tan giữa cảnh,
chữ từng câu đốt vào hình (tô vàng tên riêng / năm), thẻ năm + địa danh, tiêu đề cố định ở trên, giọng + nhạc nền +
tiếng động có fade. Cấu trúc một Short: `projects/<kênh>/<tên-short>/`.

```bash
P=projects/<kênh>/<tên>
# 1. source/facts.md (mỗi chi tiết một nguồn) → narration.vi.txt ("NNN câu", dòng trống = ngắt đoạn) — duyệt trước khi thu giọng
runtime/venv-vieneu/bin/python tools/tts_vieneu.py $P/narration.vi.txt $P/audio/vi-story --voice "Hải Đăng"
.venv/bin/python -I tools/assemble_narration.py $P/narration.vi.txt $P/audio/vi-story $P/audio/vi-story/loi-ke-toan-bo.m4a --lead 0.3 --gap 0.6
# 2. tranh: $P/tableaux/sNN/tableau.json với "flat": true, "portrait": true → (báo số tranh trước)
.venv/bin/python -I tools/tableau.py $P/tableaux/s*/tableau.json
# 3. nhạc nền tự tạo (đàn tranh ngũ cung) — hoặc chọn trong library/sfx
.venv/bin/python -I tools/synth_audio.py $P/audio/sfx --bed tranh --bed-seconds 100
# 4. short.json (cảnh, thẻ năm, tiếng động — xem đầu build.py) → dựng, kiểm, render
.venv/bin/python -I templates/short/build.py $P
(cd $P/build && npx --yes hyperframes@0.8.152 check && npx --yes hyperframes@0.8.152 render --workers 4 --output ../out/<tên>.mp4)
```

- Chữ cắt theo cụm nghĩa (≤ ~48 ký tự, 2–3 dòng), không tách tên trong `highlight` / `keep`, không để từ treo cuối
  dòng ("của", "ba"…); câu cuối (câu hỏi cho người xem) giữ nguyên cả câu tới hết thẻ kết.
- Vùng an toàn của Shorts: chữ nằm ở y 1180–1440, chừa 120 px bên phải (nút YouTube) và đáy (tên kênh, mô tả).
- `build/` là bản dựng (git bỏ qua); `out/` → lưu trữ bằng `tools/archive_videos.py` khi đã đăng.
