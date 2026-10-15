package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"boko/config"
	"boko/models"
)

// ============================================================================
// Email giao dịch — Resend HTTP API khi có RESEND_API_KEY, ngược lại dev-log.
//
// Dev-log: không gửi thật, chỉ ghi log + lưu bảng email_logs để kiểm thử local
// (xem GET /api/admin/email-logs). Nhờ vậy checkout/đăng ký không phụ thuộc
// provider khi phát triển.
// ============================================================================

const defaultAppBaseURL = "http://localhost:3000"

// AppBaseURL — gốc URL của frontend, dùng để dựng link trong email.
func AppBaseURL() string {
	if v := strings.TrimSpace(os.Getenv("APP_BASE_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	return defaultAppBaseURL
}

// mailFrom — địa chỉ người gửi (theo định dạng "Tên <email>").
func mailFrom() string {
	if v := strings.TrimSpace(os.Getenv("MAIL_FROM")); v != "" {
		return v
	}
	return "Boko <no-reply@boko.example>"
}

// SendEmail — gửi 1 email HTML. Luôn ghi nhật ký email_logs; trả lỗi để caller
// quyết định (không được làm hỏng luồng nghiệp vụ chính).
func SendEmail(to, subject, htmlBody string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("thiếu địa chỉ người nhận")
	}

	provider := "dev-log"
	var err error
	if apiKey := strings.TrimSpace(os.Getenv("RESEND_API_KEY")); apiKey != "" {
		provider = "resend"
		err = sendViaResend(apiKey, to, subject, htmlBody)
	} else {
		log.Printf("[email:dev-log] to=%s subject=%q (chưa cấu hình RESEND_API_KEY, không gửi thật)", to, subject)
	}

	status, errMsg := "sent", ""
	if err != nil {
		status, errMsg = "failed", err.Error()
		log.Printf("[email] gửi tới %s thất bại (%s): %v", to, provider, err)
	}

	if config.DB != nil {
		config.DB.Create(&models.EmailLog{
			To: to, Subject: subject, Provider: provider, Status: status, Error: errMsg, Body: htmlBody,
		})
	}
	return err
}

func sendViaResend(apiKey, to, subject, htmlBody string) error {
	payload := map[string]interface{}{
		"from":    mailFrom(),
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	}
	raw, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("resend HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// ==================== TEMPLATE ====================

func emailLayout(title, intro, bodyHTML string) string {
	shop := GetShopInfo()
	return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background:#1d4ed8;padding:20px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px;">` + html.EscapeString(shop.Name) + `</span>
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;">` + html.EscapeString(title) + `</h1>
      <p style="margin:0 0 20px;line-height:1.6;color:#334155;">` + html.EscapeString(intro) + `</p>
      ` + bodyHTML + `
    </div>
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6;">
      ` + html.EscapeString(shop.Name) + ` · MST: ` + html.EscapeString(shop.TaxCode) + `<br>
      ` + html.EscapeString(shop.Address) + `<br>
      Hotline: ` + html.EscapeString(shop.Phone) + ` · Email: ` + html.EscapeString(shop.Email) + `
    </div>
  </div>
</body></html>`
}

func ctaButton(label, url string) string {
	if strings.TrimSpace(url) == "" {
		return ""
	}
	return `<p style="margin:24px 0 4px;"><a href="` + html.EscapeString(url) + `" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">` + html.EscapeString(label) + `</a></p>`
}

func renderOrderTable(order models.Order) string {
	var rows strings.Builder
	for _, it := range order.Items {
		rows.WriteString(`<tr>
      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">` + html.EscapeString(it.Title) + `</td>
      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:center;">` + strconv.Itoa(it.Quantity) + `</td>
      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">` + formatVND(it.Price*float64(it.Quantity)) + `</td>
    </tr>`)
	}
	return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
    <thead><tr>
      <th style="text-align:left;padding:8px 0;border-bottom:2px solid #e2e8f0;color:#475569;">Sách</th>
      <th style="text-align:center;padding:8px 0;border-bottom:2px solid #e2e8f0;color:#475569;">SL</th>
      <th style="text-align:right;padding:8px 0;border-bottom:2px solid #e2e8f0;color:#475569;">Thành tiền</th>
    </tr></thead>
    <tbody>` + rows.String() + `</tbody>
  </table>
  <p style="margin:0 0 4px;font-size:15px;"><strong>Tổng cộng: ` + formatVND(order.Total) + `</strong></p>
  <p style="margin:0;font-size:13px;color:#64748b;">Mã đơn: <strong>#` + strconv.FormatUint(uint64(order.ID), 10) + `</strong>
  · Phương thức: ` + html.EscapeString(paymentMethodLabel(order.PaymentMethod)) + `</p>`
}

func paymentMethodLabel(method string) string {
	switch method {
	case "cod":
		return "Thanh toán khi nhận hàng (COD)"
	case "momo":
		return "Ví MoMo"
	case "vnpay":
		return "VNPAY"
	case "paypal":
		return "PayPal"
	case "atm":
		return "Thẻ ATM nội địa"
	case "bank":
		return "Chuyển khoản ngân hàng"
	default:
		if method == "" {
			return "COD"
		}
		return method
	}
}

// formatVND — định dạng tiền VND kiểu 1.234.567 ₫.
func formatVND(v float64) string {
	n := int64(v)
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.FormatInt(n, 10)
	var b strings.Builder
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(ch)
	}
	if neg {
		b.WriteString("-")
	}
	return b.String() + " ₫"
}

// ==================== EMAIL CỤ THỂ ====================

// SendPasswordResetEmail — gửi link đặt lại mật khẩu.
func SendPasswordResetEmail(to, name, resetURL string) error {
	greeting := "Xin chào"
	if strings.TrimSpace(name) != "" {
		greeting = "Xin chào " + html.EscapeString(name)
	}
	body := `<p style="margin:0 0 8px;line-height:1.6;color:#334155;">` + greeting + `,</p>
    <p style="margin:0 0 8px;line-height:1.6;color:#334155;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Boko của bạn. Link dưới đây có hiệu lực trong <strong>30 phút</strong> và chỉ dùng được 1 lần.</p>` +
		ctaButton("Đặt lại mật khẩu", resetURL) +
		`<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn an toàn.</p>`

	return SendEmail(to, "[Boko] Đặt lại mật khẩu", emailLayout("Đặt lại mật khẩu", "Yêu cầu đặt lại mật khẩu tài khoản Boko.", body))
}

// SendOrderStatusEmail — email cập nhật trạng thái đơn hàng.
func SendOrderStatusEmail(to, name, subject, heading, intro string, order models.Order, ctaURL string) error {
	greeting := ""
	if strings.TrimSpace(name) != "" {
		greeting = `<p style="margin:0 0 12px;line-height:1.6;color:#334155;">Xin chào ` + html.EscapeString(name) + `,</p>`
	}
	body := greeting + renderOrderTable(order) + ctaButton("Xem đơn hàng", ctaURL)
	return SendEmail(to, subject, emailLayout(heading, intro, body))
}
