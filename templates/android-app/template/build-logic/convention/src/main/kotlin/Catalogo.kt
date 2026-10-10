import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.artifacts.MinimalExternalModuleDependency
import org.gradle.api.artifacts.VersionCatalog
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.provider.Provider
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.withType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask
import org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile

// Acceso al catálogo gradle/libs.versions.toml desde los convention plugins.
internal val Project.libs: VersionCatalog
    get() = extensions.getByType<VersionCatalogsExtension>().named("libs")

internal fun VersionCatalog.lib(alias: String): Provider<MinimalExternalModuleDependency> =
    findLibrary(alias).orElseThrow { IllegalArgumentException("No está en libs.versions.toml: $alias") }

internal fun VersionCatalog.versionOf(alias: String): String =
    findVersion(alias).orElseThrow { IllegalArgumentException("Versión no declarada: $alias") }.requiredVersion

// Bytecode Java 17 en todos los módulos (Android y JVM).
internal val JAVA_VERSION = JavaVersion.VERSION_17

internal fun Project.configureKotlin() {
    tasks.withType<KotlinJvmCompile>().configureEach {
        compilerOptions.jvmTarget.set(JvmTarget.JVM_17)
    }
    tasks.withType<KotlinCompilationTask<*>>().configureEach {
        compilerOptions {
            // kotlin.time.Instant / Clock (modelo de dominio).
            optIn.add("kotlin.time.ExperimentalTime")
        }
    }
}
