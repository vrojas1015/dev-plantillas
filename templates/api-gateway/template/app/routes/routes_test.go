package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
)

const valid = `
version: 1
defaults:
  timeout: 8s
  rate_limit: {per_minute: 120, burst: 20}
routes:
  example.v1.ItemService/ListItems:
    public: true
  example.v1.ItemService/GetItem:
    roles: [items.read]
  example.v1.ItemService/CreateItem:
    roles: [items.write]
    timeout: 2s
    max_body_bytes: 1000
    rate_limit: {per_minute: 6}
    sunset: 2030-01-31
  example.v1.ItemService/Internal:
    deny: true
`

func TestParseValido(t *testing.T) {
	tb, err := Parse([]byte(valid))
	if err != nil {
		t.Fatal(err)
	}
	if got := len(tb.Methods()); got != 4 {
		t.Fatalf("Methods = %d", got)
	}
	list := tb.Policy("example.v1.ItemService/ListItems")
	if !list.Public || list.Timeout != 8*time.Second || list.MaxBodyBytes != 1<<20 || list.OwnRateLimit {
		t.Fatalf("defaults mal aplicados: %+v", list)
	}
	create := tb.Policy("example.v1.ItemService/CreateItem")
	if create.Timeout != 2*time.Second || create.MaxBodyBytes != 1000 || !create.OwnRateLimit ||
		create.RateLimit != (Rate{PerMinute: 6, Burst: 20}) || create.Sunset != "2030-01-31" {
		t.Fatalf("overrides mal aplicados: %+v", create)
	}
	if tb.Policy("example.v1.ItemService/Nada") != nil {
		t.Fatal("un método sin entrada tiene que devolver nil (denegado)")
	}
	if tb.Without("example.v1.ItemService/GetItem").Policy("example.v1.ItemService/GetItem") != nil {
		t.Fatal("Without no sacó la ruta")
	}
}

func TestParseInvalido(t *testing.T) {
	cases := map[string]string{
		"campo desconocido (typo)": "routes:\n  a.v1.S/M:\n    role: [x]\n",
		"sin política":             "routes:\n  a.v1.S/M:\n    timeout: 1s\n",
		"public y roles":           "routes:\n  a.v1.S/M:\n    public: true\n    roles: [x]\n",
		"entrada vacía":            "routes:\n  a.v1.S/M:\n",
		"clave mal formada":        "routes:\n  GET /v1/items:\n    public: true\n",
		"timeout inválido":         "routes:\n  a.v1.S/M:\n    public: true\n    timeout: 10\n",
		"timeout enorme":           "routes:\n  a.v1.S/M:\n    public: true\n    timeout: 1h\n",
		"body enorme":              "routes:\n  a.v1.S/M:\n    public: true\n    max_body_bytes: 1073741824\n",
		"rate en cero":             "routes:\n  a.v1.S/M:\n    public: true\n    rate_limit: {per_minute: 0}\n",
		"rol con espacios":         "routes:\n  a.v1.S/M:\n    roles: ['a b']\n",
		"sunset mal":               "routes:\n  a.v1.S/M:\n    public: true\n    sunset: mañana\n",
	}
	for name, body := range cases {
		if _, err := Parse([]byte("version: 1\n" + body)); err == nil {
			t.Errorf("%s: tenía que fallar", name)
		}
	}
	if _, err := Parse([]byte("routes: {}\n")); err == nil || !strings.Contains(err.Error(), "version") {
		t.Errorf("sin version: %v", err)
	}
}

func TestNormalizeYSamplePath(t *testing.T) {
	cases := []struct{ tpl, norm, sample string }{
		{"/v1/items", "/v1/items", "/v1/items"},
		{"/v1/items/{id}", "/v1/items/{id=*}", "/v1/items/x"},
		{"/v1/{name=shelves/*/books/*}", "/v1/{name=shelves/*/books/*}", "/v1/shelves/x/books/x"},
		{"/v1/items/{id}:archive", "/v1/items/{id=*}:archive", "/v1/items/x:archive"},
		{"/v1/files/**", "/v1/files/**", "/v1/files/x"},
	}
	for _, c := range cases {
		b := Binding{Verb: "GET", Template: c.tpl}
		if got := NormalizeTemplate(c.tpl); got != c.norm {
			t.Errorf("Normalize(%q) = %q, esperaba %q", c.tpl, got, c.norm)
		}
		if got := b.SamplePath(); got != c.sample {
			t.Errorf("SamplePath(%q) = %q, esperaba %q", c.tpl, got, c.sample)
		}
	}
}

// TestNormalizeIgualAlMux: la clave de Binding tiene que coincidir con la que
// ve el middleware (runtime.HTTPPattern(ctx).String()) para el mismo template.
func TestNormalizeIgualAlMux(t *testing.T) {
	for _, tpl := range []string{
		"/v1/items", "/v1/items/{id}", "/v1/{name=shelves/*/books/*}",
		"/v1/items/{id}:archive", "/v1/files/**", "/v1/a/{x}/b/{y}",
	} {
		var seen string
		mux := runtime.NewServeMux(runtime.WithMiddlewares(func(next runtime.HandlerFunc) runtime.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request, p map[string]string) {
				if pat, ok := runtime.HTTPPattern(r.Context()); ok {
					seen = pat.String()
				}
				next(w, r, p)
			}
		}))
		if err := mux.HandlePath("GET", tpl, func(http.ResponseWriter, *http.Request, map[string]string) {}); err != nil {
			t.Fatalf("%s: %v", tpl, err)
		}
		b := Binding{Verb: "GET", Template: tpl}
		mux.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", b.SamplePath(), nil))
		if want := NormalizeTemplate(tpl); seen != want {
			t.Errorf("%s: mux ve %q, NormalizeTemplate da %q", tpl, seen, want)
		}
	}
}
