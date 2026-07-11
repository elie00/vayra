# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# Pont JS ExoPlayer : la WebView appelle window.HarborExo par réflexion
-keepclassmembers class app.harbor.HarborExoBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.harbor.HarborExoBridge { *; }

# Plugins Tauri Android : classes instanciées par réflexion depuis Rust et
# configs/args désérialisés par Jackson (noms de champs requis). R8 les
# strippait → le plugin deep-link voyait une config mobile vide et ignorait
# les liens harbor:// en release.
-keep class app.tauri.** { *; }
-keepclassmembers class app.tauri.** { *; }
-keep @app.tauri.annotation.TauriPlugin class * { *; }
-keep @app.tauri.annotation.InvokeArg class * { *; }

# Stockage credentials Android Keystore : objet Kotlin appelé uniquement par
# réflexion JNI depuis Rust (settings_store.rs) — sans -keep, R8 le strippe.
-keep class app.harbor.HarborCredentials { *; }
