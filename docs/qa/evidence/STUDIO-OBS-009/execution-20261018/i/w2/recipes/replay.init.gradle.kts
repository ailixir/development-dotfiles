allprojects {
    afterEvaluate {
        if (plugins.hasPlugin("java")) {
            extensions.configure<org.gradle.api.tasks.SourceSetContainer>("sourceSets") {
                named("test") {
                    java.exclude("**/guided/publication/GuidedPublicationReplayIT.java")
                    java.srcDir(file("/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/dex-w2-i/replay-src"))
                }
            }
        }
    }
}
