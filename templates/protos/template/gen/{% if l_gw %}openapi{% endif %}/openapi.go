// Package openapi expone el OpenAPI v2 generado desde los .proto
// (api.swagger.json, plugin grpc-ecosystem/openapiv2 con allow_merge). El
// api-gateway lo importa y lo sirve en GET /openapi.json.
//
// Este archivo NO lo genera buf: `make generate` solo reescribe el .json.
package openapi

import _ "embed"

// Spec es el contenido de api.swagger.json.
//
//go:embed api.swagger.json
var Spec []byte
