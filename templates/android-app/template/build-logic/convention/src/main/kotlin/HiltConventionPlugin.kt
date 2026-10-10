import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies

/** Inyección de dependencias con Hilt (procesador por KSP). Aplicar después del plugin Android. */
class HiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.google.devtools.ksp")
        dependencies { add("ksp", libs.lib("hilt-compiler")) }
        listOf("com.android.application", "com.android.library").forEach { id ->
            pluginManager.withPlugin(id) {
                pluginManager.apply("com.google.dagger.hilt.android")
                dependencies { add("implementation", libs.lib("hilt-android")) }
            }
        }
    }
}
