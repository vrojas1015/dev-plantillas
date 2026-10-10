import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.result.ResolvedComponentResult
import org.gradle.api.artifacts.result.ResolvedDependencyResult
import org.gradle.api.artifacts.result.UnresolvedDependencyResult
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.testing.Test
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.register
import org.gradle.kotlin.dsl.withType
import org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension

/**
 * Módulo Kotlin puro (kotlin("jvm"), sin Android): core:model y core:domain.
 * Son los candidatos al módulo compartido de Kotlin Multiplatform (docs/kmp.md).
 *
 * - Tests con kotlin.test sobre JUnit 5 (lo mismo que se usa después en KMP).
 * - `verificarKotlinPuro` falla si el classpath trae algo de Android; corre
 *   antes de compilar, con `check` y con `testDebugUnitTest`.
 */
class JvmLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("org.jetbrains.kotlin.jvm")
        extensions.configure<JavaPluginExtension> {
            sourceCompatibility = JAVA_VERSION
            targetCompatibility = JAVA_VERSION
        }
        extensions.configure<KotlinJvmProjectExtension> {
            compilerOptions.freeCompilerArgs.add("-Xjdk-release=17")
        }
        configureKotlin()
        dependencies {
            add("testImplementation", platform(libs.lib("junit5-bom")))
            add("testImplementation", libs.lib("junit5-jupiter"))
            add("testImplementation", libs.lib("kotlin-test"))
            add("testImplementation", libs.lib("kotlinx-coroutines-test"))
            add("testImplementation", libs.lib("turbine"))
            add("testRuntimeOnly", libs.lib("junit5-platform-launcher"))
        }
        tasks.withType<Test>().configureEach { useJUnitPlatform() }

        val modulePath = path
        val verificar = tasks.register<VerificarKotlinPuro>("verificarKotlinPuro") {
            group = "verification"
            description = "Falla si este módulo depende de Android (tiene que ser Kotlin puro)."
            modulo.set(modulePath)
            listOf("compileClasspath", "runtimeClasspath", "testCompileClasspath").forEach { nombre ->
                dependencias.addAll(
                    configurations.named(nombre).flatMap { c ->
                        c.incoming.resolutionResult.rootComponent.map { raiz -> recorrer(raiz) }
                    },
                )
            }
        }
        tasks.named("compileKotlin") { dependsOn(verificar) }
        tasks.named("check") { dependsOn(verificar) }
        // Mismo comando que en los módulos Android: ./gradlew testDebugUnitTest
        tasks.register("testDebugUnitTest") {
            group = "verification"
            description = "Alias de test + verificarKotlinPuro (los módulos Android usan este nombre)."
            dependsOn("test", verificar)
        }
        configureQuality()
    }
}

/** Lista "grupo:nombre" de todo el grafo; las dependencias no resolubles van con prefijo "?". */
private fun recorrer(raiz: ResolvedComponentResult): List<String> {
    val vistos = mutableSetOf<ResolvedComponentResult>()
    val salida = mutableListOf<String>()
    val pendientes = ArrayDeque(listOf(raiz))
    while (pendientes.isNotEmpty()) {
        val actual = pendientes.removeFirst()
        if (!vistos.add(actual)) continue
        actual.dependencies.forEach { dep ->
            when (dep) {
                is ResolvedDependencyResult -> {
                    val id = dep.selected.moduleVersion
                    if (id != null) salida += "${id.group}:${id.name}"
                    pendientes += dep.selected
                }
                is UnresolvedDependencyResult -> salida += "?${dep.requested.displayName}"
            }
        }
    }
    return salida.distinct()
}

abstract class VerificarKotlinPuro : DefaultTask() {
    @get:Input abstract val modulo: Property<String>

    @get:Input abstract val dependencias: ListProperty<String>

    @TaskAction
    fun verificar() {
        val prohibidas = dependencias.get().filter { esAndroid(it) }.distinct()
        if (prohibidas.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("${modulo.get()} tiene que ser Kotlin puro (sin Android) y depende de:")
                    prohibidas.forEach { appendLine("  - ${it.removePrefix("?")}") }
                    append("Mové ese código a un módulo Android (core:data, core:network...) ")
                    append("y dejá acá solo modelos e interfaces. Ver CLAUDE.md y docs/kmp.md.")
                },
            )
        }
    }

    private fun esAndroid(dep: String): Boolean {
        // Una dependencia que no resuelve en un módulo JVM suele ser un AAR o un módulo Android.
        if (dep.startsWith("?")) return true
        val grupo = dep.substringBefore(':')
        val nombre = dep.substringAfter(':')
        // androidx.annotation y androidx.collection son multiplataforma (jar JVM): permitidos.
        val permitidos = setOf("androidx.annotation", "androidx.collection")
        return grupo !in permitidos && (
            grupo.startsWith("androidx.") ||
                grupo == "android" ||
                grupo.startsWith("com.android") ||
                grupo.startsWith("com.google.android") ||
                grupo.startsWith("com.google.firebase") ||
                nombre == "hilt-android" ||
                nombre.startsWith("kotlinx-coroutines-android")
            )
    }
}
