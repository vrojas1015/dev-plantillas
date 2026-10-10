// Package ratelimit implementa el rate limit del gateway: token bucket por
// clave (usuario autenticado o, si no hay, IP del cliente).
//
// Fase 1: solo almacenamiento en memoria (una instancia). Con varias
// instancias (Cloud Run escala) cada una cuenta por separado: el límite real
// es límite × instancias. La fase 3 agrega un Limiter sobre Redis con la misma
// interfaz (ver README de la plantilla y docs/rate-limit.md).
package ratelimit

import (
	"context"
	"math"
	"sync"
	"time"
)

// Rate es un token bucket: PerMinute fichas por minuto y ráfaga de Burst.
type Rate struct {
	PerMinute int
	Burst     int
}

// Decision es el resultado de pedir una ficha.
type Decision struct {
	Allowed    bool
	Limit      int           // capacidad del bucket (RateLimit-Limit)
	Remaining  int           // fichas que quedan (RateLimit-Remaining)
	Reset      time.Duration // hasta tener el bucket lleno (RateLimit-Reset)
	RetryAfter time.Duration // solo si !Allowed: hasta la próxima ficha
}

// Limiter decide si un request con esa clave puede pasar.
type Limiter interface {
	Allow(key string, rate Rate) Decision
}

// Memory es un Limiter en memoria del proceso.
type Memory struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	now     func() time.Time
	maxKeys int
}

type bucket struct {
	tokens float64
	last   time.Time
	rate   Rate
}

// overflowKey agrupa las claves nuevas cuando se llega a maxKeys: alguien
// rotando IPs no puede hacer crecer la memoria sin límite ni esquivar el
// límite (comparten un único bucket).
const overflowKey = "\x00overflow"

// NewMemory crea el limiter. maxKeys <= 0 usa 100.000.
func NewMemory(maxKeys int) *Memory {
	if maxKeys <= 0 {
		maxKeys = 100_000
	}
	return &Memory{buckets: make(map[string]*bucket), now: time.Now, maxKeys: maxKeys}
}

// WithClock reemplaza el reloj (tests).
func (m *Memory) WithClock(now func() time.Time) *Memory {
	m.now = now
	return m
}

// Allow consume una ficha si hay.
func (m *Memory) Allow(key string, rate Rate) Decision {
	if rate.PerMinute <= 0 || rate.Burst <= 0 {
		return Decision{Allowed: true}
	}
	perSec := float64(rate.PerMinute) / 60
	now := m.now()

	m.mu.Lock()
	defer m.mu.Unlock()

	b, ok := m.buckets[key]
	if !ok {
		if len(m.buckets) >= m.maxKeys {
			key = overflowKey
			b = m.buckets[key]
		}
		if b == nil {
			b = &bucket{tokens: float64(rate.Burst), last: now, rate: rate}
			m.buckets[key] = b
		}
	}
	// Recargar según el tiempo transcurrido.
	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens = math.Min(float64(rate.Burst), b.tokens+elapsed*perSec)
		b.last = now
	}
	b.rate = rate

	d := Decision{Limit: rate.Burst}
	if b.tokens >= 1 {
		b.tokens--
		d.Allowed = true
	} else {
		d.RetryAfter = seconds((1 - b.tokens) / perSec)
	}
	d.Remaining = int(math.Floor(b.tokens))
	d.Reset = seconds((float64(rate.Burst) - b.tokens) / perSec)
	return d
}

// Sweep borra los buckets llenos (inactivos): no aportan nada y ocupan memoria.
func (m *Memory) Sweep() {
	now := m.now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, b := range m.buckets {
		perSec := float64(b.rate.PerMinute) / 60
		if b.tokens+now.Sub(b.last).Seconds()*perSec >= float64(b.rate.Burst) {
			delete(m.buckets, k)
		}
	}
}

// Run barre periódicamente hasta que ctx termine.
func (m *Memory) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.Sweep()
		}
	}
}

// Len devuelve la cantidad de buckets (tests y métricas).
func (m *Memory) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.buckets)
}

func seconds(s float64) time.Duration {
	if s <= 0 {
		return 0
	}
	return time.Duration(math.Ceil(s * float64(time.Second)))
}
