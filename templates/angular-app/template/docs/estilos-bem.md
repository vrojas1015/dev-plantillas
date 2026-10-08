# Estilos: SCSS + BEM

## Capas

| Dónde | Qué |
|---|---|
| `src/styles/_tokens.scss` | Variables CSS (`--color-*`, `--space-*`, `--radius-*`…). Única fuente de valores. |
| `src/styles/_reset.scss`, `_typography.scss` | Base global mínima. |
| `src/styles/_mixins.scss` | Mixins compartidos (`@use 'mixins' as m;`). |
| `src/styles/_utilities.scss` | Muy pocas utilidades globales, prefijo `u-`. |
| `<componente>.scss` | Todo lo demás. Encapsulado por Angular. |

`src/styles` está en `includePaths`, así que desde cualquier componente se importa
con `@use 'mixins' as m;` sin rutas relativas.

## BEM

- **Bloque** = el componente: `.item-list`. Un bloque por archivo `.scss`.
- **Elemento** = parte del bloque: `.item-list__row`, `.item-list__badge`.
- **Modificador** = variante o estado: `.item-list__badge--archived`, `.ui-button--primary`.

```scss
.item-list {
  &__row { ... }
  &__badge {
    ...
    &--archived { ... }
  }
}
```

## Reglas

1. Nada de hex, px de color ni tamaños mágicos: `var(--token)`. Si falta un token, se agrega
   en `_tokens.scss`.
2. Sin anidar elementos dentro de elementos (`.a__b__c` no existe): si hace falta, es otro bloque
   o un componente nuevo.
3. Sin selectores de etiqueta ni de id para estilar (`.item-list li` no; `.item-list__row` sí).
4. Componentes de `ui/` usan el prefijo `ui-` (`.ui-button`); los de features/layout, el nombre
   del componente (`.item-list`, `.shell`).
5. Estados con modificadores o atributos (`--active`, `:disabled`, `[aria-busy]`), no con clases
   sueltas tipo `.active`.
6. `::ng-deep` prohibido. Si un hijo necesita variantes, se le agrega un input.
