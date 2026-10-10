// Fakes y reglas de test compartidas. Kotlin puro: lo usan los tests de todos los módulos.
plugins {
    alias(libs.plugins.app.jvm.library)
}

dependencies {
    api(projects.core.domain)
    api(libs.kotlinx.coroutines.test)
    api(libs.junit4)
}
