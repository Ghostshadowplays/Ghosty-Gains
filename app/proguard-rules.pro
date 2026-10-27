# WebView calls these methods by name rather than through Kotlin references.
# Keep their names and annotations while allowing R8 to optimize the bridge bodies.
-keepclassmembers,allowoptimization class com.ghostygains.app.MainActivity$WebAppInterface {
    @android.webkit.JavascriptInterface public <methods>;
}
-keepattributes RuntimeVisibleAnnotations
