import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

/** Módulo :app. Flavors, firma y publicación se configuran en app/build.gradle.kts. */
class AndroidApplicationConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.application")
        extensions.configure<ApplicationExtension> {
            compileSdk = libs.versionOf("compileSdk").toInt()
            defaultConfig {
                minSdk = libs.versionOf("minSdk").toInt()
                targetSdk = libs.versionOf("targetSdk").toInt()
                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
            }
            compileOptions {
                sourceCompatibility = JAVA_VERSION
                targetCompatibility = JAVA_VERSION
            }
            testOptions {
                unitTests.isIncludeAndroidResources = true
            }
            lint {
                abortOnError = true
                // Lint de :app revisa también los módulos de los que depende.
                checkDependencies = true
            }
        }
        configureKotlin()
        configureAndroidUnitTests()
        configureQuality()
    }
}
