import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.withType

/** Módulo de librería Android (core:* con Android, feature:*). */
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.library")
        extensions.configure<LibraryExtension> {
            compileSdk = libs.versionOf("compileSdk").toInt()
            defaultConfig {
                minSdk = libs.versionOf("minSdk").toInt()
                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
            }
            compileOptions {
                sourceCompatibility = JAVA_VERSION
                targetCompatibility = JAVA_VERSION
            }
            testOptions {
                // Robolectric necesita los recursos de Android en los tests de la JVM.
                unitTests.isIncludeAndroidResources = true
            }
            lint {
                abortOnError = true
            }
        }
        configureKotlin()
        configureAndroidUnitTests()
        configureQuality()
    }
}

/** Dependencias de tests de la JVM comunes a los módulos Android (JUnit 4: lo exige Robolectric). */
internal fun Project.configureAndroidUnitTests() {
    tasks.withType<Test>().configureEach {
        // Robolectric (SDK 36+) accede a internals del JDK 21 que el módulo java.base no exporta.
        jvmArgs("--add-opens=java.base/jdk.internal.access=ALL-UNNAMED")
    }
    dependencies {
        add("testImplementation", libs.lib("junit4"))
        add("testImplementation", libs.lib("kotlinx-coroutines-test"))
        add("testImplementation", libs.lib("turbine"))
        add("testImplementation", libs.lib("robolectric"))
        add("testImplementation", libs.lib("androidx-test-core"))
        add("testImplementation", libs.lib("androidx-test-ext-junit"))
    }
}
