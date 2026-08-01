# Kịch bản quay demo QuietSignal end to end

Thời lượng đề xuất: **4–5 phút**. Quay trên
<https://quitesignal.vercel.app> hoặc `http://localhost:5173`.

## Chuẩn bị trước khi quay

- Dùng hai cửa sổ hoặc hai browser profile độc lập:
  - **Ví A:** tạo market và tham gia thứ nhất.
  - **Ví B:** tham gia thứ hai.
- Cả hai ví dùng Ethereum Sepolia, có Sepolia ETH và tối thiểu `2 QSCC`.
- Không quay seed phrase, private key, file `.env`, developer tools hoặc calldata.
- Để tiết kiệm thời gian, có thể chuẩn bị sẵn QSCC nhưng vẫn quay nhanh thao tác
  **Mint → Wrap → Reveal** trên một ví.
- Mỗi khi hiện popup ví, chỉ tiếp tục sau khi toast góc dưới bên phải báo giao dịch đã
  xác nhận.

## Kịch bản chính

### 1. Overview — giới thiệu sản phẩm

1. Mở **Overview** khi chưa kết nối ví.
2. Lướt nhanh phần mô tả `PRIVATE`, `COMPUTE`, `PUBLIC`, `PENDING`.
3. Chỉ vào thanh điều hướng cố định: **Overview · Markets · Portfolio · Create**.

Lời nói gợi ý:

> QuietSignal là prediction market trên Ethereum Sepolia. Xác suất và collateral của
> từng người được mã hóa; trạng thái lifecycle và kết quả tổng hợp là dữ liệu công khai.

### 2. Markets — xem market công khai không cần ví

1. Vào **Markets** khi chưa connect.
2. Cho thấy danh sách **Verified pools** và pool đang chọn ở cột bên phải.
3. Mở nhanh bộ lọc đang mặc định **All pools**, chọn thử một điều kiện rồi trả về All.
4. Bấm icon refresh cạnh tiêu đề Markets.

Nhấn mạnh: xem pool, điều kiện, deadline và participant gate không cần ký giao dịch.

### 3. Portfolio — chuẩn bị collateral bằng Ví A

1. Kết nối **Ví A** trên Sepolia.
2. Vào **Portfolio** và cho thấy các số dư ETH, QSFC, QSCC trên header và trang.
3. Nhập Amount `2`.
4. Bấm **Mint QSFC**, xác nhận và chờ receipt.
5. Bấm **Wrap QSCC**:
   - nếu thiếu allowance, xác nhận approval;
   - sau đó xác nhận wrap.
6. Bấm **Reveal QSCC** và cho thấy số dư riêng tư chỉ được mở trong session hiện tại.

### 4. Create — tạo một market thật

Vẫn dùng Ví A:

1. Vào **Create**.
2. Chọn:
   - Condition: `ETH/USD ≥ threshold`;
   - Threshold: `2000`;
   - Commit window: `5 minutes` nếu cả hai ví đã sẵn collateral, nếu không dùng
     `15 minutes`;
   - Participant gate: `2`.
3. Bấm **Create verified market**.
4. Xác nhận lần lượt transaction tạo adapter và tạo pool.
5. Chờ toast xác nhận, rồi cho thấy địa chỉ pool, condition, deadline và gate.

### 5. Ví A gửi forecast thứ nhất

1. Vào **Markets**, chọn pool vừa tạo.
2. Bấm refresh market và kiểm tra commit window còn mở.
3. Trong **Make forecast**, nhập:
   - Collateral: `1.00`;
   - Probability: `70`.
4. Bấm **Encrypt and submit forecast** và xác nhận các yêu cầu ví theo thứ tự.
5. Chờ hoàn tất, sau đó cho thấy nút đổi thành **Forecast already submitted**.

Lời nói gợi ý:

> Trình duyệt chuyển 70% thành 7.000 basis points rồi mã hóa cục bộ. Giao diện không
> công khai xác suất hoặc collateral của vị thế này.

### 6. Đổi sang Ví B và gửi forecast thứ hai

Chuyển sang Browser B để việc đổi ví dễ nhìn và tránh nhầm account:

1. Kết nối **Ví B** trên Sepolia.
2. Vào **Portfolio**, Mint/Wrap/Reveal `2 QSCC` nếu chưa chuẩn bị trước.
3. Vào **Markets** và bấm refresh để tìm pool Ví A vừa tạo.
4. Chọn đúng pool, kiểm tra cùng address, condition, deadline và gate `2`.
5. Nhập forecast:
   - Collateral: `1.00`;
   - Probability: `30`.
