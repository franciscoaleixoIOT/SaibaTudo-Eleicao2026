import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

// Assinatura de release: lida de keystore.properties (NÃO versionado) ou de variáveis de ambiente do CI.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingProp(key: String, env: String): String? =
    (keystoreProps.getProperty(key) ?: System.getenv(env))?.takeIf { it.isNotBlank() }

// Chave PÚBLICA (ECDSA P-256, X.509 Base64) usada para verificar o manifesto de dados assinado.
// É a chave deste projeto (diferente da do app de eleições): pipeline/data_signing_public.b64.
val dataPublicKey: String = rootProject.file("pipeline/data_signing_public.b64")
    .takeIf { it.exists() }?.readText()?.trim().orEmpty()

android {
    namespace = "net.saibatudo.quimica"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "net.saibatudo.quimica"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Endpoints de produção (site /quimica/ hospedado na Vercel, no domínio saibatudo.net)
        val dataBaseUrl = (project.findProperty("dataBaseUrl") as String?)
            ?: "https://saibatudo.net/quimica/data/"
        val apiBaseUrl = (project.findProperty("apiBaseUrl") as String?) ?: "https://saibatudo.net/quimica/api/"
        buildConfigField("String", "DATA_BASE_URL", "\"$dataBaseUrl\"")
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "DATA_PUBLIC_KEY", "\"$dataPublicKey\"")
        buildConfigField("String", "PRIVACY_URL", "\"https://saibatudo.net/quimica/privacidade\"")
        buildConfigField("String", "SOURCE_URL", "\"https://github.com/franciscoaleixoIOT/SaibaTudo-Quimica\"")
    }

    val releaseSigning = signingProp("storeFile", "SAIBATUDO_STORE_FILE")?.let { storePath ->
        signingConfigs.create("release") {
            storeFile = rootProject.file(storePath)
            storePassword = signingProp("storePassword", "SAIBATUDO_STORE_PASSWORD")
            keyAlias = signingProp("keyAlias", "SAIBATUDO_KEY_ALIAS")
            keyPassword = signingProp("keyPassword", "SAIBATUDO_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            optimization {
                enable = true
            }
            ndk {
                debugSymbolLevel = "FULL"
            }
            signingConfig = releaseSigning
        }
    }

    // Pacote de dados embutido (funciona offline desde a 1ª execução). Ordem de preferência:
    //  1. app/src/main/assets/quimica/        (copiado por app/tools/copiar_pacote_para_assets.py)
    //  2. data/quimica/ do repositório        (pacote real publicado pelo pipeline; asset "quimica/…")
    //  3. fixture de testes                   (app/src/test/resources/data-quimica; só para o app abrir antes do pacote real)
    val assetsEmbutidos = file("src/main/assets/quimica/manifest.json").exists()
    val pacoteReal = rootProject.file("data/quimica/manifest.json").exists()
    if (!assetsEmbutidos && !pacoteReal) {
        val fixtureDir = layout.buildDirectory.dir("generated/fixtureAssets")
        val copiarFixture = tasks.register<Sync>("copiarPacoteFixture") {
            from(file("src/test/resources/data-quimica"))
            into(fixtureDir.map { it.dir("quimica") })
        }
        sourceSets.getByName("main").assets.directories.add(fixtureDir.get().asFile.absolutePath)
        tasks.matching { it.name.matches(Regex("(merge|generate|lintVital|lint).*Assets|.*Lint.*|lint.*")) }
            .configureEach { dependsOn(copiarFixture) }
    } else if (!assetsEmbutidos) {
        sourceSets.getByName("main").assets.directories.add(rootProject.file("data").absolutePath)
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)

    // Dados (JSON), rede e persistência
    implementation(libs.gson)
    implementation(libs.okhttp)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)

    // Compose BOM & Core UI
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.gson)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}

// Os testes unitários leem arquivos REAIS fora do módulo (contracts/*.json e o pacote data/quimica, via
// TestSupport.kt). Sem declará-los como entrada, o Gradle marcaria a tarefa UP-TO-DATE e pularia a verificação
// quando só o contrato ou o pacote de dados mudasse.
tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
    inputs.files(rootProject.files("contracts", "data"))
}
