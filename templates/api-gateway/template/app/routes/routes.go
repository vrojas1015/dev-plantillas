// Package routes carga y valida routes.yaml: la tabla de autorización por
// ruta del gateway. Regla base: DENEGAR POR DEFECTO. Un método gRPC que no
// figura en la tabla no se expone (404), aunque tenga anotación google.api.http.
package routes

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
)

// Límites duros: un typo en routes.yaml no puede abrir la puerta a bodies de
// 1 GB ni a timeouts de una hora.
const (
	maxBodyCeiling  = 32 << 20 // 32 MiB
	maxTimeout      = 5 * time.Minute
	defaultBody     = 1 << 20 // 1 MiB
	defaultTimeout  = 10 * time.Second
	defaultPerMin   = 600
	defaultBurst    = 100
	maxRolesPerRule = 32
)

// methodRe: "<paquete>.<Servicio>/<Método>", p. ej. example.v1.ItemService/GetItem.
var methodRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+/[A-Za-z_][A-Za-z0-9_]*$`)

// roleRe: roles/scopes legibles; nada de espacios ni comas (viajan en x-roles).
var roleRe = regexp.MustCompile(`^[A-Za-z0-9_.:/-]{1,64}$`)

// Rate es un token bucket: PerMinute fichas por minuto, ráfaga de Burst.
type Rate struct {
	PerMinute int `yaml:"per_minute"`
	Burst     int `yaml:"burst"`
}

// Policy es la política efectiva de un método (defaults ya aplicados).
type Policy struct {
	Method       string        // example.v1.ItemService/GetItem
	Public       bool          // no requiere credenciales
	Roles        []string      // alcanza con UNO (roles del JWT o scopes de la API key)
	Deny         bool          // declarada pero cerrada a propósito (404)
	Timeout      time.Duration // deadline de la llamada gRPC
	MaxBodyBytes int64         // 413 por encima
	RateLimit    Rate          // límite efectivo
	OwnRateLimit bool          // true: bucket propio de la ruta; false: bucket global
	Sunset       string        // si no está vacío, cabeceras Deprecation + Sunset
}

// Table es routes.yaml ya validado.
type Table struct {
	Defaults Policy
	policies map[string]*Policy
}

// Policy devuelve la política del método o nil si no está declarado.
func (t *Table) Policy(method string) *Policy {
	return t.policies[method]
}

// Methods devuelve los métodos declarados, ordenados.
func (t *Table) Methods() []string {
	out := make([]string, 0, len(t.policies))
	for m := range t.policies {
		out = append(out, m)
	}
	sort.Strings(out)
	return out
}

// Without devuelve una copia sin el método (lo usan los tests de "ruta sin declarar").
func (t *Table) Without(method string) *Table {
	cp := &Table{Defaults: t.Defaults, policies: make(map[string]*Policy, len(t.policies))}
	for k, v := range t.policies {
		if k != method {
			cp.policies[k] = v
		}
	}
	return cp
}

// ---------------------------------------------------------------------------
// Formato del archivo
// ---------------------------------------------------------------------------

type fileRate struct {
	PerMinute *int `yaml:"per_minute"`
	Burst     *int `yaml:"burst"`
}

type fileRoute struct {
	Public       bool      `yaml:"public"`
	Roles        []string  `yaml:"roles"`
	Deny         bool      `yaml:"deny"`
	Timeout      string    `yaml:"timeout"`
	MaxBodyBytes *int64    `yaml:"max_body_bytes"`
	RateLimit    *fileRate `yaml:"rate_limit"`
	Sunset       string    `yaml:"sunset"`
}

type fileDefaults struct {
	Timeout      string    `yaml:"timeout"`
	MaxBodyBytes *int64    `yaml:"max_body_bytes"`
	RateLimit    *fileRate `yaml:"rate_limit"`
}

type file struct {
	Version  int                   `yaml:"version"`
	Defaults fileDefaults          `yaml:"defaults"`
	Routes   map[string]*fileRoute `yaml:"routes"`
}

// Load lee y valida routes.yaml.
func Load(path string) (*Table, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("leyendo %s: %w", path, err)
	}
	t, err := Parse(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return t, nil
}

// Parse valida el contenido de routes.yaml. Campos desconocidos son error: un
// "role:" mal escrito no puede convertirse en una ruta sin protección.
func Parse(data []byte) (*Table, error) {
	var f file
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(&f); err != nil {
		return nil, fmt.Errorf("YAML inválido: %w", err)
	}
	if f.Version != 1 {
		return nil, fmt.Errorf("version: se esperaba 1, vino %d", f.Version)
	}

	def := Policy{
		Timeout:      defaultTimeout,
		MaxBodyBytes: defaultBody,
		RateLimit:    Rate{PerMinute: defaultPerMin, Burst: defaultBurst},
	}
	if err := applyCommon(&def, f.Defaults.Timeout, f.Defaults.MaxBodyBytes, f.Defaults.RateLimit, "defaults"); err != nil {
		return nil, err
	}

	t := &Table{Defaults: def, policies: make(map[string]*Policy, len(f.Routes))}
	var errs []error
	for method, r := range f.Routes {
		p, err := buildPolicy(def, method, r)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		t.policies[method] = p
	}
	if len(errs) > 0 {
		sort.Slice(errs, func(i, j int) bool { return errs[i].Error() < errs[j].Error() })
		return nil, errors.Join(errs...)
	}
	return t, nil
}

func buildPolicy(def Policy, method string, r *fileRoute) (*Policy, error) {
	if !methodRe.MatchString(method) {
		return nil, fmt.Errorf("ruta %q: se esperaba <paquete>.<Servicio>/<Método>", method)
	}
	if r == nil {
		return nil, fmt.Errorf("ruta %q: vacía; declarar public: true, roles: [...] o deny: true", method)
	}
	kinds := 0
	if r.Public {
		kinds++
	}
	if len(r.Roles) > 0 {
		kinds++
	}
	if r.Deny {
		kinds++
	}
	if kinds != 1 {
		return nil, fmt.Errorf("ruta %q: exactamente una de public: true, roles: [...] o deny: true", method)
	}
	if len(r.Roles) > maxRolesPerRule {
		return nil, fmt.Errorf("ruta %q: demasiados roles (máx. %d)", method, maxRolesPerRule)
	}
	for _, role := range r.Roles {
		if !roleRe.MatchString(role) {
			return nil, fmt.Errorf("ruta %q: rol inválido %q", method, role)
		}
	}
	p := def
	p.Method = method
	p.Public = r.Public
	p.Roles = append([]string(nil), r.Roles...)
	p.Deny = r.Deny
	p.OwnRateLimit = r.RateLimit != nil
	if err := applyCommon(&p, r.Timeout, r.MaxBodyBytes, r.RateLimit, "ruta "+method); err != nil {
		return nil, err
	}
	if r.Sunset != "" {
		if _, err := time.Parse("2006-01-02", r.Sunset); err != nil {
			return nil, fmt.Errorf("ruta %q: sunset con formato AAAA-MM-DD", method)
		}
		p.Sunset = r.Sunset
	}
	return &p, nil
}

func applyCommon(p *Policy, timeout string, body *int64, rate *fileRate, where string) error {
	if timeout != "" {
		d, err := time.ParseDuration(timeout)
		if err != nil || d <= 0 || d > maxTimeout {
			return fmt.Errorf("%s: timeout %q inválido (duración Go entre 1ms y %s)", where, timeout, maxTimeout)
		}
		p.Timeout = d
	}
	if body != nil {
		if *body <= 0 || *body > maxBodyCeiling {
			return fmt.Errorf("%s: max_body_bytes fuera de rango (1..%d)", where, maxBodyCeiling)
		}
		p.MaxBodyBytes = *body
	}
	if rate != nil {
		if rate.PerMinute != nil {
			p.RateLimit.PerMinute = *rate.PerMinute
		}
		if rate.Burst != nil {
			p.RateLimit.Burst = *rate.Burst
		}
		if p.RateLimit.PerMinute <= 0 || p.RateLimit.Burst <= 0 {
			return fmt.Errorf("%s: rate_limit.per_minute y rate_limit.burst tienen que ser > 0", where)
		}
	}
	return nil
}

// ServiceOf devuelve el servicio gRPC de un método ("example.v1.ItemService").
func ServiceOf(method string) string {
	s, _, _ := strings.Cut(method, "/")
	return s
}
