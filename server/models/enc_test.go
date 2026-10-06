package models

import "testing"

func TestEncryptedStringRoundtrip(t *testing.T) {
	es := EncryptedString("123 Đường Lê Lợi, Quận 1, TP.HCM")
	v, err := es.Value()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("encrypted: %v", v)
	var back EncryptedString
	if err := back.Scan(v); err != nil {
		t.Fatal(err)
	}
	if string(back) != string(es) {
		t.Fatalf("mismatch: %q", back)
	}
}
