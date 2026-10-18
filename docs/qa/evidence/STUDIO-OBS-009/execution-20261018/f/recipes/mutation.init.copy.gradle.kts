// Lane F negative control: run the tests against ONE mutated main class without editing the shared
// checkout or its build output. Env: MUT_SRC (a source root holding only the mutated file), MUT_OUT.
gradle.projectsEvaluated {
    rootProject.allprojects {
        if (name == "checks-backend") {
            val mutSrc = file(System.getenv("MUT_SRC"))
            val mutOut = file(System.getenv("MUT_OUT"))
            val sourceSets = extensions.getByType<org.gradle.api.tasks.SourceSetContainer>()
            val main = sourceSets.getByName("main")
            val compileMut = tasks.register<org.gradle.api.tasks.compile.JavaCompile>("compileMutation") {
                source(fileTree(mutSrc) { include("**/*.java") })
                classpath = main.compileClasspath + files(main.output.classesDirs)
                destinationDirectory.set(File(mutOut, "classes"))
                options.compilerArgs.addAll(listOf("-parameters", "-proc:none"))
                dependsOn("classes")
            }
            val swapped = tasks.register<org.gradle.api.tasks.Sync>("mutatedMainClasses") {
                dependsOn(compileMut)
                duplicatesStrategy = DuplicatesStrategy.INCLUDE
                from(main.output.classesDirs)
                from(File(mutOut, "classes"))
                into(File(mutOut, "main"))
            }
            tasks.withType<org.gradle.api.tasks.testing.Test>().configureEach {
                dependsOn(swapped)
                val mainDirs = main.output.classesDirs.files
                classpath = files(File(mutOut, "main")) + classpath.filter { !mainDirs.contains(it) }
            }
        }
    }
}
