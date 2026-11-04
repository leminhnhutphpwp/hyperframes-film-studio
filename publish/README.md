# publish/ — đăng video và đọc số liệu

Cài một lần: `cd publish && npm install`. Chạy mọi lệnh từ gốc studio.
`<project>` là thư mục phim (`projects/<kênh>/<phim>[/<phần>]`); kênh suy ra từ thư mục đó.
Lệnh cấp kênh cần `--channel=<kênh>` (tên thư mục trong `channels/`, ví dụ `my-channel`). `--lang=en` chọn bản `.en` của file trong `publish/`.

| Lệnh | Làm gì | Loại |
|---|---|---|
| `node publish/youtube/analytics.js --channel=<kênh> [--days 90]` | Số liệu thật của kênh: nguồn view, từ khoá tìm, giữ chân từng video | chỉ đọc |
| `node publish/youtube/retention.js <project\|videoId> [--days 120]` | Người xem rời đi ở chương nào | chỉ đọc |
| `node publish/youtube/research.js --channel=<kênh> "chủ đề"` | Tìm kênh cùng sân, tập vượt trội → ghi `channels/<kênh>/research/` | chỉ đọc YouTube (tốn hạn mức) |
| `node publish/facebook/comments.js --channel=<kênh>` | Liệt kê bình luận fanpage chưa trả lời | chỉ đọc |
| `node publish/youtube/upload.js <project>` | Tải video RIÊNG TƯ + thumbnail, bản dịch, playlist, phụ đề (nếu meta có) | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/set-privacy.js <project> public\|unlisted\|private` | Đổi chế độ hiển thị | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/set-title.js <project>` | Đổi tiêu đề theo `youtube-meta*.json` | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/localize.js <project>` | Thêm tiêu đề/mô tả dịch (`localizations`) | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/captions.js <project> --langs vi` | Tải track phụ đề .srt | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/comment.js <project>` | Bình luận đầu từ `publish/comment.txt` | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/delete.js <project>` | XOÁ HẲN video, dọn bản ghi | **chủ kênh đồng ý** (`--yes`) |
| `node publish/facebook/video.js <project> --video=<file>` | Đăng nguyên tập lên fanpage + ảnh bìa + bình luận link | **chủ kênh đồng ý** (`--yes`) |
| `node publish/facebook/photo.js <project>` | Đăng bài ảnh lên fanpage + bình luận link | **chủ kênh đồng ý** (`--yes`) |
| `node publish/facebook/comments.js --channel=<kênh> --reply <id> "…"` | Trả lời một bình luận đã duyệt | **chủ kênh đồng ý** (`--yes`) |
| `node publish/youtube/auth.js --channel=<kênh>` / `publish/facebook/auth.js` | Đăng nhập lại, lưu token vào `secrets/<kênh>/` | chủ kênh tự chạy |

## Luật

- Không có `--yes` thì mọi lệnh chỉ **xem trước**: in ra việc sẽ làm, không gửi gì.
- Agent **không bao giờ** chạy upload, set-privacy, set-title, localize, delete, captions, comment (YouTube hay
  Facebook) với `--yes` nếu chủ kênh chưa nói rõ cho **đúng video đó**. Đồng ý một lần không áp cho video khác.
- Tải lên luôn **riêng tư**. Chế độ khác chỉ khi có cả `--privacy=<x>` và `--yes`. Công khai, lên lịch, màn hình kết
  thúc: chủ kênh làm trong Studio.
- Bản tiếng Anh không lên kênh tiếng Việt (upload.js từ chối khi ngôn ngữ video khác ngôn ngữ kênh).
- Video đã đăng thì không tải lại (`publish/youtube[.<lang>].json` có là bỏ qua).
- Token theo từng kênh: `secrets/<kênh>/youtube-token.json`, `secrets/<kênh>/facebook-token.json` (git bỏ qua, không
  in ra). Mỗi lệnh kiểm token có đúng kênh trong `channels/<kênh>/channel.js` không — sai là dừng.

## Ghi lại

- `<project>/publish/youtube[.<lang>].json` — videoId, url, status của project.
- `channels/<kênh>/published/<videoId>.json` — sổ video đã đăng của kênh.
- `<project>/publish/facebook.json` — bài đã lên fanpage.
- Video đã dựng nằm trong `<project>/out/` hoặc kho `$STUDIO_ARCHIVE/<cùng đường dẫn> (mặc định archive/)`; lệnh tự tìm cả hai.
