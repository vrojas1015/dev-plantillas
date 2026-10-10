package ratelimit

import (
	"testing"
	"time"
)

func TestMemoryTokenBucket(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	m := NewMemory(0).WithClock(func() time.Time { return now })
	rate := Rate{PerMinute: 60, Burst: 3} // 1 ficha por segundo

	for i := 0; i < 3; i++ {
		if d := m.Allow("u1", rate); !d.Allowed {
			t.Fatalf("request %d: esperaba permitido", i+1)
		}
	}
	d := m.Allow("u1", rate)
	if d.Allowed {
		t.Fatal("el 4to request de la ráfaga tenía que rechazarse")
	}
	if d.RetryAfter <= 0 || d.RetryAfter > time.Second {
		t.Fatalf("RetryAfter = %v, esperaba (0, 1s]", d.RetryAfter)
	}
	if d.Remaining != 0 || d.Limit != 3 {
		t.Fatalf("Remaining/Limit = %d/%d", d.Remaining, d.Limit)
	}

	// Otra clave no comparte bucket.
	if !m.Allow("u2", rate).Allowed {
		t.Fatal("u2 no tenía que verse afectado por u1")
	}

	// Recarga: 1 s después hay una ficha.
	now = now.Add(time.Second)
	if !m.Allow("u1", rate).Allowed {
		t.Fatal("después de 1s tenía que haber una ficha")
	}
}

func TestMemorySweepAndOverflow(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	m := NewMemory(2).WithClock(func() time.Time { return now })
	rate := Rate{PerMinute: 60, Burst: 1}

	m.Allow("a", rate)
	m.Allow("b", rate)
	// Tercera clave: va al bucket de overflow (no crece el mapa sin límite).
	if !m.Allow("c", rate).Allowed {
		t.Fatal("overflow arranca lleno")
	}
	if m.Allow("d", rate).Allowed {
		t.Fatal("d comparte el bucket de overflow con c: tenía que rechazarse")
	}
	if got := m.Len(); got != 3 {
		t.Fatalf("Len = %d, esperaba 3 (a, b, overflow)", got)
	}

	now = now.Add(time.Minute)
	m.Sweep()
	if got := m.Len(); got != 0 {
		t.Fatalf("Sweep tenía que borrar los buckets llenos; quedan %d", got)
	}
}
