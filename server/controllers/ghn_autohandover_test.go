package controllers

import "testing"

// TestGhnAutoHandoverEnabled — công tắc GHN_AUTO_HANDOVER.
// Mặc định BẬT; chỉ tắt khi set rõ ràng false/0/no/off.
func TestGhnAutoHandoverEnabled(t *testing.T) {
	cases := map[string]bool{
		"":       true, // mặc định
		"true":   true,
		"1":      true,
		"yes":    true,
		"on":     true,
		"abc":    true, // giá trị lạ -> an toàn, giữ mặc định
		"false":  false,
		"FALSE":  false,
		"0":      false,
		"no":     false,
		"off":    false,
		" false": false, // trim khoảng trắng
	}
	for raw, want := range cases {
		t.Setenv("GHN_AUTO_HANDOVER", raw)
		if got := ghnAutoHandoverEnabled(); got != want {
			t.Fatalf("GHN_AUTO_HANDOVER=%q -> %v, mong đợi %v", raw, got, want)
		}
	}
}
