package controllers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// GoogleAuth phải từ chối khi thiếu access_token (không chạm DB/Google).
func TestGoogleAuth_MissingToken(t *testing.T) {
	r := newTestRouter(func(r *gin.Engine) { r.POST("/api/auth/google", GoogleAuth) })

	cases := []string{`{}`, `{"access_token":""}`, `{"access_token":"   "}`}
	for _, body := range cases {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/auth/google", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("body %s: mong 400, nhận %d", body, w.Code)
		}
	}
}
