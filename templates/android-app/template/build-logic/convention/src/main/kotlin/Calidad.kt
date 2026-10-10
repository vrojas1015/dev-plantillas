import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.extensions.DetektExtension
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.withType
import org.jlleitschuh.gradle.ktlint.KtlintExtension

/**
 * ktlint (formato, con las reglas de Compose) + detekt (análisis estático) en
 * cada módulo. Android Lint lo agrega AGP. Sin baselines: el proyecto arranca
 * limpio y se mantiene así (CLAUDE.md).
 */
internal fun Project.configureQuality() {
    pluginManager.apply("org.jlleitschuh.gradle.ktlint")
    extensions.configure<KtlintExtension> {
        version.set(libs.versionOf("ktlint"))
        filter {
            // Código generado (KSP, BuildConfig): no es nuestro.
            exclude { it.file.path.replace('\\', '/').contains("/build/") }
        }
    }
    dependencies {
        add("ktlintRuleset", libs.lib("compose-rules-ktlint"))
    }

    pluginManager.apply("io.gitlab.arturbosch.detekt")
    extensions.configure<DetektExtension> {
        buildUponDefaultConfig = true
        parallel = true
        config.setFrom(isolated.rootProject.projectDirectory.file("config/detekt/detekt.yml"))
        source.setFrom(
            "src/main/kotlin",
            "src/test/kotlin",
            "src/debug/kotlin",
            "src/release/kotlin",
            "src/androidTest/kotlin",
        )
    }
    // detekt 1.23 trae su propio compilador (Kotlin 2.0.21): el plugin de Kotlin
    // del proyecto no tiene que "alinear" su versión, o detekt no arranca.
    configurations.matching { it.name == "detekt" }.configureEach {
        resolutionStrategy.eachDependency {
            if (requested.group == "org.jetbrains.kotlin") useVersion(DETEKT_KOTLIN)
        }
    }
    tasks.withType<Detekt>().configureEach {
        jvmTarget = "17"
        reports {
            html.required.set(true)
            sarif.required.set(false)
            txt.required.set(false)
            xml.required.set(false)
            md.required.set(false)
        }
    }
}

private const val DETEKT_KOTLIN = "2.0.21"
