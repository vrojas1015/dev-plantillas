// Package openapi expone el OpenAPI v2 generado desde los .proto
// (api.swagger.json, plugin protoc-gen-openapiv2 con allow_merge). Lo sirve el
// gateway en GET /openapi.json cuando OPENAPI_ENABLED=true.
//
// Este archivo NO lo genera buf: `make proto` solo reescribe el .json.
package openapi

import _ "embed"

// Spec es el contenido de api.swagger.json.
//
//go:embed api.swagger.json
var Spec []byte