6. Bấm **Encrypt and submit forecast**, xác nhận và chờ hoàn tất.
7. Refresh lifecycle và cho thấy **Participants: 2**.

### 7. Trước deadline — giải thích các nút Lifecycle

Trong pool đang chọn, kéo đến **Lifecycle**:

1. Cho thấy hai nhóm **Advance lifecycle** và **Recovery paths**.
2. Hover nhanh vào một nút bị khóa để hiện điều kiện sử dụng.
3. Cho thấy **Close window** chưa dùng được vì deadline chưa tới.

Không thử ký một nút đang bị khóa.

### 8. Chờ deadline rồi chạy lifecycle

Chèn title card: **Waiting for the immutable Sepolia deadline**. Không đổi giờ máy.

Sau deadline, dùng Ví A hoặc Ví B:

1. Bấm icon refresh ở Lifecycle.
2. Bấm **Close window**, xác nhận và chờ receipt.
3. Refresh, bấm **Request proof**, xác nhận và chờ receipt.
4. Bấm **Finalize aggregate**, chờ Nox tạo attestations, xác nhận transaction.
5. Refresh và cho thấy:
   - Public YES allocation;
   - Public NO allocation;
   - Total collateral;
   - trạng thái chờ settlement.
6. Khi **Settle from price feed** khả dụng, bấm và xác nhận.
7. Refresh và cho thấy trạng thái **Settled**, giá Chainlink, round và outcome.

Nếu một nút chưa khả dụng, hover để đọc điều kiện rồi chờ đúng mốc on-chain; không cố
gửi transaction.

### 9. Reveal kết quả và nhận thưởng bằng Ví A

1. Chuyển lại Browser A / Ví A.
2. Chọn đúng pool và kéo đến **Your position**.
3. Bấm **Reveal with owner wallet**.
4. Cho thấy collateral, probability và card **Estimated payout**.
5. Dừng hình ở công thức:

   `Payout = floor(your winning allocation × total collateral ÷ public winning allocation)`

6. Bấm **Materialize score**, xác nhận, rồi Reveal lại để xem score.
7. Bấm **Claim payout**, xác nhận và chờ receipt.
8. Cho thấy trạng thái **Claimed** và số dư QSCC vừa được refresh.

### 10. Chứng minh owner isolation bằng Ví B

1. Chuyển sang Browser B / Ví B.
2. Reveal cùng pool và cho thấy đây là vị thế riêng của Ví B.
3. Quay nhanh payout/formula khác của Ví B.
4. Claim payout của Ví B nếu cần chứng minh cả hai người đều nhận được kết quả.

Đổi account hoặc network phải làm nội dung owner bị che lại; không có ví nào xem được
vị thế riêng của ví còn lại.

## Cảnh bổ sung ngắn: market thiếu người và refund

Phần này có thể quay riêng rồi ghép khoảng 30–45 giây:

1. Ví A tạo pool mới với gate `2` và deadline ngắn.
2. Chỉ Ví A gửi một forecast; Ví B không tham gia.
3. Chờ deadline, refresh rồi bấm **Close window**.
4. Cho thấy pool chuyển sang **Refundable**, không đi qua aggregate hoặc settlement.
5. Ví A bấm **Reveal with owner wallet**.
6. Cho thấy refund amount, bấm **Request refund** và xác nhận.
7. Cho thấy trạng thái **Refunded** cùng số dư QSCC đã cập nhật.

## Thứ tự dựng video cuối cùng

1. Overview và privacy boundary.
2. Markets công khai khi chưa kết nối ví.
3. Ví A: Portfolio → Create → forecast 70%.
4. Ví B: Portfolio → tìm pool toàn cầu → forecast 30%.
5. Participants đạt 2 và các điều kiện Lifecycle.
6. Chờ deadline → Close → Request proof → Finalize aggregate → Settle.
7. Ví A Reveal → công thức payout → Materialize score → Claim.
8. Ví B Reveal để chứng minh owner isolation.
9. Cảnh phụ dưới ngưỡng → Refundable → Request refund.

## Checklist trước khi xuất video

- Có Overview, Markets, Portfolio và Create.
- Có hai ví độc lập tham gia cùng một pool thật trên Sepolia.
- Có Mint, Wrap, Reveal QSCC và số dư global trên header.
- Có tạo pool, global discovery và hai forecast mã hóa.
- Có participant count `2`, deadline và đầy đủ lifecycle thành công.
- Có public aggregate, Chainlink outcome, payout formula, score và claim.
- Có nhánh dưới ngưỡng và refund.
- Không xuất hiện private key, seed phrase, `.env`, raw handles, proofs, signatures hoặc
  confidential calldata.
