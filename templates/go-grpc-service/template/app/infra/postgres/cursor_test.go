package postgres

import (
	"testing"
	"time"
)

func TestCursorRoundTrip(t *testing.T) {
	in := cursorData{
		CreatedAt: time.Date(2026, 1, 2, 3, 4, 5, 123456789, time.UTC),
		ID:        "0b7e6a8e-6c1f-4c8e-9a51-2f3c4d5e6f70",
	}

	out, err := decodeCursor(encodeCursor(in))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !out.CreatedAt.Equal(in.CreatedAt) || out.ID != in.ID {
		t.Errorf("round trip: got %+v, want %+v", out, in)
	}
}

func TestDecodeCursor_Invalid(t *testing.T) {
	for _, s := range []string{"%%%", "bm9waXBl", "eHx5"} { // basura, "nopipe", "x|y"
		if _, err := decodeCursor(s); err == nil {
			t.Errorf("decodeCursor(%q): expected error", s)
		}
	}
}
