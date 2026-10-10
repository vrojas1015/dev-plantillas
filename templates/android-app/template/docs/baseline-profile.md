# Baseline profile

Un baseline profile le dice a ART qué clases y métodos precompilar al instalar:
el arranque y el primer scroll son más rápidos en release (sin él, ese código
corre interpretado hasta que el JIT lo optimiza).

- `baselineprofile/` tiene el generador (`BaselineProfileGenerator`): un test
  instrumentado que abre la app (agregá los recorridos críticos).
- `app` aplica el plugin `androidx.baselineprofile` y depende de
  `profileinstaller`; el perfil generado se guarda en
  `app/src/<variante>/generated/baselineProfiles/` y **se commitea**.

## Generar (necesita dispositivo)

Un emulador o dispositivo con **API 28+** (en 28–32 tiene que ser rooteado; con
API 33+ no hace falta) conectado por adb:

```bash
./gradlew :app:generateProdReleaseBaselineProfile
```

No corre en el CI de PR (no hay emulador). Regenerarlo cuando cambien los flujos
principales y antes de releases grandes. Macrobenchmark (medir el arranque con y
sin perfil) es opcional: módulo `com.android.test` aparte con
`benchmark-macro-junit4`.
