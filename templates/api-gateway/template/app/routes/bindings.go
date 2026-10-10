package routes

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"google.golang.org/genproto/googleapis/api/annotations"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
)

// Binding es una ruta HTTP que grpc-gateway registra para un método gRPC
// (sale de la anotación google.api.http del .proto, incluidas las
// additional_bindings).
type Binding struct {
	Method   string // example.v1.ItemService/GetItem
	Verb     string // GET, POST, ...
	Template string // tal cual en el .proto: /v1/items/{id}
	Body     string // "*", un campo o ""
}

// Key identifica la ruta igual que runtime.Pattern.String() del mux de
// grpc-gateway: "GET /v1/items/{id=*}". Es lo que usa el middleware de rutas
// para saber qué método gRPC atiende el request.
func (b Binding) Key() string {
	return b.Verb + " " + NormalizeTemplate(b.Template)
}

// varRe: {campo} sin "=..." (equivale a {campo=*}).
var varRe = regexp.MustCompile(`\{([A-Za-z_][A-Za-z0-9_.]*)\}`)

// NormalizeTemplate lleva un template de google.api.http a la forma de
// runtime.Pattern.String(): {id} -> {id=*}. Los segmentos literales, *, ** y
// {campo=a/*} quedan igual; el verbo final (":cancel") también.
func NormalizeTemplate(tpl string) string {
	return varRe.ReplaceAllString(tpl, "{$1=*}")
}

// BindingsFor lee del registro global de protobuf (lo llenan los paquetes
// generados al importarse) las rutas HTTP de los servicios indicados.
func BindingsFor(services []string) ([]Binding, error) {
	var out []Binding
	for _, svc := range services {
		d, err := protoregistry.GlobalFiles.FindDescriptorByName(protoreflect.FullName(svc))
		if err != nil {
			return nil, fmt.Errorf("servicio %s no registrado (¿falta importar su paquete generado?): %w", svc, err)
		}
		sd, ok := d.(protoreflect.ServiceDescriptor)
		if !ok {
			return nil, fmt.Errorf("%s no es un servicio", svc)
		}
		methods := sd.Methods()
		for i := 0; i < methods.Len(); i++ {
			m := methods.Get(i)
			name := svc + "/" + string(m.Name())
			opts := m.Options()
			if opts == nil || !proto.HasExtension(opts, annotations.E_Http) {
				continue
			}
			rule, _ := proto.GetExtension(opts, annotations.E_Http).(*annotations.HttpRule)
			if rule == nil {
				continue
			}
			bs, err := fromRule(name, rule)
			if err != nil {
				return nil, err
			}
			out = append(out, bs...)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key() < out[j].Key() })
	return out, nil
}

func fromRule(method string, rule *annotations.HttpRule) ([]Binding, error) {
	var verb, tpl string
	switch p := rule.GetPattern().(type) {
	case *annotations.HttpRule_Get:
		verb, tpl = http.MethodGet, p.Get
	case *annotations.HttpRule_Post:
		verb, tpl = http.MethodPost, p.Post
	case *annotations.HttpRule_Put:
		verb, tpl = http.MethodPut, p.Put
	case *annotations.HttpRule_Patch:
		verb, tpl = http.MethodPatch, p.Patch
	case *annotations.HttpRule_Delete:
		verb, tpl = http.MethodDelete, p.Delete
	case *annotations.HttpRule_Custom:
		verb, tpl = strings.ToUpper(p.Custom.GetKind()), p.Custom.GetPath()
	default:
		return nil, fmt.Errorf("%s: google.api.http sin verbo", method)
	}
	if !strings.HasPrefix(tpl, "/") {
		return nil, fmt.Errorf("%s: el path %q tiene que empezar con /", method, tpl)
	}
	out := []Binding{{Method: method, Verb: verb, Template: tpl, Body: rule.GetBody()}}
	for _, extra := range rule.GetAdditionalBindings() {
		bs, err := fromRule(method, extra)
		if err != nil {
			return nil, err
		}
		out = append(out, bs...)
	}
	return out, nil
}

// SamplePath arma un path concreto que matchea el template (para los tests
// generados desde la tabla de rutas): cada variable o comodín pasa a "x".
func (b Binding) SamplePath() string {
	tpl := b.Template
	verb := ""
	if i := strings.LastIndex(tpl, ":"); i > strings.LastIndex(tpl, "}") && i > strings.LastIndex(tpl, "/") {
		tpl, verb = tpl[:i], tpl[i:]
	}
	var sb strings.Builder
	for i := 0; i < len(tpl); i++ {
		c := tpl[i]
		switch c {
		case '{':
			end := strings.IndexByte(tpl[i:], '}')
			inner := tpl[i+1 : i+end]
			if _, sub, ok := strings.Cut(inner, "="); ok {
				sb.WriteString(strings.NewReplacer("**", "x", "*", "x").Replace(sub))
			} else {
				sb.WriteString("x")
			}
			i += end
		case '*':
			sb.WriteString("x")
			if i+1 < len(tpl) && tpl[i+1] == '*' {
				i++
			}
		default:
			sb.WriteByte(c)
		}
	}
	return sb.String() + verb
}
