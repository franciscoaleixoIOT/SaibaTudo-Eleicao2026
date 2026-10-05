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
val dataPublicKey: String = rootProject.file("pipeline/data_signing_public.b64")
    .takeIf { it.exists() }?.readText()?.trim().orEmpty()

android {
    namespace = "net.saibatudo.eleicoes2026"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "net.saibatudo.eleicoes2026"
        minSdk = 24
        targetSdk = 37
        versionCode = 3
        versionName = "1.0.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Endpoints de produção (domínio SaibaTudo.Net hospedado na Vercel)
        val dataBaseUrl = (project.findProperty("dataBaseUrl") as String?)
            ?: "https://saibatudo.net/data/eleicoes2026/"
        val apiBaseUrl = (project.findProperty("apiBaseUrl") as String?) ?: "https://saibatudo.net/api/"
        buildConfigField("String", "DATA_BASE_URL", "\"$dataBaseUrl\"")
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "DATA_PUBLIC_KEY", "\"$dataPublicKey\"")
        buildConfigField("String", "PRIVACY_URL", "\"https://saibatudo.net/privacidade\"")
        buildConfigField("String", "SOURCE_URL", "\"https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026\"")
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

    // Snapshot oficial dos dados (pipeline/) empacotado como asset: o app funciona offline desde a 1ª execução
    sourceSets {
        getByName("main") {
            assets.directories.add(rootProject.file("data").absolutePath)
        }
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

    // Dados oficiais TSE 2026 (JSON), fotos oficiais, rede e persistência
    implementation(libs.gson)
    implementation(libs.coil.compose)
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

// Os testes unitários leem arquivos REAIS fora do módulo (contracts/nlu_golden_cases.json e o pacote
// data/eleicoes2026, via TestSupport.kt). Sem declará-los como entrada, o Gradle marca a tarefa
// UP-TO-DATE e pula a verificação quando só o contrato ou o snapshot de dados muda — declarar custa
// pouco (hash de ~26 MB) e evita "BUILD SUCCESSFUL" com testes antigos.
tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
    inputs.files(rootProject.files("contracts", "data"))
}
