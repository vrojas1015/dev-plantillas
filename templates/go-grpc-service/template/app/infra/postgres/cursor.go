package postgres

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// cursorData son los valores del cursor keyset para PKs UUID:
// orden (created_at DESC, id DESC).
type cursorData struct {
	CreatedAt time.Time
	ID        string
}

// encodeCursor codifica un cursorData en un string opaco (base64 URL-safe).
func encodeCursor(c cursorData) string {
	s := fmt.Sprintf("%d|%s", c.CreatedAt.UnixNano(), c.ID)
	return base64.RawURLEncoding.EncodeToString([]byte(s))
}

// decodeCursor decodifica un cursor opaco. Un cursor mal formado es un error
// del cliente: el repo lo traduce a ValidationError.
func decodeCursor(s string) (cursorData, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return cursorData{}, fmt.Errorf("invalid cursor encoding: %w", err)
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 || parts[1] == "" {
		return cursorData{}, errors.New("invalid cursor format")
	}
	ns, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return cursorData{}, fmt.Errorf("invalid cursor timestamp: %w", err)
	}
	return cursorData{
		CreatedAt: time.Unix(0, ns).UTC(),
		ID:        parts[1],
	}, nil
}
