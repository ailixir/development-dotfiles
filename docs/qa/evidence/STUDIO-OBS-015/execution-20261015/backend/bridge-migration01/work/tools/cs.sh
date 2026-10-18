#!/bin/bash
JH=/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home
CACHE=~/.gradle/caches/modules-2/files-2.1
CP=$CACHE/com.puppycrawl.tools/checkstyle/10.18.1/1dfeadac7e8c600b41a92a3c14345a1a5b8ef780/checkstyle-10.18.1.jar
for g in org.antlr/antlr4-runtime info.picocli/picocli com.google.guava/guava com.google.guava/failureaccess commons-beanutils/commons-beanutils org.apache.commons/commons-lang3 net.sf.saxon/Saxon-HE org.xmlresolver/xmlresolver org.reflections/reflections org.javassist/javassist commons-collections/commons-collections commons-logging/commons-logging commons-codec/commons-codec org.apache.httpcomponents.client5/httpclient5 org.apache.httpcomponents.core5/httpcore5 org.apache.httpcomponents.core5/httpcore5-h2; do
  d=$CACHE/$g; [ -d "$d" ] || continue
  v=$(ls -1 "$d" | sort -V | tail -1)
  for j in "$d/$v"/*/*.jar; do case "$j" in *-sources.jar|*-javadoc.jar) ;; *) CP=$CP:$j;; esac; done
done
CP=$CP:/Users/brunobuger/.gradle/caches/modules-2/files-2.1/org.springframework/spring-jcl/6.1.14/842b2b24a375efd79af436860d22ba4e0082ff4b/spring-jcl-6.1.14.jar
echo "config_loc=$2" > /private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/cs-$$.properties
"$JH/bin/java" -cp "$CP" com.puppycrawl.tools.checkstyle.Main -c "$2/checkstyle.xml" -p /private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/cs-$$.properties "$1"
rm -f /private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/cs-$$.properties
