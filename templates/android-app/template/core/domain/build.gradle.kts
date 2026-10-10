// Kotlin puro (sin Android): contratos de repositorios y casos de uso.
plugins {
    alias(libs.plugins.app.jvm.library)
}

dependencies {
    api(projects.core.model)
    api(libs.kotlinx.coroutines.core)
    // Solo la anotación @Inject (JSR-330, Java puro): Hilt construye los casos de uso.
    implementation(libs.javax.inject)
}
